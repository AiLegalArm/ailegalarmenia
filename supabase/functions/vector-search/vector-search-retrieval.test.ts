/**
 * Deterministic retrieval integration test for vector-search.
 *
 * Proves that a KB record with unique marker text is actually returned
 * by the vector-search endpoint (not just that it responds 200).
 *
 * Prerequisites:
 *   - SUPABASE_URL (or VITE_SUPABASE_URL)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - INTERNAL_INGEST_KEY
 *
 * Run:
 *   deno test --allow-net --allow-env \
 *     supabase/functions/vector-search/vector-search-retrieval.test.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

// ─── Env ────────────────────────────────────────────────────────────

const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_KEY = Deno.env.get("INTERNAL_INGEST_KEY");

const VECTOR_SEARCH_URL = `${SUPABASE_URL}/functions/v1/vector-search`;

const MARKER = `RAG_TEST_MARKER_${crypto.randomUUID().slice(0, 8)}`;

// ─── Helpers ────────────────────────────────────────────────────────

function skipIfMissingEnv(): boolean {
  if (!SUPABASE_URL || !SERVICE_KEY || !INTERNAL_KEY) {
    console.warn(
      "SKIP: requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_INGEST_KEY",
    );
    return true;
  }
  return false;
}

function serviceClient() {
  return createClient(SUPABASE_URL!, SERVICE_KEY!);
}

// deno-lint-ignore no-explicit-any
async function insertTestKBRecord(sb: any): Promise<string> {
  // Use rest() to bypass generated-type restrictions (service_role has full access)
  const { data, error } = await (sb as any)          // deno-lint-ignore no-explicit-any
    .from("knowledge_base")
    .insert({
      title: `Test: ${MARKER}`,
      content_text: `This is a deterministic test document containing the marker ${MARKER} for retrieval verification.`,
      category: "other",
      is_active: true,
      source_name: "integration_test",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Insert KB failed: ${error.message}`);
  return data.id;
}

// deno-lint-ignore no-explicit-any
async function deleteTestKBRecord(sb: any, id: string): Promise<void> {
  // deno-lint-ignore no-explicit-any
  const { error } = await (sb as any)
    .from("knowledge_base")
    .delete()
    .eq("id", id);
  if (error) {
    console.warn(`Cleanup warning: ${error.message}`);
  }
}

// ─── Test ───────────────────────────────────────────────────────────

Deno.test("vector-search retrieval: returns seeded KB record by marker text", async () => {
  if (skipIfMissingEnv()) return;

  const sb = serviceClient();
  let recordId: string | undefined;

  try {
    // 1. Seed
    recordId = await insertTestKBRecord(sb);
    console.log(`[TEST] Inserted KB record ${recordId} with marker ${MARKER}`);

    // 2. Call vector-search
    const response = await fetch(VECTOR_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": INTERNAL_KEY!,
        "x-request-id": `test-retrieval-${MARKER}`,
      },
      body: JSON.stringify({
        query: MARKER,
        tables: "kb",
        limit: 10,
      }),
    });

    assertEquals(response.status, 200, `Expected 200, got ${response.status}`);

    const data = await response.json();
    assertExists(data.kb, "Response must contain kb array");
    assert(Array.isArray(data.kb), "kb must be an array");

    // 3. Assert the seeded record is in results
    const ids = data.kb.map((r: { id: string }) => r.id);
    console.log(`[TEST] Returned ${ids.length} KB results: ${ids.join(", ")}`);
    assert(
      ids.includes(recordId),
      `Expected seeded record ${recordId} in results, got: [${ids.join(", ")}]`,
    );

    // Bonus: verify telemetry fields
    assertExists(data.retrieval_mode);
    assertEquals(typeof data.rerank_ok, "boolean");
    assertExists(data.request_id);

    console.log(`[TEST] PASS: record ${recordId} found in top-${data.kb.length} results`);
    console.log(`[TEST] retrieval_mode=${data.retrieval_mode}, rerank_ok=${data.rerank_ok}`);
  } finally {
    // 4. Cleanup
    if (recordId) {
      await deleteTestKBRecord(sb, recordId);
      console.log(`[TEST] Cleaned up KB record ${recordId}`);
    }
  }
});
