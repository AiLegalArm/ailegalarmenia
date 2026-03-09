/**
 * Integration test: x-request-id propagation through vector-search.
 *
 * Verifies that a caller-provided x-request-id flows through and is
 * returned verbatim in the JSON response as `request_id`.
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL");
const INTERNAL_KEY = Deno.env.get("INTERNAL_INGEST_KEY");

function skipIfMissing(): boolean {
  if (!SUPABASE_URL || !INTERNAL_KEY) {
    console.warn("SKIP: VITE_SUPABASE_URL or INTERNAL_INGEST_KEY not set");
    return true;
  }
  return false;
}

Deno.test("x-request-id propagation: provided ID is echoed in response", async () => {
  if (skipIfMissing()) return;

  const traceId = "trace-test-001";
  const url = `${SUPABASE_URL}/functions/v1/vector-search`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
      "x-request-id": traceId,
    },
    body: JSON.stringify({
      query: "test request id propagation",
      tables: "kb",
      limit: 1,
    }),
  });

  assertEquals(res.status, 200, `Expected 200, got ${res.status}`);

  const data = await res.json();
  console.log("[request-id-propagation] response:", JSON.stringify({
    request_id: data.request_id,
    retrieval_mode: data.retrieval_mode,
    rerank_ok: data.rerank_ok,
    kb_count: data.kb?.length ?? 0,
  }, null, 2));

  assertExists(data.request_id, "response must contain request_id");
  assertEquals(data.request_id, traceId, "request_id must match provided trace ID");
});

Deno.test("x-request-id propagation: auto-generated when not provided", async () => {
  if (skipIfMissing()) return;

  const url = `${SUPABASE_URL}/functions/v1/vector-search`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": INTERNAL_KEY!,
      // No x-request-id header
    },
    body: JSON.stringify({
      query: "test auto request id",
      tables: "kb",
      limit: 1,
    }),
  });

  assertEquals(res.status, 200);

  const data = await res.json();
  assertExists(data.request_id, "response must contain auto-generated request_id");
  assertEquals(typeof data.request_id, "string");
  assertEquals(data.request_id.length > 0, true, "request_id must be non-empty");

  console.log("[request-id-propagation] auto-generated request_id:", data.request_id);
});
