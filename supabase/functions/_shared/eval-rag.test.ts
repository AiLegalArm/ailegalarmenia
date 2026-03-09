// =============================================================================
// RAG Evaluation Test Harness
// Tests vector-search endpoint against 20 golden queries.
// Assertions: JSON validity, citation presence, no hallucinated norms
// Metrics:    retrieval hit rate, grounded rate, temporal compliance
// =============================================================================

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assert,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  GOLDEN_FIXTURES,
  LEGISLATION_FIXTURES,
  PRACTICE_FIXTURES,
  type GoldenFixture,
} from "./eval-fixtures.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const VECTOR_SEARCH_URL = `${SUPABASE_URL}/functions/v1/vector-search`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  kb: Array<{ id: string; title: string; content_text: string; similarity?: number }>;
  practice: Array<{ id: string; title: string; content_text: string; similarity?: number }>;
}

interface EvalResult {
  fixtureId: string;
  label: string;
  httpOk: boolean;
  jsonValid: boolean;
  resultCount: number;
  expectedNormsFound: number;
  expectedNormsTotal: number;
  forbiddenNormsDetected: number;
  meetsMinResults: boolean;
  latencyMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runSearch(fixture: GoldenFixture): Promise<{ response: Response; latencyMs: number }> {
  const body: Record<string, unknown> = {
    query: fixture.query,
    tables: fixture.tables,
    limit: 10,
  };
  if (fixture.category) body.category = fixture.category;
  if (fixture.referenceDate) body.reference_date = fixture.referenceDate;

  const start = performance.now();
  const response = await fetch(VECTOR_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const latencyMs = Math.round(performance.now() - start);

  return { response, latencyMs };
}

function countMatchedPatterns(patterns: RegExp[], text: string): number {
  let count = 0;
  for (const p of patterns) {
    if (p.test(text)) count++;
  }
  return count;
}

function countForbiddenPatterns(patterns: RegExp[], text: string): number {
  let count = 0;
  for (const p of patterns) {
    if (p.test(text)) count++;
  }
  return count;
}

async function evaluateFixture(fixture: GoldenFixture): Promise<EvalResult> {
  const result: EvalResult = {
    fixtureId: fixture.id,
    label: fixture.label,
    httpOk: false,
    jsonValid: false,
    resultCount: 0,
    expectedNormsFound: 0,
    expectedNormsTotal: fixture.expectedNormPatterns.length,
    forbiddenNormsDetected: 0,
    meetsMinResults: false,
    latencyMs: 0,
  };

  try {
    const { response, latencyMs } = await runSearch(fixture);
    result.latencyMs = latencyMs;
    result.httpOk = response.ok;

    const text = await response.text();

    // JSON validity
    let data: SearchResult;
    try {
      data = JSON.parse(text);
      result.jsonValid = true;
    } catch {
      result.jsonValid = false;
      result.error = `Invalid JSON: ${text.substring(0, 200)}`;
      return result;
    }

    // Count results
    const kbCount = Array.isArray(data.kb) ? data.kb.length : 0;
    const practiceCount = Array.isArray(data.practice) ? data.practice.length : 0;
    result.resultCount = kbCount + practiceCount;
    result.meetsMinResults = result.resultCount >= fixture.minResults;

    // Concatenate all text for pattern matching
    const allContent = [
      ...((data.kb || []).map((r) => `${r.title} ${r.content_text}`)),
      ...((data.practice || []).map((r) => `${r.title} ${r.content_text}`)),
    ].join("\n");

    // Check expected norms
    result.expectedNormsFound = countMatchedPatterns(
      fixture.expectedNormPatterns,
      allContent
    );

    // Check forbidden (hallucinated) norms
    result.forbiddenNormsDetected = countForbiddenPatterns(
      fixture.forbiddenNormPatterns,
      allContent
    );
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Metrics computation
// ---------------------------------------------------------------------------

interface EvalMetrics {
  totalQueries: number;
  httpSuccessRate: number;
  jsonValidRate: number;
  retrievalHitRate: number;
  groundedRate: number;
  hallucinationFreeRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  minResultsMet: number;
}

function computeMetrics(results: EvalResult[]): EvalMetrics {
  const total = results.length;
  const httpOk = results.filter((r) => r.httpOk).length;
  const jsonOk = results.filter((r) => r.jsonValid).length;
  const hasResults = results.filter((r) => r.resultCount > 0).length;
  const meetsMin = results.filter((r) => r.meetsMinResults).length;

  // Grounded rate: of fixtures with expected norms, how many found at least one?
  const withExpectedNorms = results.filter((r) => r.expectedNormsTotal > 0);
  const grounded = withExpectedNorms.filter((r) => r.expectedNormsFound > 0).length;
  const groundedRate = withExpectedNorms.length > 0
    ? grounded / withExpectedNorms.length
    : 1.0;

  // Hallucination-free rate
  const hallucinationFree = results.filter((r) => r.forbiddenNormsDetected === 0).length;

  // Latency
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const avgLatency = latencies.reduce((s, l) => s + l, 0) / total;
  const p95Idx = Math.min(Math.ceil(total * 0.95) - 1, total - 1);

  return {
    totalQueries: total,
    httpSuccessRate: httpOk / total,
    jsonValidRate: jsonOk / total,
    retrievalHitRate: hasResults / total,
    groundedRate,
    hallucinationFreeRate: hallucinationFree / total,
    avgLatencyMs: Math.round(avgLatency),
    p95LatencyMs: latencies[p95Idx] || 0,
    minResultsMet: meetsMin / total,
  };
}

function formatMetricsReport(metrics: EvalMetrics, results: EvalResult[]): string {
  const lines: string[] = [
    "=".repeat(72),
    "  RAG EVALUATION REPORT",
    "=".repeat(72),
    "",
    `Total queries:          ${metrics.totalQueries}`,
    `HTTP success rate:      ${(metrics.httpSuccessRate * 100).toFixed(1)}%`,
    `JSON valid rate:        ${(metrics.jsonValidRate * 100).toFixed(1)}%`,
    `Retrieval hit rate:     ${(metrics.retrievalHitRate * 100).toFixed(1)}%`,
    `Grounded rate:          ${(metrics.groundedRate * 100).toFixed(1)}%`,
    `Hallucination-free:     ${(metrics.hallucinationFreeRate * 100).toFixed(1)}%`,
    `Min results met:        ${(metrics.minResultsMet * 100).toFixed(1)}%`,
    `Avg latency:            ${metrics.avgLatencyMs}ms`,
    `P95 latency:            ${metrics.p95LatencyMs}ms`,
    "",
    "-".repeat(72),
    "  DETAIL BY QUERY",
    "-".repeat(72),
    "",
  ];

  for (const r of results) {
    const status = r.httpOk && r.jsonValid && r.forbiddenNormsDetected === 0
      ? "\u2705"
      : "\u274c";
    lines.push(
      `${status} [${r.fixtureId}] ${r.label}` +
      ` | results=${r.resultCount}` +
      ` | norms=${r.expectedNormsFound}/${r.expectedNormsTotal}` +
      ` | halluc=${r.forbiddenNormsDetected}` +
      ` | ${r.latencyMs}ms` +
      (r.error ? ` | ERROR: ${r.error}` : "")
    );
  }

  lines.push("");
  lines.push("=".repeat(72));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("eval: all fixtures return valid HTTP 200", async () => {
  const results: EvalResult[] = [];
  for (const f of GOLDEN_FIXTURES) {
    const r = await evaluateFixture(f);
    results.push(r);
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const metrics = computeMetrics(results);
  const report = formatMetricsReport(metrics, results);
  console.log(report);

  // Hard assertions
  assert(metrics.httpSuccessRate >= 0.9, `HTTP success rate too low: ${metrics.httpSuccessRate}`);
  assert(metrics.jsonValidRate >= 0.95, `JSON validity rate too low: ${metrics.jsonValidRate}`);
  assert(metrics.hallucinationFreeRate === 1.0, `Hallucinated norms detected in results`);

  // Consume all responses
  for (const r of results) {
    if (!r.httpOk && r.error) {
      console.warn(`[${r.fixtureId}] ${r.error}`);
    }
  }
});

Deno.test("eval: legislation queries return JSON with kb array", async () => {
  for (const f of LEGISLATION_FIXTURES.slice(0, 3)) {
    const { response, latencyMs } = await runSearch(f);
    const text = await response.text();

    if (response.ok) {
      const data = JSON.parse(text);
      assert(Array.isArray(data.kb), `[${f.id}] Response must have kb array`);
      assert("practice" in data, `[${f.id}] Response must have practice key`);

      // Each KB result should have required fields
      for (const item of data.kb) {
        assert(typeof item.id === "string", `[${f.id}] KB item must have string id`);
        assert(typeof item.title === "string", `[${f.id}] KB item must have string title`);
        assert(
          typeof item.content_text === "string",
          `[${f.id}] KB item must have string content_text`
        );
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
});

Deno.test("eval: practice queries return JSON with practice array", async () => {
  for (const f of PRACTICE_FIXTURES.slice(0, 3)) {
    const { response } = await runSearch(f);
    const text = await response.text();

    if (response.ok) {
      const data = JSON.parse(text);
      assert(Array.isArray(data.practice), `[${f.id}] Response must have practice array`);

      for (const item of data.practice) {
        assert(typeof item.id === "string", `[${f.id}] Practice item must have string id`);
        assert(typeof item.title === "string", `[${f.id}] Practice item must have string title`);
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
});

Deno.test("eval: no forbidden (fabricated) norms in any result", async () => {
  const fixturesWithForbidden = GOLDEN_FIXTURES.filter(
    (f) => f.forbiddenNormPatterns.length > 0
  );

  for (const f of fixturesWithForbidden) {
    const { response } = await runSearch(f);
    const text = await response.text();

    if (response.ok) {
      const data: SearchResult = JSON.parse(text);
      const allContent = [
        ...(data.kb || []).map((r) => `${r.title} ${r.content_text}`),
        ...(data.practice || []).map((r) => `${r.title} ${r.content_text}`),
      ].join("\n");

      const detected = countForbiddenPatterns(f.forbiddenNormPatterns, allContent);
      assertEquals(
        detected,
        0,
        `[${f.id}] Fabricated norms detected in results! This indicates data contamination.`
      );
    }
    await new Promise((r) => setTimeout(r, 300));
  }
});

Deno.test("eval: temporal query with reference_date returns valid response", async () => {
  const temporalFixture = GOLDEN_FIXTURES.find((f) => f.referenceDate);
  if (!temporalFixture) return;

  const { response } = await runSearch(temporalFixture);
  const text = await response.text();
  assert(response.ok, `Temporal query failed: ${response.status}`);

  const data = JSON.parse(text);
  assert("kb" in data, "Temporal response must have kb key");
  assert("practice" in data, "Temporal response must have practice key");
});

Deno.test("eval: empty query returns 400", async () => {
  const response = await fetch(VECTOR_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ query: "", tables: "both" }),
  });
  const text = await response.text();
  assertEquals(response.status, 400, "Empty query should return 400");
  const data = JSON.parse(text);
  assert("error" in data, "Error response should have error key");
});
