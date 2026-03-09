/**
 * vector-search integration test.
 *
 * Tests the deployed vector-search Edge Function end-to-end:
 * 1. Valid internal call → 200 with telemetry fields
 * 2. Missing auth → rejected
 * 3. Response includes retrieval_mode, rerank_ok, request_id
 *    (semantic_ok/semantic_error kept as backward-compat aliases)
 *
 * Run: deno test --allow-net --allow-env supabase/functions/vector-search/vector-search.test.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
const INTERNAL_KEY = Deno.env.get("INTERNAL_INGEST_KEY");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const VECTOR_SEARCH_URL = `${SUPABASE_URL}/functions/v1/vector-search`;

// ─── Test: valid internal call returns telemetry ───────────────────

Deno.test("vector-search: internal call with valid key returns telemetry fields", async () => {
  if (!SUPABASE_URL || !INTERNAL_KEY) {
    console.warn("SKIP: SUPABASE_URL or INTERNAL_INGEST_KEY not set");
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-internal-key": INTERNAL_KEY,
    "x-request-id": "test-integration-001",
  };
  if (SERVICE_KEY) {
    headers["Authorization"] = `Bearer ${SERVICE_KEY}`;
  }

  const response = await fetch(VECTOR_SEARCH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: "Հայաստանի Հանրdelays քաdelays",
      tables: "kb",
      limit: 3,
    }),
  });

  // Must succeed (200)
  assertEquals(response.status, 200, `Expected 200, got ${response.status}`);

  const data = await response.json();

  // Must have canonical telemetry fields
  assertExists(data.retrieval_mode, "Missing retrieval_mode");
  assertEquals(typeof data.rerank_ok, "boolean", "rerank_ok must be boolean");
  assertExists(data.request_id, "Missing request_id");
  // Backward compat aliases
  assertEquals(typeof data.semantic_ok, "boolean", "semantic_ok (compat) must be boolean");

  // Must have results arrays
  assertExists(data.kb, "Missing kb array");
  assertEquals(Array.isArray(data.kb), true);

  console.log("[TEST] retrieval_mode:", data.retrieval_mode);
  console.log("[TEST] rerank_ok:", data.rerank_ok);
  console.log("[TEST] kb results:", data.kb.length);
  if (data.rerank_error) {
    console.log("[TEST] rerank_error:", data.rerank_error);
  }
});

// ─── Test: call without key fails ──────────────────────────────────

Deno.test("vector-search: call without x-internal-key is rejected", async () => {
  if (!SUPABASE_URL) {
    console.warn("SKIP: SUPABASE_URL not set");
    return;
  }

  const response = await fetch(VECTOR_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "test", tables: "kb", limit: 1 }),
  });

  // Should be rejected (401 or 403)
  assertEquals(
    response.status >= 400 && response.status < 500,
    true,
    `Expected 4xx, got ${response.status}`,
  );
  await response.text(); // consume body
});

// ─── Test: response shape contract ─────────────────────────────────

Deno.test("vector-search: response shape matches contract", async () => {
  if (!SUPABASE_URL || !INTERNAL_KEY) {
    console.warn("SKIP: env not configured");
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-internal-key": INTERNAL_KEY,
    "x-request-id": "test-contract-001",
  };
  if (SERVICE_KEY) {
    headers["Authorization"] = `Bearer ${SERVICE_KEY}`;
  }

  const response = await fetch(VECTOR_SEARCH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: "property rights dispute",
      tables: "both",
      limit: 2,
    }),
  });

  assertEquals(response.status, 200);
  const data = await response.json();

  // Verify shape
  assertEquals(Array.isArray(data.kb), true, "kb must be array");
  assertEquals(Array.isArray(data.practice), true, "practice must be array");
  assertEquals(
    ["keyword+rerank", "keyword_only", "rpc_fallback"].includes(data.retrieval_mode),
    true,
    `Invalid retrieval_mode: ${data.retrieval_mode}`,
  );
  assertEquals(typeof data.rerank_ok, "boolean");
  assertEquals(typeof data.request_id, "string");
  // Backward compat
  assertEquals(typeof data.semantic_ok, "boolean");

  // If rerank failed, error field must be present
  if (!data.rerank_ok) {
    assertExists(data.rerank_error, "rerank_error must be present when rerank_ok=false");
  }
});
