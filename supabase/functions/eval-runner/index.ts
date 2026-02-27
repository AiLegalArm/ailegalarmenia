/**
 * eval-runner — Evaluation Framework Runner (v2.4)
 *
 * v2.4 changes:
 *   - apikey header uses SUPABASE_ANON_KEY (not service role)
 *   - OPTIONS requests omit Authorization by default
 *   - Authorization/apikey values stripped from stored response_headers
 *   - callEdgeFunction accepts anonKey parameter
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, validateBrowserRequest } from "../_shared/edge-security.ts";
import { log, warn, err } from "../_shared/safe-logger.ts";

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

interface CallResult {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  latencyMs: number;
}

function normalizeReferenceDate(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw + "T00:00:00Z");
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
    if (from > referenceDate) return { valid: false, reason: `effective_from (${effectiveFrom}) is after reference_date` };
  }
  if (effectiveTo) {
    const to = new Date(effectiveTo);
    if (to <= referenceDate) return { valid: false, reason: `effective_to (${effectiveTo}) is on or before reference_date` };
  }
  return { valid: true };
}

// ── Citation extractor ───────────────────────────────────────────────────────

function extractCitations(response: Record<string, unknown>, targetFunction?: string): CitedItem[] {
  const seen = new Map<string, CitedItem>();
  const addItem = (item: CitedItem) => {
    const key = `${item.source_type}:${item.doc_id}`;
    if (!seen.has(key)) seen.set(key, item);
  };

  for (const key of ["kb", "practice"] as const) {
    const arr = response[key];
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      if (r && typeof r === "object" && r.id) {
        addItem({ id: r.id, doc_id: r.doc_id || r.id, title: r.title || "", source_type: r.source_type || key, effective_from: r.effective_from ?? null, effective_to: r.effective_to ?? null });
      }
    }
  }

  if (targetFunction !== "vector-search") {
    const sourcesUsed = response.sources_used;
    if (Array.isArray(sourcesUsed)) {
      for (const s of sourcesUsed) {
        if (s && typeof s === "object" && (s.id || s.doc_id)) {
          addItem({ id: s.id || s.doc_id, doc_id: s.doc_id || s.id, title: s.title || "", source_type: s.source_type || "kb", effective_from: s.effective_from ?? null, effective_to: s.effective_to ?? null });
        }
      }
    }
  }

  return [...seen.values()];
}

// ── Invariant validators ─────────────────────────────────────────────────────

function checkCitationsPresent(response: Record<string, unknown>, targetFunction?: string, params?: Record<string, unknown>): InvariantResult {
  const mode = (params?.mode as string) || "hybrid";
  const citations = extractCitations(response, targetFunction);

  if (mode === "structured_only") {
    const valid = citations.filter(c => c.doc_id && c.title && VALID_SOURCE_TYPES.has(c.source_type));
    const invalid = citations.length - valid.length;
    const passed = valid.length > 0;
    return { type: "citations_present", passed, message: passed ? `${valid.length} valid structural citation(s)` : "No valid structural citations", details: { valid_count: valid.length, malformed_count: invalid, mode } };
  }

  const hasStructural = citations.length > 0;
  const text = extractText(response);
  const hasArmenianFormat = /Տե՛ս՝/.test(text);
  const refPatterns = [/\b(Article|Art\.?)\s*\.?\s*\d+/i, /\bECHR\b/i, /ՀՀ\s*(ՔՕ|ՔԴՕ)/];
  const hasTextRef = refPatterns.some(p => p.test(text));
  const passed = hasStructural || hasArmenianFormat || hasTextRef;
  return { type: "citations_present", passed, message: passed ? `Citations found: ${citations.length} structural` : "No citations detected", details: { structural_count: citations.length, has_armenian_format: hasArmenianFormat, has_text_references: hasTextRef, mode } };
}

const MAX_CITED_IDS = 50;

async function checkCitedIdsExist(response: Record<string, unknown>, supabase: SupabaseClient, targetFunction?: string): Promise<InvariantResult> {
  const citations = extractCitations(response, targetFunction);
  if (citations.length === 0) return { type: "cited_ids_exist", passed: true, message: "No cited IDs to verify" };

  const kbIds = [...new Set(citations.filter(c => c.source_type === "kb").map(c => c.doc_id))];
  const practiceIds = [...new Set(citations.filter(c => c.source_type === "practice").map(c => c.doc_id))];
  const totalUnique = kbIds.length + practiceIds.length;
  if (totalUnique > MAX_CITED_IDS) return { type: "cited_ids_exist", passed: false, message: `Too many unique cited IDs (${totalUnique} > ${MAX_CITED_IDS}). Fail-fast.` };

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

  return { type: "cited_ids_exist", passed: missing.length === 0, message: missing.length === 0 ? `All ${totalUnique} cited IDs verified` : `${missing.length} cited ID(s) not found`, details: missing.length > 0 ? { missing } : undefined };
}

function checkNoFabricatedSources(response: Record<string, unknown>): InvariantResult {
  const text = extractText(response);
  const fabricatedPattern = /(?:Article|Art\.?)\s*\.?\s*(\d{4,})/gi;
  const matches = [...text.matchAll(fabricatedPattern)];
  const fabricated = matches.filter(m => parseInt(m[1]) > 999);
  return { type: "no_fabricated_sources", passed: fabricated.length === 0, message: fabricated.length === 0 ? "No fabricated sources" : `Fabricated: ${fabricated.map(m => m[0]).join(", ")}` };
}

function checkLanguageMatch(response: Record<string, unknown>, expectedLang?: string): InvariantResult {
  if (!expectedLang) return { type: "language_match", passed: true, message: "No expected language, skipped" };
  const text = extractText(response);
  const sample = text.substring(0, 500);
  let detected: string;
  if (/[\u0531-\u058F]/.test(sample)) detected = "hy";
  else if (/[\u0400-\u04FF]/.test(sample)) detected = "ru";
  else detected = "en";
  const passed = detected === expectedLang;
  return { type: "language_match", passed, message: passed ? `Language matches: ${expectedLang}` : `Expected ${expectedLang}, detected ${detected}` };
}

async function checkTemporalInRange(
  response: Record<string, unknown>, referenceDate: string, supabase: SupabaseClient,
  targetFunction?: string, citedIdsFailed?: boolean,
): Promise<InvariantResult & { temporal_metadata_source: TemporalMetadataSource }> {
  if (!referenceDate) return { type: "temporal_in_range", passed: true, message: "No reference_date, skipped", temporal_metadata_source: "none" };
  if (citedIdsFailed) return { type: "temporal_in_range", passed: false, message: "Skipped: cited_ids_exist failed", temporal_metadata_source: "none" };

  const citations = extractCitations(response, targetFunction);
  const kbCitations = citations.filter(c => c.source_type === "kb");
  if (kbCitations.length === 0) return { type: "temporal_in_range", passed: true, message: "No KB citations", temporal_metadata_source: "none" };

  const refDate = normalizeReferenceDate(referenceDate);
  const withMeta = kbCitations.filter(c => c.effective_from != null || c.effective_to != null);
  const withoutMeta = kbCitations.filter(c => c.effective_from == null && c.effective_to == null);

  let metadataSource: TemporalMetadataSource;
  const citationsMap = new Map<string, { doc_id: string; title: string; effective_from: string | null; effective_to: string | null }>();

  for (const c of withMeta) {
    if (!citationsMap.has(c.doc_id)) citationsMap.set(c.doc_id, { doc_id: c.doc_id, title: c.title, effective_from: c.effective_from ?? null, effective_to: c.effective_to ?? null });
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
      if (notFound.length > 0) return { type: "temporal_in_range", passed: false, message: `${notFound.length} KB doc(s) not found`, temporal_metadata_source: "db_fallback" };
      for (const d of docs || []) if (!citationsMap.has(d.id)) citationsMap.set(d.id, { doc_id: d.id, title: d.title, effective_from: d.effective_from, effective_to: d.effective_to });
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
    message: violations.length === 0 ? `All ${citationsToCheck.length} KB docs temporally valid (${metadataSource})` : `${violations.length} temporal violation(s)`,
    details: violations.length > 0 ? { violations, metadata_source: metadataSource } : { metadata_source: metadataSource },
    temporal_metadata_source: metadataSource,
  };
}

function checkAgentSchemaValid(response: Record<string, unknown>, targetFunction: string): InvariantResult {
  if (targetFunction === "vector-search") {
    const hasKb = Array.isArray(response.kb);
    const hasPractice = Array.isArray(response.practice);
    return { type: "agent_schema_valid", passed: hasKb && hasPractice, message: hasKb && hasPractice ? "Valid schema" : "Missing kb/practice" };
  }
  if (targetFunction === "ai-analyze") {
    const hasResult = typeof response.analysis_result === "string" || typeof response.result === "string";
    return { type: "agent_schema_valid", passed: hasResult, message: hasResult ? "Has analysis result" : "Missing analysis_result" };
  }
  const hasContent = Object.keys(response).length > 0;
  return { type: "agent_schema_valid", passed: hasContent, message: hasContent ? "Non-empty" : "Empty response" };
}

// ── P0 Hardening invariants ──────────────────────────────────────────────────

function checkHttpStatus(actual: number, params?: Record<string, unknown>): InvariantResult {
  const expected = (params?.expected as number) || 200;
  return { type: "http_status_check", passed: actual === expected, message: actual === expected ? `HTTP ${actual} ✓` : `HTTP ${actual} ≠ expected ${expected}`, details: { actual, expected } };
}

function checkHeader(headers: Record<string, string>, params?: Record<string, unknown>): InvariantResult {
  const headerName = ((params?.header as string) || "").toLowerCase();
  const contains = ((params?.contains as string) || "").toLowerCase();
  const headerValue = (headers[headerName] || "").toLowerCase();
  const passed = headerValue.includes(contains);
  return { type: "header_check", passed, message: passed ? `'${headerName}' contains '${contains}' ✓` : `'${headerName}'='${headerValue}' missing '${contains}'`, details: { header: headerName, expected_contains: contains, actual: headerValue } };
}

function checkField(body: Record<string, unknown>, params?: Record<string, unknown>): InvariantResult {
  const field = (params?.field as string) || "";
  const equals = params?.equals;
  const actual = body[field];
  const passed = actual === equals;
  return { type: "field_check", passed, message: passed ? `body.${field}='${equals}' ✓` : `body.${field}='${actual}' ≠ '${equals}'`, details: { field, expected: equals, actual } };
}

/**
 * multi_call_status_sequence (v2.3):
 * - If params.expected_statuses is an array, check full sequence match.
 * - Else fallback to checking only last status via expected_last_status.
 * - Always check expected_last_reason against last body.
 */
function checkMultiCallSequence(callResults: CallResult[], params?: Record<string, unknown>): InvariantResult {
  if (callResults.length === 0) {
    return { type: "multi_call_status_sequence", passed: false, message: "No call results" };
  }

  const statuses = callResults.map(r => r.status);
  const last = callResults[callResults.length - 1];
  const expectedLastReason = (params?.expected_last_reason as string) || "";

  // v2.3: full sequence check via expected_statuses[]
  const expectedStatuses = params?.expected_statuses as number[] | undefined;
  if (expectedStatuses && Array.isArray(expectedStatuses)) {
    if (expectedStatuses.length !== statuses.length) {
      return {
        type: "multi_call_status_sequence",
        passed: false,
        message: `Status count mismatch: got ${statuses.length} calls, expected ${expectedStatuses.length}. Actual: [${statuses.join(",")}]`,
        details: { statuses, expected_statuses: expectedStatuses, last_body: last.body },
      };
    }

    const mismatches: string[] = [];
    for (let i = 0; i < expectedStatuses.length; i++) {
      if (statuses[i] !== expectedStatuses[i]) {
        mismatches.push(`call[${i}]: got ${statuses[i]}, expected ${expectedStatuses[i]}`);
      }
    }

    const reasonMatch = !expectedLastReason ||
      (last.body?.reason === expectedLastReason || last.body?.error === expectedLastReason);

    if (!reasonMatch) {
      mismatches.push(`last reason: got '${last.body?.reason || last.body?.error}', expected '${expectedLastReason}'`);
    }

    const passed = mismatches.length === 0;
    return {
      type: "multi_call_status_sequence",
      passed,
      message: passed
        ? `Sequence [${statuses.join(",")}] matches expected [${expectedStatuses.join(",")}], reason='${expectedLastReason}' ✓`
        : `Mismatches: ${mismatches.join("; ")}`,
      details: { statuses, expected_statuses: expectedStatuses, last_body: last.body },
    };
  }

  // Fallback: check only last status
  const expectedLastStatus = (params?.expected_last_status as number) || 429;
  const statusMatch = last.status === expectedLastStatus;
  const reasonMatch = !expectedLastReason || (last.body?.reason === expectedLastReason || last.body?.error === expectedLastReason);
  const passed = statusMatch && reasonMatch;

  return {
    type: "multi_call_status_sequence",
    passed,
    message: passed
      ? `Last=${expectedLastStatus}, reason='${expectedLastReason}' ✓. Seq: [${statuses.join(",")}]`
      : `Expected last=${expectedLastStatus} reason='${expectedLastReason}', got ${last.status}. Seq: [${statuses.join(",")}]`,
    details: { statuses, last_body: last.body, expected_last_status: expectedLastStatus, expected_last_reason: expectedLastReason },
  };
}

// ── Helper ───────────────────────────────────────────────────────────────────

function extractText(response: Record<string, unknown>): string {
  for (const key of ["analysis_result", "result", "text", "content", "translated", "response_text", "full_report"]) {
    if (typeof response[key] === "string") return response[key] as string;
  }
  if (Array.isArray(response.kb)) {
    return (response.kb as Array<{ title?: string; content_text?: string }>).map(r => `${r.title || ""} ${r.content_text || ""}`).join(" ");
  }
  return JSON.stringify(response);
}

function headersToRecord(headers: Headers): Record<string, string> {
  const rec: Record<string, string> = {};
  headers.forEach((v, k) => { rec[k.toLowerCase()] = v; });
  return rec;
}

// ── Deterministic test setup ────────────────────────────────────────────────

/**
 * Setup eval_client user for rate-limit/budget tests.
 * - Ensures user_roles has role=client
 * - Sets role_limits for client: hourly=2, monthly_token=10, monthly_cost=999
 * - Clears api_usage for this user (current hour + month)
 * Returns the user_id or null if env not configured.
 */
async function setupEvalClient(supabase: SupabaseClient): Promise<{ userId: string | null; jwt: string | null; setupLog: string[] }> {
  const setupLog: string[] = [];
  const evalEmail = Deno.env.get("EVAL_CLIENT_EMAIL");
  const evalJwt = Deno.env.get("EVAL_CLIENT_JWT");

  if (!evalEmail || !evalJwt) {
    setupLog.push("EVAL_CLIENT_EMAIL or EVAL_CLIENT_JWT not set — rate limit tests will use service-role (may not trigger limits)");
    return { userId: null, jwt: null, setupLog };
  }

  // Find user by email via admin API
  const { data: userList, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    setupLog.push(`Failed to list users: ${listErr.message}`);
    return { userId: null, jwt: evalJwt, setupLog };
  }

  const evalUser = userList.users.find(u => u.email === evalEmail);
  if (!evalUser) {
    setupLog.push(`User ${evalEmail} not found in auth.users — create this user first`);
    return { userId: null, jwt: evalJwt, setupLog };
  }

  const userId = evalUser.id;
  setupLog.push(`Found eval user: ${userId} (${evalEmail})`);

  // Ensure role=client in user_roles
  const { data: existingRole } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "client")
    .maybeSingle();

  if (!existingRole) {
    const { error: roleErr } = await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role: "client" }, { onConflict: "user_id,role" });
    if (roleErr) setupLog.push(`Failed to set role: ${roleErr.message}`);
    else setupLog.push("Set role=client ✓");
  } else {
    setupLog.push("Role=client already exists ✓");
  }

  // Upsert role_limits for client
  const { error: limitsErr } = await supabase
    .from("role_limits")
    .upsert(
      { role: "client", hourly_limit: 2, monthly_token_limit: 10, monthly_cost_limit: 999 },
      { onConflict: "role" },
    );
  if (limitsErr) setupLog.push(`Failed to set role_limits: ${limitsErr.message}`);
  else setupLog.push("role_limits client: hourly=2, monthly_token=10 ✓");

  // Clear api_usage for this user (current hour + month)
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { error: clearErr } = await supabase
    .from("api_usage")
    .delete()
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo);
  if (clearErr) setupLog.push(`Failed to clear hourly api_usage: ${clearErr.message}`);
  else setupLog.push("Cleared api_usage (last hour) ✓");

  // Also clear monthly usage
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { error: clearMonthErr } = await supabase
    .from("api_usage")
    .delete()
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());
  if (clearMonthErr) setupLog.push(`Failed to clear monthly api_usage: ${clearMonthErr.message}`);
  else setupLog.push("Cleared api_usage (current month) ✓");

  return { userId, jwt: evalJwt, setupLog };
}

// ── Call helper (v2.3: Authorization logic) ─────────────────────────────────

async function callEdgeFunction(
  supabaseUrl: string,
  serviceKey: string,
  anonKey: string,
  targetFunction: string,
  payload: Record<string, unknown>,
): Promise<CallResult> {
  const method = (payload._method as string) || "POST";
  const extraHeaders = (payload._headers as Record<string, string>) || {};

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
      "apikey": anonKey,
    };

    // Authorization: explicit > skip for OPTIONS > fallback to service key
    const explicitAuth = extraHeaders.Authorization || extraHeaders.authorization;
    if (explicitAuth) {
      headers["Authorization"] = explicitAuth;
    } else if (method !== "OPTIONS") {
      headers["Authorization"] = `Bearer ${serviceKey}`;
    }
    // For OPTIONS without explicit auth: no Authorization header at all

    // Merge remaining extra headers (except Authorization which we handled)
    for (const [k, v] of Object.entries(extraHeaders)) {
      if (k.toLowerCase() !== "authorization") {
        headers[k] = v;
      }
    }

    const fetchOpts: RequestInit = { method, headers, signal: controller.signal };
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

    const respHeaders = headersToRecord(response.headers);
    return { status: response.status, headers: respHeaders, body: responseBody, latencyMs };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Payload preprocessor: inject EVAL_CLIENT_JWT into _headers ───────────────

function preprocessPayload(
  payload: Record<string, unknown>,
  evalJwt: string | null,
): Record<string, unknown> {
  const p = { ...payload };
  const headers = { ...((p._headers as Record<string, string>) || {}) };

  // Replace __EVAL_CLIENT_JWT__ placeholder with actual JWT (both cases)
  if (evalJwt) {
    if (headers.Authorization === "__EVAL_CLIENT_JWT__") {
      headers.Authorization = `Bearer ${evalJwt}`;
    }
    if (headers.authorization === "__EVAL_CLIENT_JWT__") {
      headers.authorization = `Bearer ${evalJwt}`;
    }
  }

  p._headers = headers;
  return p;
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const authErr = validateBrowserRequest(req, corsHeaders);
  if (authErr) return authErr;

  try {
    const { suite_id } = await req.json();
    if (!suite_id) return json({ error: "suite_id is required" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: cases, error: casesErr } = await supabase
      .from("eval_cases")
      .select("*")
      .eq("suite_id", suite_id)
      .eq("is_active", true)
      .order("created_at");

    if (casesErr) return json({ error: `Failed to fetch cases: ${casesErr.message}` }, 500);
    if (!cases || cases.length === 0) return json({ error: "No active eval cases in suite" }, 404);

    // ── Deterministic setup for P0 rate-limit tests ──────────────────────
    const { jwt: evalJwt, setupLog } = await setupEvalClient(supabase);
    log("eval-runner", "Setup complete", { setupLog });

    const { data: run, error: runErr } = await supabase
      .from("eval_runs")
      .insert({
        suite_id,
        status: "running",
        total_cases: cases.length,
        started_at: new Date().toISOString(),
        metadata: { version: "2.3", setup_log: setupLog },
      })
      .select()
      .single();

    if (runErr) return json({ error: `Failed to create run: ${runErr.message}` }, 500);

    log("eval-runner", "Starting eval run v2.3", { run_id: run.id, total_cases: cases.length });

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
        const rawPayload = evalCase.input_payload as Record<string, unknown>;
        const inputPayload = preprocessPayload(rawPayload, evalJwt);

        let callResults: CallResult[];

        if (caseMode === "multi_call") {
          const callCount = (inputPayload._call_count as number) || 3;
          callResults = [];
          for (let i = 0; i < callCount; i++) {
            const result = await callEdgeFunction(supabaseUrl, supabaseServiceKey, supabaseAnonKey, evalCase.target_function, inputPayload);
            callResults.push(result);
            log("eval-runner", `multi_call ${i + 1}/${callCount}`, { status: result.status, fn: evalCase.target_function });
          }
        } else {
          const result = await callEdgeFunction(supabaseUrl, supabaseServiceKey, supabaseAnonKey, evalCase.target_function, inputPayload);
          callResults = [result];
        }

        const totalLatency = Date.now() - t0;
        const lastCall = callResults[callResults.length - 1];
        const responseBody = lastCall.body;
        const responseHeaders = lastCall.headers;
        const httpStatus = lastCall.status;

        const invariants: InvariantResult[] = [];
        const invariantDefs = (evalCase.invariants || []) as InvariantDef[];
        let temporalMetadataSource: string | undefined;
        let citedIdsFailed = false;

        for (const inv of invariantDefs) {
          switch (inv.type) {
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
              invariants.push({ type: inv.type, passed: true, message: `Unknown '${inv.type}', skipped` });
          }
        }

        const allPassed = invariants.every(i => i.passed);
        const caseStatus = allPassed ? "pass" : "fail";
        if (allPassed) passed++;
        else failed++;

        const temporalViolations = invariants.filter(i => i.type === "temporal_in_range" && !i.passed).map(i => i.details);

        results.push({ case_name: evalCase.name, status: caseStatus, invariants, latency_ms: totalLatency, http_status: httpStatus, temporal_metadata_source: temporalMetadataSource });

        // Sanitize headers: never persist auth secrets
        const sanitizedHeaders = { ...responseHeaders };
        delete sanitizedHeaders["authorization"];
        delete sanitizedHeaders["apikey"];

        await supabase.from("eval_run_results").insert({
          run_id: run.id,
          case_id: evalCase.id,
          status: caseStatus,
          raw_response: caseMode === "multi_call" ? { calls: callResults.map(r => ({ status: r.status, body: r.body })) } : responseBody,
          invariant_results: invariants,
          temporal_violations: temporalViolations.length > 0 ? temporalViolations : null,
          temporal_metadata_source: temporalMetadataSource || null,
          latency_ms: totalLatency,
          http_status: httpStatus,
          response_headers: sanitizedHeaders,
        });
      } catch (caseErr) {
        const latencyMs = Date.now() - t0;
        skipped++;
        const errorMsg = caseErr instanceof Error ? caseErr.message : String(caseErr);
        results.push({ case_name: evalCase.name, status: "skipped", invariants: [{ type: "execution", passed: false, message: `Error: ${errorMsg}` }], latency_ms: latencyMs });
        await supabase.from("eval_run_results").insert({ run_id: run.id, case_id: evalCase.id, status: "skipped", error_message: errorMsg, latency_ms: latencyMs, temporal_metadata_source: null });
      }
    }

    await supabase.from("eval_runs").update({ status: failed > 0 ? "failed" : "passed", passed, failed, skipped, completed_at: new Date().toISOString() }).eq("id", run.id);

    log("eval-runner", "Eval run v2.3 complete", { run_id: run.id, passed, failed, skipped });

    return json({ run_id: run.id, passed, failed, skipped, total: cases.length, setup_log: setupLog, results });
  } catch (error) {
    err("eval-runner", "Runner error", { error });
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
