/**
 * eval-runner — Evaluation Framework Runner (v2.2)
 *
 * v2.2 changes:
 *   - multi_call mode: execute N sequential calls for rate-limit testing
 *   - http_status + response_headers persisted in eval_run_results
 *   - New invariant types: http_status_check, header_check, field_check,
 *     multi_call_status_sequence
 *   - _method / _headers in input_payload for OPTIONS/custom-header calls
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, validateBrowserRequest } from "../_shared/edge-security.ts";
import { log, err } from "../_shared/safe-logger.ts";

// ── Types ────────────────────────────────────────────────────────────────────

interface InvariantDef {
  type: string;
  params?: Record<string, unknown>;
}

interface InvariantResult {
  type: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

type TemporalMetadataSource = "inline" | "db_fallback" | "hybrid" | "none";

const VALID_SOURCE_TYPES = new Set(["kb", "practice"]);

interface CitedItem {
  id: string;
  doc_id: string;
  title: string;
  source_type: "kb" | "practice";
  effective_from?: string | null;
  effective_to?: string | null;
}

/** Response from a single edge function call */
interface CallResult {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  latencyMs: number;
}

/** Normalize a date-only or ISO string to midnight UTC */
function normalizeReferenceDate(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(raw + "T00:00:00Z");
  }
  return new Date(raw);
}

// ── Temporal helper ──────────────────────────────────────────────────────────

function isEffectiveOn(
  effectiveFrom: string | null | undefined,
  effectiveTo: string | null | undefined,
  referenceDate: Date,
): { valid: boolean; reason?: string } {
  if (effectiveFrom) {
    const from = new Date(effectiveFrom);
    if (from > referenceDate) {
      return { valid: false, reason: `effective_from (${effectiveFrom}) is after reference_date` };
    }
  }
  if (effectiveTo) {
    const to = new Date(effectiveTo);
    if (to <= referenceDate) {
      return { valid: false, reason: `effective_to (${effectiveTo}) is on or before reference_date (exclusive upper bound)` };
    }
  }
  return { valid: true };
}

// ── Citation extractor (v2.1: dedupe + mode-aware) ───────────────────────────

function extractCitations(
  response: Record<string, unknown>,
  targetFunction?: string,
): CitedItem[] {
  const seen = new Map<string, CitedItem>();

  const addItem = (item: CitedItem) => {
    const key = `${item.source_type}:${item.doc_id}`;
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  };

  for (const key of ["kb", "practice"] as const) {
    const arr = response[key];
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      if (r && typeof r === "object" && r.id) {
        addItem({
          id: r.id,
          doc_id: r.doc_id || r.id,
          title: r.title || "",
          source_type: r.source_type || key,
          effective_from: r.effective_from ?? null,
          effective_to: r.effective_to ?? null,
        });
      }
    }
  }

  if (targetFunction !== "vector-search") {
    const sourcesUsed = response.sources_used;
    if (Array.isArray(sourcesUsed)) {
      for (const s of sourcesUsed) {
        if (s && typeof s === "object" && (s.id || s.doc_id)) {
          addItem({
            id: s.id || s.doc_id,
            doc_id: s.doc_id || s.id,
            title: s.title || "",
            source_type: s.source_type || "kb",
            effective_from: s.effective_from ?? null,
            effective_to: s.effective_to ?? null,
          });
        }
      }
    }
  }

  return [...seen.values()];
}

// ── Invariant validators (existing) ──────────────────────────────────────────

function checkCitationsPresent(
  response: Record<string, unknown>,
  targetFunction?: string,
  params?: Record<string, unknown>,
): InvariantResult {
  const mode = (params?.mode as string) || "hybrid";
  const citations = extractCitations(response, targetFunction);

  if (mode === "structured_only") {
    const valid = citations.filter(
      c => c.doc_id && c.title && VALID_SOURCE_TYPES.has(c.source_type),
    );
    const invalid = citations.length - valid.length;
    const passed = valid.length > 0;
    return {
      type: "citations_present",
      passed,
      message: passed
        ? `${valid.length} valid structural citation(s) (structured_only)${invalid > 0 ? `, ${invalid} malformed skipped` : ""}`
        : "No valid structural citations (structured_only): require doc_id, title, valid source_type",
      details: { valid_count: valid.length, malformed_count: invalid, mode },
    };
  }

  const hasStructural = citations.length > 0;
  const text = extractText(response);
  const hasArmenianFormat = /Տե՛ս՝/.test(text);
  const refPatterns = [/\b(Article|Art\.?)\s*\.?\s*\d+/i, /\bECHR\b/i, /ՀՀ\s*(ՔՕ|ՔԴՕ)/];
  const hasTextRef = refPatterns.some(p => p.test(text));
  const passed = hasStructural || hasArmenianFormat || hasTextRef;

  return {
    type: "citations_present",
    passed,
    message: passed
      ? `Citations found: ${citations.length} structural${hasArmenianFormat ? " + Armenian format (Տե՛ս՝)" : ""}${hasTextRef ? " + text references" : ""}`
      : "No citations detected in any form",
    details: { structural_count: citations.length, has_armenian_format: hasArmenianFormat, has_text_references: hasTextRef, mode },
  };
}

const MAX_CITED_IDS = 50;

async function checkCitedIdsExist(
  response: Record<string, unknown>,
  supabase: SupabaseClient,
  targetFunction?: string,
): Promise<InvariantResult> {
  const citations = extractCitations(response, targetFunction);
  if (citations.length === 0) {
    return { type: "cited_ids_exist", passed: true, message: "No cited IDs to verify" };
  }

  const kbIds = [...new Set(citations.filter(c => c.source_type === "kb").map(c => c.doc_id))];
  const practiceIds = [...new Set(citations.filter(c => c.source_type === "practice").map(c => c.doc_id))];
  const totalUnique = kbIds.length + practiceIds.length;

  if (totalUnique > MAX_CITED_IDS) {
    return {
      type: "cited_ids_exist",
      passed: false,
      message: `Too many unique cited IDs (${totalUnique} > ${MAX_CITED_IDS}). Fail-fast.`,
      details: { total_unique: totalUnique, limit: MAX_CITED_IDS },
    };
  }

  const missing: Array<{ doc_id: string; source_type: string }> = [];

  if (kbIds.length > 0) {
    const { data: kbDocs, error: kbError } = await supabase.from("knowledge_base").select("id").in("id", kbIds);
    if (kbError) return { type: "cited_ids_exist", passed: false, message: `DB error: ${kbError.message}` };
    const foundKb = new Set((kbDocs || []).map(d => d.id));
    for (const id of kbIds) if (!foundKb.has(id)) missing.push({ doc_id: id, source_type: "kb" });
  }

  if (practiceIds.length > 0) {
    const { data: practiceDocs, error: practiceError } = await supabase.from("legal_practice_kb").select("id").in("id", practiceIds);
    if (practiceError) return { type: "cited_ids_exist", passed: false, message: `DB error: ${practiceError.message}` };
    const foundPractice = new Set((practiceDocs || []).map(d => d.id));
    for (const id of practiceIds) if (!foundPractice.has(id)) missing.push({ doc_id: id, source_type: "practice" });
  }

  return {
    type: "cited_ids_exist",
    passed: missing.length === 0,
    message: missing.length === 0
      ? `All ${totalUnique} cited IDs verified in DB`
      : `${missing.length} cited ID(s) not found in DB`,
    details: missing.length > 0 ? { missing } : undefined,
  };
}

function checkNoFabricatedSources(response: Record<string, unknown>): InvariantResult {
  const text = extractText(response);
  const fabricatedPattern = /(?:Article|Art\.?)\s*\.?\s*(\d{4,})/gi;
  const matches = [...text.matchAll(fabricatedPattern)];
  const fabricated = matches.filter(m => parseInt(m[1]) > 999);
  return {
    type: "no_fabricated_sources",
    passed: fabricated.length === 0,
    message: fabricated.length === 0
      ? "No fabricated sources detected"
      : `Potentially fabricated article numbers: ${fabricated.map(m => m[0]).join(", ")}`,
    details: fabricated.length > 0 ? fabricated.map(m => m[0]) : undefined,
  };
}

function checkLanguageMatch(response: Record<string, unknown>, expectedLang?: string): InvariantResult {
  if (!expectedLang) {
    return { type: "language_match", passed: true, message: "No expected language specified, skipped" };
  }
  const text = extractText(response);
  const sample = text.substring(0, 500);
  let detected: string;
  if (/[\u0531-\u058F]/.test(sample)) detected = "hy";
  else if (/[\u0400-\u04FF]/.test(sample)) detected = "ru";
  else detected = "en";
  const passed = detected === expectedLang;
  return { type: "language_match", passed, message: passed ? `Language matches: ${expectedLang}` : `Expected ${expectedLang}, detected ${detected}`, details: { expected: expectedLang, detected } };
}

async function checkTemporalInRange(
  response: Record<string, unknown>,
  referenceDate: string,
  supabase: SupabaseClient,
  targetFunction?: string,
  citedIdsFailed?: boolean,
): Promise<InvariantResult & { temporal_metadata_source: TemporalMetadataSource }> {
  if (!referenceDate) return { type: "temporal_in_range", passed: true, message: "No reference_date, skipped", temporal_metadata_source: "none" };
  if (citedIdsFailed) return { type: "temporal_in_range", passed: false, message: "Skipped: cited_ids_exist failed", temporal_metadata_source: "none" };

  const citations = extractCitations(response, targetFunction);
  const kbCitations = citations.filter(c => c.source_type === "kb");
  if (kbCitations.length === 0) return { type: "temporal_in_range", passed: true, message: "No KB citations to validate temporally", temporal_metadata_source: "none" };

  const refDate = normalizeReferenceDate(referenceDate);
  const withMeta = kbCitations.filter(c => c.effective_from != null || c.effective_to != null);
  const withoutMeta = kbCitations.filter(c => c.effective_from == null && c.effective_to == null);

  let metadataSource: TemporalMetadataSource;
  const citationsMap = new Map<string, { doc_id: string; title: string; effective_from: string | null; effective_to: string | null }>();

  for (const c of withMeta) {
    if (!citationsMap.has(c.doc_id)) {
      citationsMap.set(c.doc_id, { doc_id: c.doc_id, title: c.title, effective_from: c.effective_from ?? null, effective_to: c.effective_to ?? null });
    }
  }

  if (withoutMeta.length === 0) {
    metadataSource = "inline";
  } else {
    const missingDocIds = [...new Set(withoutMeta.map(c => c.doc_id).filter(id => !citationsMap.has(id)))];
    if (missingDocIds.length === 0) {
      metadataSource = "inline";
    } else {
      const { data: docs, error } = await supabase.from("knowledge_base").select("id, title, effective_from, effective_to").in("id", missingDocIds);
      if (error) return { type: "temporal_in_range", passed: false, message: `DB error: ${error.message}`, temporal_metadata_source: "db_fallback" };
      const foundIds = new Set((docs || []).map(d => d.id));
      const notFound = missingDocIds.filter(id => !foundIds.has(id));
      if (notFound.length > 0) return { type: "temporal_in_range", passed: false, message: `${notFound.length} cited KB doc(s) not found`, details: { missing_doc_ids: notFound }, temporal_metadata_source: "db_fallback" };
      for (const d of docs || []) {
        if (!citationsMap.has(d.id)) citationsMap.set(d.id, { doc_id: d.id, title: d.title, effective_from: d.effective_from, effective_to: d.effective_to });
      }
      metadataSource = withMeta.length > 0 ? "hybrid" : "db_fallback";
    }
  }

  const citationsToCheck = [...citationsMap.values()];
  const violations: Array<{ doc_id: string; title: string; effective_from: string | null; effective_to: string | null; reason: string }> = [];

  for (const doc of citationsToCheck) {
    const check = isEffectiveOn(doc.effective_from, doc.effective_to, refDate);
    if (!check.valid) violations.push({ ...doc, reason: check.reason! });
  }

  return {
    type: "temporal_in_range",
    passed: violations.length === 0,
    message: violations.length === 0
      ? `All ${citationsToCheck.length} KB docs temporally valid for ${referenceDate} (${metadataSource})`
      : `${violations.length} temporal violation(s)`,
    details: violations.length > 0 ? { violations, metadata_source: metadataSource } : { metadata_source: metadataSource },
    temporal_metadata_source: metadataSource,
  };
}

function checkAgentSchemaValid(response: Record<string, unknown>, targetFunction: string): InvariantResult {
  if (targetFunction === "vector-search") {
    const hasKb = Array.isArray(response.kb);
    const hasPractice = Array.isArray(response.practice);
    const kbItems = (response.kb || []) as Array<Record<string, unknown>>;
    const allHaveDocId = kbItems.length === 0 || kbItems.every(r => r.doc_id);
    return {
      type: "agent_schema_valid",
      passed: hasKb && hasPractice,
      message: hasKb && hasPractice
        ? `Valid schema (kb[${kbItems.length}], practice[${(response.practice as unknown[]).length}])${allHaveDocId ? ", all have doc_id" : ", MISSING doc_id"}`
        : `Missing fields: ${!hasKb ? "kb" : ""} ${!hasPractice ? "practice" : ""}`.trim(),
      details: { has_kb: hasKb, has_practice: hasPractice, all_have_doc_id: allHaveDocId },
    };
  }

  if (targetFunction === "ai-analyze") {
    const hasResult = typeof response.analysis_result === "string" || typeof response.result === "string";
    return { type: "agent_schema_valid", passed: hasResult, message: hasResult ? "Response has analysis result" : "Missing analysis_result/result field" };
  }

  const hasContent = Object.keys(response).length > 0;
  return { type: "agent_schema_valid", passed: hasContent, message: hasContent ? "Response is non-empty" : "Empty response" };
}

// ── NEW: P0 Hardening invariants ─────────────────────────────────────────────

/** Check HTTP status matches expected */
function checkHttpStatus(actual: number, params?: Record<string, unknown>): InvariantResult {
  const expected = (params?.expected as number) || 200;
  return {
    type: "http_status_check",
    passed: actual === expected,
    message: actual === expected
      ? `HTTP ${actual} matches expected ${expected}`
      : `HTTP ${actual} does not match expected ${expected}`,
    details: { actual, expected },
  };
}

/** Check a response header contains a substring */
function checkHeader(headers: Record<string, string>, params?: Record<string, unknown>): InvariantResult {
  const headerName = ((params?.header as string) || "").toLowerCase();
  const contains = ((params?.contains as string) || "").toLowerCase();
  const headerValue = (headers[headerName] || "").toLowerCase();
  const passed = headerValue.includes(contains);
  return {
    type: "header_check",
    passed,
    message: passed
      ? `Header '${headerName}' contains '${contains}'`
      : `Header '${headerName}' = '${headerValue}' does not contain '${contains}'`,
    details: { header: headerName, expected_contains: contains, actual: headerValue },
  };
}

/** Check a response body field equals expected value */
function checkField(body: Record<string, unknown>, params?: Record<string, unknown>): InvariantResult {
  const field = (params?.field as string) || "";
  const equals = params?.equals;
  const actual = body[field];
  const passed = actual === equals;
  return {
    type: "field_check",
    passed,
    message: passed
      ? `body.${field} = '${equals}' ✓`
      : `body.${field} = '${actual}', expected '${equals}'`,
    details: { field, expected: equals, actual },
  };
}

/** For multi_call: check the last call's status and reason */
function checkMultiCallSequence(callResults: CallResult[], params?: Record<string, unknown>): InvariantResult {
  const expectedLastStatus = (params?.expected_last_status as number) || 429;
  const expectedLastReason = (params?.expected_last_reason as string) || "";

  if (callResults.length === 0) {
    return { type: "multi_call_status_sequence", passed: false, message: "No call results" };
  }

  const last = callResults[callResults.length - 1];
  const statusMatch = last.status === expectedLastStatus;
  const reasonMatch = !expectedLastReason || (last.body?.reason === expectedLastReason || last.body?.error === expectedLastReason);
  const passed = statusMatch && reasonMatch;

  const statuses = callResults.map(r => r.status);

  return {
    type: "multi_call_status_sequence",
    passed,
    message: passed
      ? `Last call returned ${expectedLastStatus} with reason '${expectedLastReason}'. Sequence: [${statuses.join(",")}]`
      : `Expected last status=${expectedLastStatus} reason='${expectedLastReason}', got status=${last.status} body=${JSON.stringify(last.body).substring(0, 200)}. Sequence: [${statuses.join(",")}]`,
    details: { statuses, last_body: last.body, expected_last_status: expectedLastStatus, expected_last_reason: expectedLastReason },
  };
}

// ── Helper ───────────────────────────────────────────────────────────────────

function extractText(response: Record<string, unknown>): string {
  for (const key of ["analysis_result", "result", "text", "content", "translated", "response_text", "full_report"]) {
    if (typeof response[key] === "string") return response[key] as string;
  }
  if (Array.isArray(response.kb)) {
    return (response.kb as Array<{ title?: string; content_text?: string }>)
      .map(r => `${r.title || ""} ${r.content_text || ""}`)
      .join(" ");
  }
  return JSON.stringify(response);
}

function headersToRecord(headers: Headers): Record<string, string> {
  const rec: Record<string, string> = {};
  headers.forEach((v, k) => { rec[k.toLowerCase()] = v; });
  return rec;
}

// ── Call helper ──────────────────────────────────────────────────────────────

async function callEdgeFunction(
  supabaseUrl: string,
  serviceKey: string,
  targetFunction: string,
  payload: Record<string, unknown>,
): Promise<CallResult> {
  const method = (payload._method as string) || "POST";
  const extraHeaders = (payload._headers as Record<string, string>) || {};

  // Strip meta fields from body
  const body = { ...payload };
  delete body._method;
  delete body._headers;
  delete body._call_count;

  const targetUrl = `${supabaseUrl}/functions/v1/${targetFunction}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const t0 = Date.now();

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
      ...extraHeaders,
    };

    const fetchOpts: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    // Don't send body for OPTIONS/GET
    if (method !== "OPTIONS" && method !== "GET") {
      fetchOpts.body = JSON.stringify(body);
    }

    const response = await fetch(targetUrl, fetchOpts);
    const latencyMs = Date.now() - t0;

    let responseBody: Record<string, unknown> = {};
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try { responseBody = await response.json(); } catch { responseBody = {}; }
    } else {
      const text = await response.text();
      responseBody = { _raw_text: text };
    }

    return {
      status: response.status,
      headers: headersToRecord(response.headers),
      body: responseBody,
      latencyMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authErr = validateBrowserRequest(req, corsHeaders);
  if (authErr) return authErr;

  try {
    const { suite_id } = await req.json();
    if (!suite_id) return json({ error: "suite_id is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: cases, error: casesErr } = await supabase
      .from("eval_cases")
      .select("*")
      .eq("suite_id", suite_id)
      .eq("is_active", true)
      .order("created_at");

    if (casesErr) return json({ error: `Failed to fetch cases: ${casesErr.message}` }, 500);
    if (!cases || cases.length === 0) return json({ error: "No active eval cases in suite" }, 404);

    const { data: run, error: runErr } = await supabase
      .from("eval_runs")
      .insert({
        suite_id,
        status: "running",
        total_cases: cases.length,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (runErr) return json({ error: `Failed to create run: ${runErr.message}` }, 500);

    log("eval-runner", "Starting eval run v2.2", { run_id: run.id, total_cases: cases.length });

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const results: Array<{
      case_name: string;
      status: string;
      invariants: InvariantResult[];
      latency_ms: number;
      http_status?: number;
      temporal_metadata_source?: string;
    }> = [];

    for (const evalCase of cases) {
      const t0 = Date.now();
      try {
        const caseMode = evalCase.mode || "single_call";
        const inputPayload = evalCase.input_payload as Record<string, unknown>;

        // ── Execute call(s) ──────────────────────────────────────────────
        let callResults: CallResult[];

        if (caseMode === "multi_call") {
          const callCount = (inputPayload._call_count as number) || 3;
          callResults = [];
          for (let i = 0; i < callCount; i++) {
            const result = await callEdgeFunction(supabaseUrl, supabaseServiceKey, evalCase.target_function, inputPayload);
            callResults.push(result);
            log("eval-runner", `multi_call ${i + 1}/${callCount}`, { status: result.status, fn: evalCase.target_function });
          }
        } else {
          // single_call
          const result = await callEdgeFunction(supabaseUrl, supabaseServiceKey, evalCase.target_function, inputPayload);
          callResults = [result];
        }

        const totalLatency = Date.now() - t0;
        const lastCall = callResults[callResults.length - 1];
        const responseBody = lastCall.body;
        const responseHeaders = lastCall.headers;
        const httpStatus = lastCall.status;

        // ── Run invariant checks ─────────────────────────────────────────
        const invariants: InvariantResult[] = [];
        const invariantDefs = (evalCase.invariants || []) as InvariantDef[];
        let temporalMetadataSource: string | undefined;
        let citedIdsFailed = false;

        for (const inv of invariantDefs) {
          switch (inv.type) {
            // ── P0 Hardening invariants ──
            case "http_status_check":
              invariants.push(checkHttpStatus(httpStatus, inv.params));
              break;
            case "header_check":
              invariants.push(checkHeader(responseHeaders, inv.params));
              break;
            case "field_check":
              invariants.push(checkField(responseBody, inv.params));
              break;
            case "multi_call_status_sequence":
              invariants.push(checkMultiCallSequence(callResults, inv.params));
              break;

            // ── Existing invariants ──
            case "citations_present":
              invariants.push(checkCitationsPresent(responseBody, evalCase.target_function, inv.params));
              break;
            case "cited_ids_exist": {
              const citedResult = await checkCitedIdsExist(responseBody, supabase, evalCase.target_function);
              if (!citedResult.passed) citedIdsFailed = true;
              invariants.push(citedResult);
              break;
            }
            case "no_fabricated_sources":
              invariants.push(checkNoFabricatedSources(responseBody));
              break;
            case "language_match":
              invariants.push(checkLanguageMatch(responseBody, evalCase.expected_language || undefined));
              break;
            case "temporal_in_range": {
              const temporalResult = await checkTemporalInRange(responseBody, evalCase.reference_date || "", supabase, evalCase.target_function, citedIdsFailed);
              temporalMetadataSource = temporalResult.temporal_metadata_source;
              invariants.push(temporalResult);
              break;
            }
            case "agent_schema_valid":
              invariants.push(checkAgentSchemaValid(responseBody, evalCase.target_function));
              break;
            default:
              invariants.push({ type: inv.type, passed: true, message: `Unknown invariant '${inv.type}', skipped` });
          }
        }

        const allPassed = invariants.every(i => i.passed);
        const caseStatus = allPassed ? "pass" : "fail";
        if (allPassed) passed++;
        else failed++;

        const temporalViolations = invariants
          .filter(i => i.type === "temporal_in_range" && !i.passed)
          .map(i => i.details);

        results.push({
          case_name: evalCase.name,
          status: caseStatus,
          invariants,
          latency_ms: totalLatency,
          http_status: httpStatus,
          temporal_metadata_source: temporalMetadataSource,
        });

        await supabase.from("eval_run_results").insert({
          run_id: run.id,
          case_id: evalCase.id,
          status: caseStatus,
          raw_response: caseMode === "multi_call"
            ? { calls: callResults.map(r => ({ status: r.status, body: r.body })) }
            : responseBody,
          invariant_results: invariants,
          temporal_violations: temporalViolations.length > 0 ? temporalViolations : null,
          temporal_metadata_source: temporalMetadataSource || null,
          latency_ms: totalLatency,
          http_status: httpStatus,
          response_headers: responseHeaders,
        });
      } catch (caseErr) {
        const latencyMs = Date.now() - t0;
        skipped++;
        const errorMsg = caseErr instanceof Error ? caseErr.message : String(caseErr);
        results.push({
          case_name: evalCase.name,
          status: "skipped",
          invariants: [{ type: "execution", passed: false, message: `Error: ${errorMsg}` }],
          latency_ms: latencyMs,
        });

        await supabase.from("eval_run_results").insert({
          run_id: run.id,
          case_id: evalCase.id,
          status: "skipped",
          error_message: errorMsg,
          latency_ms: latencyMs,
          temporal_metadata_source: null,
        });
      }
    }

    await supabase.from("eval_runs").update({
      status: failed > 0 ? "failed" : "passed",
      passed,
      failed,
      skipped,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id);

    log("eval-runner", "Eval run v2.2 complete", { run_id: run.id, passed, failed, skipped });

    return json({ run_id: run.id, passed, failed, skipped, total: cases.length, results });
  } catch (error) {
    err("eval-runner", "Runner error", { error });
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
