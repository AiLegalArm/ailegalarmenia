// -*- coding: utf-8 -*-
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors } from "../_shared/edge-security.ts";

// =======================================
// Unicode escape normalizer
// =======================================

interface NormalizeResult {
  text: string;
  invalidEscapeFound: boolean;
}

/**
 * Convert literal \uXXXX sequences in a string to actual Unicode characters.
 * Handles surrogate pairs (\uD800-\uDBFF followed by \uDC00-\uDFFF).
 * Does NOT touch \n, \t, \\, or other standard escapes.
 * Invalid sequences (e.g. \u12G4, \u123) are left as-is.
 */
function normalizeUnicodeEscapes(input: string): NormalizeResult {
  let invalidEscapeFound = false;

  // First pass: handle surrogate pairs
  let result = input.replace(
    /\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g,
    (_match, hex1: string, hex2: string) => {
      const cp1 = parseInt(hex1, 16);
      const cp2 = parseInt(hex2, 16);
      const codePoint = ((cp1 - 0xD800) * 0x400) + (cp2 - 0xDC00) + 0x10000;
      return String.fromCodePoint(codePoint);
    }
  );

  // Second pass: handle regular BMP escapes
  result = result.replace(
    /\\u([0-9a-fA-F]{4})/g,
    (_match, hex: string) => {
      const cp = parseInt(hex, 16);
      if (cp === 0) { invalidEscapeFound = true; return ""; }
      // Lone surrogate — leave as-is
      if (cp >= 0xD800 && cp <= 0xDFFF) { invalidEscapeFound = true; return _match; }
      return String.fromCharCode(cp);
    }
  );

  // Check for incomplete sequences like \u123 or \u12G4
  if (/\\u(?![0-9a-fA-F]{4})/.test(result)) {
    invalidEscapeFound = true;
  }

  return { text: result, invalidEscapeFound };
}

/**
 * Aggressively sanitize a string for PostgreSQL compatibility:
 * 1. Decode literal \uXXXX escapes to real chars
 * 2. Strip NUL bytes (U+0000)
 * 3. Strip lone surrogates (U+D800-U+DFFF) that break JSON→PG pipeline
 * 4. Strip other problematic control chars
 */
function sanitizeString(s: unknown): string {
  if (typeof s !== "string") return String(s ?? "");
  const { text } = normalizeUnicodeEscapes(s);
  return text
    // Strip real NUL bytes
    .replace(/\x00/g, "")
    // Strip lone surrogates (invalid in UTF-8, cause PG "unsupported Unicode escape")
    .replace(/[\uD800-\uDFFF]/g, "")
    // Strip other dangerous control chars (keep \t \n \r)
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

type AnyRow = Record<string, unknown>;

/**
 * Deep-sanitize any value: strings, arrays, plain objects — recursively.
 * This ensures NO unsanitized string reaches PostgreSQL, regardless of field name.
 */
function deepSanitize(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(deepSanitize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepSanitize(v);
    }
    return out;
  }
  return value; // number, boolean, null — pass through
}

/** Apply deep sanitization to every field in a row */
function sanitizeRow(row: AnyRow): AnyRow {
  return deepSanitize(row) as AnyRow;
}

/**
 * Nuclear safety net: sanitize the JSON wire representation itself.
 * Removes \u0000 and lone surrogates from the serialized JSON string,
 * guaranteeing PostgreSQL will never see them.
 */
function safeJsonRoundtrip<T>(data: T): T {
  const json = JSON.stringify(data);
  // Remove JSON-encoded NUL (\u0000) and lone surrogates (\uD800-\uDFFF)
  const cleaned = json
    .replace(/\\u0000/g, "")
    .replace(/\\u[dD][89abAB][0-9a-fA-F]{2}/gi, "");
  return JSON.parse(cleaned) as T;
}

// =======================================
// Chunking utilities (mirrors kb-backfill-chunks)
// =======================================

function splitIntoChunks(text: string, chunkSize: number, overlap = 200): { idx: number; text: string }[] {
  const t = text.replace(/\r\n/g, "\n");
  const chunks: { idx: number; text: string }[] = [];
  let start = 0;
  let i = 0;

  while (start < t.length) {
    const end = Math.min(start + chunkSize, t.length);
    const slice = t.slice(start, end);
    const chunkText = slice.trim();
    if (chunkText.length > 0) chunks.push({ idx: i++, text: chunkText });
    if (end === t.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function computeChunkHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

// =======================================
// Types
// =======================================

type PracticeCategory = "criminal" | "civil" | "administrative" | "constitutional" | "echr";
type CourtType = "first_instance" | "appeal" | "cassation" | "constitutional" | "echr";
type Outcome = "granted" | "rejected" | "partial" | "remanded" | "discontinued";
type AppliedCode =
  | "criminal_code"
  | "civil_code"
  | "administrative_code"
  | "criminal_procedure_code"
  | "civil_procedure_code"
  | "administrative_procedure_code"
  | "constitution"
  | "echr";

interface ExtractedData {
  title: string | null;
  practice_category: PracticeCategory | null;
  court_type: CourtType | null;
  outcome: Outcome | null;
  court_name: string | null;
  case_number: string | null;
  decision_date: string | null;
  applied_articles: Record<string, unknown>;
  key_violations: string[];
  legal_reasoning_summary: string | null;
  content_text: string;
}

// =======================================
// Runtime validation (strict, no deps)
// =======================================

const PRACTICE: Set<string> = new Set(["criminal", "civil", "administrative", "constitutional", "echr"]);
const COURT: Set<string> = new Set(["first_instance", "appeal", "cassation", "constitutional", "echr"]);
const OUTCOME: Set<string> = new Set(["granted", "rejected", "partial", "remanded", "discontinued"]);
const APPLIED: Set<string> = new Set([
  "criminal_code",
  "civil_code",
  "administrative_code",
  "criminal_procedure_code",
  "civil_procedure_code",
  "administrative_procedure_code",
  "constitution",
  "echr",
]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isEnumOrNull(v: unknown, set: Set<string>): boolean {
  return v === null || (typeof v === "string" && set.has(v));
}

function isISODateOrNull(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2100) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

function validateExtractedData(raw: unknown): ExtractedData {
  if (!isObject(raw)) throw new Error("Invalid JSON: root is not an object");

  const requiredKeys: Array<keyof ExtractedData> = [
    "title",
    "practice_category",
    "court_type",
    "outcome",
    "court_name",
    "case_number",
    "decision_date",
    "applied_articles",
    "key_violations",
    "legal_reasoning_summary",
    "content_text",
  ];

  for (const k of Object.keys(raw)) {
    if (!requiredKeys.includes(k as keyof ExtractedData)) {
      throw new Error(`Invalid JSON: extra key "${k}"`);
    }
  }

  for (const k of requiredKeys) {
    if (!(k in raw)) throw new Error(`Invalid JSON: missing key "${k}"`);
  }

  if (!isStringOrNull(raw.title)) throw new Error("Invalid: title");
  if (!isEnumOrNull(raw.practice_category, PRACTICE)) throw new Error("Invalid: practice_category");
  if (!isEnumOrNull(raw.court_type, COURT)) throw new Error("Invalid: court_type");
  if (!isEnumOrNull(raw.outcome, OUTCOME)) throw new Error("Invalid: outcome");
  if (!isStringOrNull(raw.court_name)) throw new Error("Invalid: court_name");
  if (!isStringOrNull(raw.case_number)) throw new Error("Invalid: case_number");
  if (!isISODateOrNull(raw.decision_date)) throw new Error("Invalid: decision_date");
  if (!isStringOrNull(raw.legal_reasoning_summary)) throw new Error("Invalid: legal_reasoning_summary");
  if (typeof raw.content_text !== "string") throw new Error("Invalid: content_text");

  // Validate applied_articles — accept new {sources:[...]} format or legacy array format
  if (isObject(raw.applied_articles)) {
    // New format: {sources: [{act, articles: [{article, part, point, context}]}]}
    const aa = raw.applied_articles as Record<string, unknown>;
    if (!Array.isArray(aa.sources)) {
      (raw as Record<string, unknown>).applied_articles = { sources: [] };
    }
  } else if (Array.isArray(raw.applied_articles)) {
    // Legacy format — wrap or keep as-is (stored as JSON anyway)
    (raw as Record<string, unknown>).applied_articles = { sources: [] };
  } else {
    (raw as Record<string, unknown>).applied_articles = { sources: [] };
  }

  if (!isStringArray(raw.key_violations)) throw new Error("Invalid: key_violations");

  return raw as ExtractedData;
}

// =======================================
// System prompt (production-grade)
// =======================================

const DECISION_EXTRACTOR_SYSTEM_PROMPT = `You are a Legal Document Analyzer Agent for the Republic of Armenia (RA).
Your role is strictly limited to extracting structured metadata from a provided court decision text.

HARD RULES
1) Extraction-only: use ONLY explicit information present in the text.
2) No inventions, no guessing, no "best effort" completion, no correction of the text.
3) No translation. Preserve the original language (HY/RU/EN) in all VALUES.
4) Output: return ONLY a valid JSON object matching the exact schema. No markdown, no comments, no extra keys.
5) Missing/ambiguous data:
   - Scalars -> null
   - Arrays -> []
   - Never output placeholders like "_____", "N/A", "delays".
6) Allowed transformations are limited to:
   - decision_date normalization to YYYY-MM-DD if the decision date is explicit and unambiguous
   - content_text light cleanup (remove obvious duplicate headers/footers only if clearly repeated; preserve paragraph breaks)

ENUMS (no match -> null)
- practice_category: "criminal" | "civil" | "administrative" | "constitutional" | "echr"
- court_type: "first_instance" | "appeal" | "cassation" | "constitutional" | "echr"
- outcome: "granted" | "rejected" | "partial" | "remanded" | "discontinued"

CATEGORIZATION POLICY (STRICT KEYWORD MATCHING ONLY; do not assume)
- practice_category:
  - echr: explicit "\u0544\u053B\u0535\u0534" / "ECHR" / "European Court of Human Rights"
  - constitutional: explicit "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576"
  - administrative: explicit "\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576" / "\u054E\u0534\u0555" / "\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E"
  - criminal: explicit "\u0584\u0580\u0565\u0561\u056F\u0561\u0576" / "\u0554\u053F" / "\u0554\u0580\u0534\u0555" / "\u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E"
  - civil: explicit "\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576" / "\u0554\u0555" / "\u0554\u0561\u0572\u0534\u0555" / "\u0570\u0561\u0575\u0581" / "\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E"
  - If multiple match and primary is not explicit -> null

- court_type:
  - echr: deciding body is ECHR/\u0544\u053B\u0535\u0534
  - constitutional: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576"
  - cassation: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F"
  - appeal: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579"
  - first_instance: explicit first instance wording (e.g., "\u0531\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576", or an \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 court acting as first instance)
  - Otherwise -> null

- outcome: must be explicit in the operative/dispositive part; otherwise null

FIELD INSTRUCTIONS
- title: prefer official header; otherwise create a concise descriptive title using ONLY explicit text; keep language consistent with the decision.
- court_name: exact court name as written.
- case_number: extract the main case number exactly as written in the text. Do NOT anonymize or redact any part of it.
- decision_date: pick the explicit decision/act issuance date (e.g., "\u0578\u0580\u0578\u0577\u0578\u0582\u0574", "\u057E\u0573\u056B\u057C"). If unclear or multiple conflicting dates -> null.
- applied_articles: extract only explicit references (e.g. "61-\u0580\u0564 \u0570\u0578\u0564\u057E\u0561\u056E", "\u0570\u0578\u0564\u057E\u0561\u056E 61", "61-\u0580\u0564 \u0570\u0578\u0564\u057E\u0561\u056E\u056B 1-\u056B\u0576 \u0574\u0561\u057D"). Do NOT invent articles. Group by legal act name. For each article include 1-2 sentences of context from surrounding text (max 300 chars). Remove duplicates.
  Output format for applied_articles:
  {"sources":[{"act":"<legal act name e.g. \u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u056B\u0580\u0584>","articles":[{"article":"<number only>","part":"<number or empty>","point":"<number or empty>","context":"<max 300 chars from text>"}]}]}
  Use the actual Armenian name of the legal act as it appears in the text. If no articles found: {"sources":[]}
- key_violations: include only explicit violation/issue phrases present in text; otherwise [].
- legal_reasoning_summary: 2\u20133 sentences, faithful, strictly based on explicit reasoning; no new facts; if insufficient text -> null.
- content_text: full text with minimal cleanup; preserve breaks, citations, names and all personal data as-is. Do NOT anonymize or redact anything.

CRITICAL: All string values in your JSON output MUST use actual UTF-8 Armenian characters, NOT unicode escape sequences like \\u0555. Write real Armenian letters.

OUTPUT SCHEMA (EXACT KEYS, NO EXTRA KEYS)
{
  "title": string|null,
  "practice_category": "criminal"|"civil"|"administrative"|"constitutional"|"echr"|null,
  "court_type": "first_instance"|"appeal"|"cassation"|"constitutional"|"echr"|null,
  "outcome": "granted"|"rejected"|"partial"|"remanded"|"discontinued"|null,
  "court_name": string|null,
  "case_number": string|null,
  "decision_date": string|null,
  "applied_articles": {"sources":[{"act":"...","articles":[{"article":"...","part":"...","point":"...","context":"..."}]}]},
  "key_violations": ["..."],
  "legal_reasoning_summary": string|null,
  "content_text": string
}`;

// =======================================
// AI extractor
// =======================================

async function extractWithAI(textContent: string, apiKey: string): Promise<ExtractedData> {
  const input = (textContent ?? "").trim();
  if (!input) {
    return {
      title: null,
      practice_category: null,
      court_type: null,
      outcome: null,
      court_name: null,
      case_number: null,
      decision_date: null,
      applied_articles: { sources: [] },
      key_violations: [],
      legal_reasoning_summary: null,
      content_text: "",
    };
  }

  const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");
  const bypassResult = await callGatewayBypass(
    [
      { role: "system", content: DECISION_EXTRACTOR_SYSTEM_PROMPT },
      { role: "user", content: input.substring(0, 50000) },
    ],
    {
      functionName: "legal-practice-import",
      bypassReason: "json_extract",
      timeoutMs: 60000,
      maxRetries: 2,
    }
  );

  const payload = bypassResult.data;
  const content = (payload?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI extraction failed: empty model content");
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.slice(7);
  }
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith("```")) {
    jsonStr = jsonStr.slice(0, -3);
  }
  jsonStr = jsonStr.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error("AI extraction failed: response is not valid JSON");
  }

  return validateExtractedData(parsed);
}

// =======================================
// Targeted extraction for missing fields only
// =======================================

async function extractMissingWithAI(
  textContent: string,
  missingFields: string[],
  apiKey: string
): Promise<Record<string, unknown>> {
  // Use only first 15K chars — metadata is usually in the header
  const input = (textContent ?? "").trim().substring(0, 15000);
  if (!input) return {};

  const fieldInstructions: Record<string, string> = {
    title: '"title": string — official header or concise descriptive title',
    practice_category: '"practice_category": "criminal"|"civil"|"administrative"|"constitutional"|"echr"|null',
    court_type: '"court_type": "first_instance"|"appeal"|"cassation"|"constitutional"|"echr"|null',
    outcome: '"outcome": "granted"|"rejected"|"partial"|"remanded"|"discontinued"|null',
    court_name: '"court_name": string — exact court name as written',
    case_number: '"case_number": string — case number exactly as written, no anonymization',
    decision_date: '"decision_date": string — YYYY-MM-DD format or null',
    applied_articles: '"applied_articles": {"sources":[{"act":"<legal act name>","articles":[{"article":"<number>","part":"<number or empty>","point":"<number or empty>","context":"<max 300 chars>"}]}]}',
    key_violations: '"key_violations": ["..."] — explicit violation phrases from text',
    legal_reasoning_summary: '"legal_reasoning_summary": string — 2-3 sentences of explicit reasoning',
  };

  const schema = missingFields.map((f) => fieldInstructions[f] || `"${f}": unknown`).join(",\n  ");

  const prompt = `Extract ONLY these fields from the court decision text. Return valid JSON with exactly these keys. Use null for missing scalars, [] for missing arrays. No markdown, no extra keys.

{
  ${schema}
}

CRITICAL RULES:
1. Extraction-only, no guessing, no translation.
2. PRESERVE THE ORIGINAL LANGUAGE of the document in ALL values. If the text is in Armenian, all extracted strings MUST be in Armenian. If in Russian, keep Russian. NEVER translate to English.
3. All string values must use actual UTF-8 characters, not unicode escapes.`;

  let resp: Response | null = null;
  try {
    const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");
    const bypassResult = await callGatewayBypass(
      [
        { role: "system", content: prompt },
        { role: "user", content: input },
      ],
      {
        functionName: "legal-practice-import",
        bypassReason: "json_extract",
        timeoutMs: 30000,
        maxRetries: 2,
      }
    );
    // Extract content from bypass result
    const content = (bypassResult.data?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return {};

    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    try {
      const parsed = JSON.parse(jsonStr);
      if (!isObject(parsed)) return {};
      // Validate applied_articles — accept new {sources:[...]} format
      if (isObject(parsed.applied_articles)) {
        const aa = parsed.applied_articles as Record<string, unknown>;
        if (!Array.isArray(aa.sources)) {
          parsed.applied_articles = { sources: [] };
        }
      } else if (!Array.isArray(parsed.applied_articles)) {
        parsed.applied_articles = { sources: [] };
      }
      // Validate enums
      if (parsed.practice_category && !PRACTICE.has(parsed.practice_category as string)) parsed.practice_category = null;
      if (parsed.court_type && !COURT.has(parsed.court_type as string)) parsed.court_type = null;
      if (parsed.outcome && !OUTCOME.has(parsed.outcome as string)) parsed.outcome = null;
      if (parsed.decision_date && !isISODateOrNull(parsed.decision_date)) parsed.decision_date = null;
      return parsed;
    } catch {
      return {};
    }
  } catch (e) {
    console.error("aiExtractMissing bypass error:", e);
    return {};
  }
}

// =======================================
// HTTP handler
// =======================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // === AUTH GUARD (Prevent Anonymous Access) ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ADMIN ROLE CHECK ===
    const { data: isAdmin } = await sb.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin',
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END AUTH GUARD ===

    const body = await req.json();
    const { textContent, fileName, enrichDocId, bulkItems } = body;

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminDb = createClient(supabaseUrl, supabaseServiceKey);

    // === ENRICH MODE: update existing record (only missing fields) ===
    if (enrichDocId) {
      const { data: existingDoc, error: fetchErr } = await adminDb
        .from("legal_practice_kb")
        .select("id, content_text, title, practice_category, court_type, outcome, court_name, case_number_anonymized, decision_date, applied_articles, key_violations, legal_reasoning_summary")
        .eq("id", enrichDocId)
        .single();

      if (fetchErr || !existingDoc) {
        return new Response(JSON.stringify({ error: "Document not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Determine which fields are missing
      const missingFields: string[] = [];
      const ENRICHABLE = [
        "title", "practice_category", "court_type", "outcome", "court_name",
        "case_number", "decision_date", "applied_articles",
        "key_violations", "legal_reasoning_summary",
      ] as const;

      // Map DB column names to AI field names
      const dbToAi: Record<string, string> = { case_number_anonymized: "case_number" };
      const aiToDb: Record<string, string> = { case_number: "case_number_anonymized" };

      for (const f of ENRICHABLE) {
        const dbCol = aiToDb[f] || f;
        const v = existingDoc[dbCol];
        if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
          missingFields.push(f);
        } else if (f === "applied_articles" && typeof v === "object" && !Array.isArray(v)) {
          // Check if applied_articles is {sources: []} — treat as missing
          const aa = v as Record<string, unknown>;
          if (Array.isArray(aa.sources) && aa.sources.length === 0) {
            missingFields.push(f);
          }
        }
      }

      // Skip AI entirely if all fields are populated
      if (missingFields.length === 0) {
        return new Response(JSON.stringify({ success: true, enriched: false, message: "All fields already populated" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Enriching doc ${enrichDocId}, missing: ${missingFields.join(", ")}, text length: ${existingDoc.content_text.length}`);

      // Use targeted extraction for only missing fields
      const extractedData = await extractMissingWithAI(existingDoc.content_text, missingFields, lovableApiKey);
      console.log(`Enriched missing fields: ${JSON.stringify(extractedData)}`);

      const updatePayload: Record<string, unknown> = {};
      for (const f of missingFields) {
        const v = (extractedData as Record<string, unknown>)[f];
        if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
          const dbCol = aiToDb[f] || f;
          updatePayload[dbCol] = v;
        }
      }

      if (Object.keys(updatePayload).length === 0) {
        return new Response(JSON.stringify({ success: true, enriched: false, message: "No metadata extracted" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateErr } = await adminDb
        .from("legal_practice_kb")
        .update(updatePayload)
        .eq("id", enrichDocId);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ success: true, enriched: true, updated_fields: Object.keys(updatePayload) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === BULK IMPORT MODE ===
    if (Array.isArray(bulkItems) && bulkItems.length > 0) {
      const jobId = crypto.randomUUID().slice(0, 8);
      console.log(`[bulk-import] job=${jobId} items=${bulkItems.length}`);

      let insertedPractice = 0;
      let skipped = 0;
      const errors: Array<{ index: number; title: string; error: string }> = [];

      // Validate and prepare rows
      const validRows: Array<Record<string, unknown>> = [];
      for (let i = 0; i < bulkItems.length; i++) {
        const item = bulkItems[i];
        try {
          const contentText = sanitizeString(item.content_text || "").trim();
          const title = sanitizeString(item.title || `Untitled_${i}`).trim();
          if (!contentText) {
            errors.push({ index: i, title, error: "Empty content_text" });
            continue;
          }

          // Duplicate check by title
          const { count } = await adminDb
            .from("legal_practice_kb")
            .select("id", { count: "exact", head: true })
            .eq("title", title)
            .eq("is_active", true);
          if ((count ?? 0) > 0) {
            skipped++;
            continue;
          }

          // Validate enums
          const practiceCategory = PRACTICE.has(item.practice_category) ? item.practice_category : "criminal";
          const courtType = COURT.has(item.court_type) ? item.court_type : "cassation";
          const outcome = OUTCOME.has(item.outcome) ? item.outcome : "granted";

          const importRef = `${jobId}:${i}`;
          validRows.push({
            title,
            content_text: contentText,
            import_ref: importRef,
            practice_category: practiceCategory,
            court_type: courtType,
            outcome,
            is_active: true,
            is_anonymized: item.is_anonymized ?? false,
            visibility: item.visibility || "ai_only",
            source_name: item.source_name || null,
            court_name: item.court_name || null,
            case_number_anonymized: item.case_number_anonymized || null,
            decision_date: isISODateOrNull(item.decision_date) ? item.decision_date : null,
            legal_reasoning_summary: item.legal_reasoning_summary || null,
            key_violations: Array.isArray(item.key_violations) ? item.key_violations : null,
            description: item.description || null,
          });
        } catch (e) {
          errors.push({ index: i, title: item?.title || `item_${i}`, error: e instanceof Error ? e.message : "Unknown" });
        }
      }

      // Batch insert (50 at a time), then map back via import_ref
      const insertedDocs: Array<{ id: string; title: string; content_text: string }> = [];
      if (validRows.length > 0) {
        const batchSize = 50;
        for (let batchStart = 0; batchStart < validRows.length; batchStart += batchSize) {
          const batch = validRows.slice(batchStart, batchStart + batchSize).map(sanitizeRow);

          // Diagnostic: check for remaining problematic chars
          for (const row of batch) {
            const ct = String(row.content_text ?? "");
            const hasNul = ct.includes("\x00");
            const hasSurrogate = /[\uD800-\uDFFF]/.test(ct);
            if (hasNul || hasSurrogate) {
              console.warn(`[bulk-import] job=${jobId} WARN: post-sanitize content still has nul=${hasNul} surrogate=${hasSurrogate} len=${ct.length}`);
            }
          }

          const safeBatch = safeJsonRoundtrip(batch);

          const { error: insertErr, data: inserted } = await adminDb
            .from("legal_practice_kb")
            .insert(safeBatch)
            .select("id, import_ref");
          if (insertErr) {
            console.error(`[bulk-import] job=${jobId} batch_error: ${insertErr.message} code=${insertErr.code ?? "?"}`);
            // Try inserting one-by-one to identify the problematic row
            for (const row of batch) {
              const safeRow = safeJsonRoundtrip(row);
              const { error: singleErr } = await adminDb
                .from("legal_practice_kb")
                .insert(safeRow)
                .select("id");
              if (singleErr) {
                const titleSnippet = String(row.title ?? "").substring(0, 60);
                console.error(`[bulk-import] job=${jobId} row_error title="${titleSnippet}" err=${singleErr.message}`);
                errors.push({ index: -1, title: String(row.title), error: singleErr.message });
              } else {
                insertedPractice += 1;
                insertedDocs.push({
                  id: "", // will be populated below if needed
                  title: String(row.title ?? ""),
                  content_text: String(row.content_text ?? ""),
                });
              }
            }
          } else {
            const ids = inserted ?? [];
            insertedPractice += ids.length;
            // Deterministic mapping via import_ref -> original batch item
            const refMap = new Map<string, Record<string, unknown>>();
            for (const row of batch) {
              refMap.set(String(row.import_ref), row);
            }
            for (const ins of ids) {
              const orig = refMap.get(ins.import_ref ?? "");
              insertedDocs.push({
                id: ins.id,
                title: String(orig?.title ?? ""),
                content_text: String(orig?.content_text ?? ""),
              });
            }
          }
        }
      }

      // Generate and insert chunks for each inserted practice row (idempotent)
      let insertedChunks = 0;
      const CHUNK_SIZE = 8000;
      const CHUNK_OVERLAP = 200;

      for (const doc of insertedDocs) {
        const text = (doc.content_text ?? "").trim();
        if (!text) continue;

        // Idempotency: skip if chunks already exist for this doc_id
        const { count: existingCount } = await adminDb
          .from("legal_practice_kb_chunks")
          .select("id", { count: "exact", head: true })
          .eq("doc_id", doc.id);
        if (existingCount && existingCount > 0) continue;

        const chunks = splitIntoChunks(text, CHUNK_SIZE, CHUNK_OVERLAP);
        if (chunks.length === 0) continue;

        const chunkRows = chunks.map((c) => ({
          doc_id: doc.id,
          chunk_index: c.idx,
          chunk_text: sanitizeString(c.text),
          chunk_hash: computeChunkHash(c.text),
          title: sanitizeString(doc.title),
          source_anchor: null,
          overlap_prev: 0,
          rechunk_version: 'v1-legacy',
        }));

        const chunkBatchSize = 200;
        for (let i = 0; i < chunkRows.length; i += chunkBatchSize) {
          const batch = chunkRows.slice(i, i + chunkBatchSize);
          const { error: chunkErr } = await adminDb
            .from("legal_practice_kb_chunks")
            .insert(batch);
          if (chunkErr) {
            console.error(`[bulk-import] job=${jobId} chunk_error doc=${doc.id}:`, chunkErr.message);
          } else {
            insertedChunks += batch.length;
          }
        }
      }

      console.log(`[bulk-import] job=${jobId} inserted=${insertedPractice} chunks=${insertedChunks} skipped=${skipped} errors=${errors.length}`);

      return new Response(JSON.stringify({
        ok: true,
        inserted_practice: insertedPractice,
        inserted_chunks: insertedChunks,
        skipped,
        errors: errors.slice(0, 20),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === STANDARD IMPORT MODE ===
    if (!textContent) {
      return new Response(JSON.stringify({ error: "textContent is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing file: ${fileName}, length: ${textContent.length}`);

    // Check for duplicate by title before AI extraction
    const titleGuess = fileName?.replace(/\.(txt|json)$/i, '').replace(/_/g, ' ') || '';
    if (titleGuess) {
      const { count } = await adminDb
        .from("legal_practice_kb")
        .select("id", { count: "exact", head: true })
        .eq("title", titleGuess)
        .eq("is_active", true);
      if ((count ?? 0) > 0) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "duplicate" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const extractedData = await extractWithAI(textContent, lovableApiKey);
    console.log(`Extracted title: ${extractedData.title}`);

    // Check duplicate by extracted title too
    if (extractedData.title) {
      const { count } = await adminDb
        .from("legal_practice_kb")
        .select("id", { count: "exact", head: true })
        .eq("title", extractedData.title)
        .eq("is_active", true);
      if ((count ?? 0) > 0) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "duplicate" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const rowToInsert = safeJsonRoundtrip(sanitizeRow({
        title: extractedData.title || 'Untitled',
        content_text: extractedData.content_text,
        practice_category: extractedData.practice_category || 'criminal',
        court_type: extractedData.court_type || 'cassation',
        outcome: extractedData.outcome || 'granted',
        court_name: extractedData.court_name,
        case_number_anonymized: extractedData.case_number,
        decision_date: extractedData.decision_date,
        applied_articles: extractedData.applied_articles,
        key_violations: extractedData.key_violations.length > 0 ? extractedData.key_violations : null,
        legal_reasoning_summary: extractedData.legal_reasoning_summary,
        is_active: true,
        is_anonymized: false,
        visibility: 'ai_only',
        source_name: fileName || null,
      }));

    const { data: insertedDoc, error: insertError } = await adminDb
      .from("legal_practice_kb")
      .insert(rowToInsert)
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw insertError;
    }

    return new Response(JSON.stringify({
      success: true,
      document: insertedDoc,
      extracted: extractedData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("legal-practice-import error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Import failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
