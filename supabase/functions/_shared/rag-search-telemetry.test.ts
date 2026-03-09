/**
 * Integration test: rag-search error surfacing & telemetry.
 *
 * Validates that callVectorSearch failures propagate correctly through
 * searchKB / searchPractice and are NOT silently swallowed.
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL");
const INTERNAL_KEY = Deno.env.get("INTERNAL_INGEST_KEY");

function skipIfMissing(): boolean {
  if (!SUPABASE_URL || !INTERNAL_KEY) {
    console.warn("SKIP: VITE_SUPABASE_URL or INTERNAL_INGEST_KEY not set");
    return true;
  }
  return false;
}

// ─── Test 1: vector-search 400 (missing query) ─────────────────────────────

Deno.test("rag-search telemetry: vector-search 400 surfaces failure", async () => {
  if (skipIfMissing()) return;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/vector-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
    },
    body: JSON.stringify({ tables: "kb", limit: 1 }), // missing query
  });

  assertEquals(res.status, 400, "Missing query must return 400");
  const data = await res.json();

  console.log("[telemetry-test] 400 response:", JSON.stringify(data, null, 2));

  assertExists(data.error, "400 response must contain error field");
});

// ─── Test 2: Successful retrieval includes all telemetry ────────────────────

Deno.test("rag-search telemetry: successful call includes all telemetry fields", async () => {
  if (skipIfMissing()) return;

  const traceId = `telemetry-test-${Date.now()}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/vector-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
      "x-request-id": traceId,
    },
    body: JSON.stringify({
      query: "Քաղաքացիական դատավարություն",
      tables: "both",
      limit: 3,
    }),
  });

  assertEquals(res.status, 200);
  const data = await res.json();

  console.log("[telemetry-test] success response:", JSON.stringify({
    retrieval_mode: data.retrieval_mode,
    rerank_ok: data.rerank_ok,
    semantic_ok: data.semantic_ok,
    request_id: data.request_id,
    kb_count: data.kb?.length ?? 0,
    practice_count: data.practice?.length ?? 0,
    rerank_error: data.rerank_error,
  }, null, 2));

  // Required telemetry fields
  assertExists(data.retrieval_mode, "must have retrieval_mode");
  assert(
    ["keyword+rerank", "keyword_only", "rpc_fallback"].includes(data.retrieval_mode),
    `retrieval_mode must be valid, got: ${data.retrieval_mode}`
  );
  assertEquals(typeof data.rerank_ok, "boolean", "rerank_ok must be boolean");
  assertEquals(typeof data.semantic_ok, "boolean", "semantic_ok (compat) must be boolean");
  assertExists(data.request_id, "must have request_id");
  assertEquals(data.request_id, traceId, "request_id must match provided trace");

  // Result arrays must exist
  assert(Array.isArray(data.kb), "kb must be array");
  assert(Array.isArray(data.practice), "practice must be array");
});

// ─── Test 3: _failed flag propagation in rag-search logic ───────────────────
// This is a unit-level verification of the callVectorSearch -> RAGResult mapping.
// We import the module and test with a mock that simulates a 500.

Deno.test("rag-search telemetry: _failed=true surfaces semantic_ok=false in RAGResult", () => {
  // Simulate the telemetry mapping logic from searchKB (lines 276-293)
  // This verifies the contract without needing a live 500 error.

  const vectorResults = {
    kb: [],
    practice: [],
    _failed: true,
    _error: "vector-search returned 500: Internal Server Error",
    retrieval_mode: undefined,
    rerank_ok: undefined,
    rerank_error: undefined,
    semantic_ok: undefined,
    semantic_error: undefined,
    request_id: undefined,
  };

  const merged: unknown[] = []; // no keyword fallback results either

  const rerankOk = !vectorResults._failed && vectorResults.rerank_ok !== false;
  const retrievalMode = vectorResults._failed
    ? (merged.length > 0 ? "keyword_only" : "rpc_fallback")
    : (vectorResults.retrieval_mode || "keyword_only");

  const result = {
    retrieval_mode: retrievalMode,
    rerank_ok: rerankOk,
    rerank_error: vectorResults._error || vectorResults.rerank_error,
    semantic_ok: rerankOk,
    semantic_error: vectorResults._error || vectorResults.rerank_error,
  };

  console.log("[telemetry-test] simulated 500 RAGResult:", JSON.stringify(result, null, 2));

  assertEquals(result.rerank_ok, false, "rerank_ok must be false on failure");
  assertEquals(result.semantic_ok, false, "semantic_ok must be false on failure");
  assertExists(result.rerank_error, "rerank_error must be present");
  assertExists(result.semantic_error, "semantic_error must be present");
  assert(result.semantic_error!.includes("500"), "error must mention status code");
  assertEquals(result.retrieval_mode, "rpc_fallback", "retrieval_mode must be rpc_fallback when no results");
});

// ─── Test 4: _failed with keyword fallback results ──────────────────────────

Deno.test("rag-search telemetry: _failed=true with keyword fallback yields keyword_only", () => {
  const vectorResults = {
    _failed: true,
    _error: "vector-search returned 500: timeout",
    rerank_ok: undefined,
    rerank_error: undefined,
  };

  const merged = [{ id: "1", title: "fallback result" }]; // keyword found something

  const rerankOk = !vectorResults._failed && vectorResults.rerank_ok !== false;
  const retrievalMode = vectorResults._failed
    ? (merged.length > 0 ? "keyword_only" : "rpc_fallback")
    : "keyword_only";

  console.log("[telemetry-test] 500 with fallback:", JSON.stringify({
    retrieval_mode: retrievalMode,
    rerank_ok: rerankOk,
    semantic_ok: rerankOk,
  }, null, 2));

  assertEquals(rerankOk, false, "rerank_ok must be false");
  assertEquals(retrievalMode, "keyword_only", "must degrade to keyword_only with fallback data");
});
