/**
 * edge-security.ts — Fail-closed perimeter guards with dual-mode support.
 *
 * TWO CALL MODES:
 *   1) BROWSER  — Origin required, checked against allowlist + suffix matching.
 *   2) INTERNAL — No Origin needed; validated via `x-internal-key` header
 *      against INTERNAL_INGEST_KEY secret. Server-to-server calls use this.
 *
 * Internal Call Header Contract:
 *   REQUIRED:
 *     x-internal-key : <value of INTERNAL_INGEST_KEY secret>
 *     x-request-id   : <unique request identifier for tracing>
 *     content-type   : application/json
 *   OPTIONAL (audit only — NOT used for auth):
 *     x-user-id      : <original user id if available>
 *     authorization  : Bearer <service_role JWT> (if Supabase client needed)
 *
 * Env vars:
 *   ALLOWED_ORIGINS          – comma-separated exact origin allowlist
 *   ALLOWED_ORIGIN_SUFFIXES  – comma-separated domain suffixes (e.g. "lovable.app,lovableproject.com")
 *   ALLOW_WILDCARD_CORS      – "true" enables "*" ONLY when ENV != "production"
 *   ENV                      – environment identifier ("production", "preview", "dev")
 *   INTERNAL_INGEST_KEY      – shared secret for x-internal-key header (REQUIRED in prod)
 *   MAX_INPUT_CHARS           – max text length (default 2 000 000)
 */

// ─── CONSTANTS ─────────────────────────────────────────────────────

const DEFAULT_ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-internal-key, " +
  "x-supabase-client-platform, x-supabase-client-platform-version, " +
  "x-supabase-client-runtime, x-supabase-client-runtime-version";

const INTERNAL_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── INTERNAL CALL DETECTION ───────────────────────────────────────

/**
 * Check if request carries a valid internal key.
 * Returns true if x-internal-key matches INTERNAL_INGEST_KEY.
 */
export function isValidInternalCall(req: Request): boolean {
  const provided = req.headers.get("x-internal-key");
  if (!provided) return false;

  // Check primary internal key
  const secret = Deno.env.get("INTERNAL_INGEST_KEY");
  if (secret && provided === secret) return true;

  // Check cron worker key (stored in vault, passed by pg_cron)
  const cronKey = Deno.env.get("CRON_WORKER_KEY");
  if (cronKey && provided === cronKey) return true;

  return false;
}

/**
 * Determine request mode: "internal" if valid x-internal-key present,
 * "browser" otherwise. Use this for routing logic.
 */
export function getRequestMode(req: Request): "browser" | "internal" {
  return isValidInternalCall(req) ? "internal" : "browser";
}

// ─── CORS ALLOWLIST (suffix-based + exact match) ──────────────────

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") || "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Built-in suffixes for known Lovable infrastructure domains */
const BUILTIN_SUFFIXES = ["lovable.app", "lovableproject.com", "lovable.dev"];

function getAllowedOriginSuffixes(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGIN_SUFFIXES") || "";
  const custom = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // Merge built-in + custom, deduplicate
  const all = [...new Set([...BUILTIN_SUFFIXES, ...custom])];
  return all;
}

function isWildcardAllowed(): boolean {
  if (Deno.env.get("ALLOW_WILDCARD_CORS") !== "true") return false;
  // In production, wildcard is NEVER allowed even if flag is set
  const env = (Deno.env.get("ENV") || "").toLowerCase();
  if (env === "production") return false;
  return true;
}

/**
 * Parse hostname from an origin string.
 * e.g. "https://foo.lovable.app" → "foo.lovable.app"
 */
export function parseOriginHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if origin is allowed by exact match OR suffix match.
 */
export function isAllowedOrigin(origin: string): boolean {
  // 1) Exact match in ALLOWED_ORIGINS
  const exactList = getAllowedOrigins();
  if (exactList.includes(origin)) return true;

  // 2) Suffix match in ALLOWED_ORIGIN_SUFFIXES
  const suffixes = getAllowedOriginSuffixes();
  if (suffixes.length > 0) {
    const hostname = parseOriginHostname(origin);
    if (hostname) {
      for (const suffix of suffixes) {
        // Must end with ".suffix" or be exactly "suffix"
        if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Build CORS headers for browser requests. Fail-closed:
 * - If wildcard allowed (non-production + flag) → "*".
 * - If origin matches exact list or suffix → reflect origin + Vary: Origin.
 * - Otherwise → null (caller must 403).
 */
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> | null {
  // Wildcard only in non-production environments when explicitly enabled
  if (isWildcardAllowed()) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
  }

  if (!requestOrigin) return null;

  if (isAllowedOrigin(requestOrigin)) {
    return {
      "Access-Control-Allow-Origin": requestOrigin,
      "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    };
  }

  return null;
}

// ─── DUAL-MODE REQUEST HANDLER ─────────────────────────────────────

export interface RequestValidation {
  corsHeaders: Record<string, string>;
  errorResponse?: Response;
  mode: "browser" | "internal";
}

/**
 * Unified request handler with dual-mode support.
 *
 * Logic:
 * 1. If request has a valid x-internal-key → INTERNAL mode.
 *    CORS headers are permissive (wildcard) since there's no browser.
 *    OPTIONS returns 204. POST/other continues.
 *
 * 2. If request has an Origin header → BROWSER mode.
 *    Standard fail-closed CORS check applies.
 *
 * 3. No Origin + no valid internal key → FAIL-CLOSED (403).
 */
export function handleCors(req: Request): RequestValidation | { corsHeaders?: undefined; errorResponse: Response } {
  // ── Mode 1: Internal call with valid key ──
  if (isValidInternalCall(req)) {
    if (req.method === "OPTIONS") {
      return {
        corsHeaders: INTERNAL_CORS_HEADERS,
        errorResponse: new Response(null, { status: 204, headers: INTERNAL_CORS_HEADERS }),
        mode: "internal",
      };
    }
    return { corsHeaders: INTERNAL_CORS_HEADERS, mode: "internal" };
  }

  // ── Mode 2: Browser call — standard CORS ──
  const origin = req.headers.get("origin");

  // No Origin header and no internal key → fail-closed for browser-facing functions.
  // Server-to-server calls without browser should use x-internal-key.
  if (!origin) {
    const fallback = { "Content-Type": "application/json" };
    return {
      errorResponse: new Response(
        JSON.stringify({ error: "cors_not_allowed", reason: "Origin header required for browser requests" }),
        { status: 403, headers: fallback },
      ),
    };
  }

  const headers = getCorsHeaders(origin);

  if (!headers) {
    // Origin present but not in allowlist → fail-closed
    const fallback = { "Content-Type": "application/json" };
    return {
      errorResponse: new Response(
        JSON.stringify({ error: "cors_not_allowed" }),
        { status: 403, headers: fallback },
      ),
    };
  }

  if (req.method === "OPTIONS") {
    return {
      corsHeaders: headers,
      errorResponse: new Response(null, { status: 204, headers }),
      mode: "browser",
    };
  }

  return { corsHeaders: headers, mode: "browser" };
}

// ─── VALIDATION HELPERS ────────────────────────────────────────────

/**
 * Validate a BROWSER request: checks CORS (done by handleCors) + JWT auth.
 * Use after handleCors for browser-facing endpoints.
 * Returns null if OK, or an error Response.
 */
export function validateBrowserRequest(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Authorization required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  return null;
}

/**
 * Validate an INTERNAL request: checks x-internal-key.
 * Use after handleCors for internal/service endpoints.
 * Returns null if OK, or an error Response.
 *
 * Note: if handleCors already detected mode="internal", this is
 * redundant but harmless. Use for endpoints that REQUIRE internal auth.
 */
export function validateInternalRequest(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  if (isValidInternalCall(req)) return null;

  const secret = Deno.env.get("INTERNAL_INGEST_KEY");
  if (!secret) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: INTERNAL_INGEST_KEY not set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ error: "Unauthorized: invalid or missing x-internal-key" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// ─── LEGACY COMPAT (checkInternalAuth) ─────────────────────────────

/**
 * @deprecated Use validateInternalRequest() instead.
 * Kept for backward compatibility during migration.
 */
export function checkInternalAuth(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  return validateInternalRequest(req, corsHeaders);
}

// ─── INPUT SIZE LIMIT ──────────────────────────────────────────────

const DEFAULT_MAX_CHARS = 2_000_000;

export function getMaxInputChars(): number {
  const raw = Deno.env.get("MAX_INPUT_CHARS");
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_CHARS;
}

/**
 * Check if text exceeds MAX_INPUT_CHARS. Returns null if OK, or 413 Response.
 */
export function checkInputSize(
  text: string,
  corsHeaders: Record<string, string>,
): Response | null {
  const limit = getMaxInputChars();
  if (text.length > limit) {
    return new Response(
      JSON.stringify({
        error: "Payload too large",
        max_chars: limit,
        received_chars: text.length,
      }),
      {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  return null;
}

// ─── INTERNAL CALL HELPERS ─────────────────────────────────────────

/** Generate a short unique request ID for tracing */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Build headers for server-to-server calls between Edge Functions.
 * Includes: x-internal-key, x-request-id, content-type.
 * Optionally pass x-user-id for audit (NOT used for auth).
 */
export function buildInternalHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const key = Deno.env.get("INTERNAL_INGEST_KEY");
  if (!key) {
    throw new Error("INTERNAL_INGEST_KEY is not set — cannot make internal calls");
  }
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    "x-internal-key": key,
    "x-request-id": generateRequestId(),
  };
  // Merge extra headers AFTER base so caller can override x-request-id
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      base[k] = v;
    }
  }
  return base;
}

/**
 * Make a server-to-server call to another Edge Function.
 * Automatically adds x-internal-key, x-request-id, content-type.
 *
 * @param url      Full URL (e.g. `${supabaseUrl}/functions/v1/vector-search`)
 * @param body     JSON-serializable body
 * @param options  Optional: extra headers, userId for audit, timeout
 * @returns        fetch Response
 *
 * Usage:
 *   const res = await callInternalFunction(
 *     `${Deno.env.get("SUPABASE_URL")}/functions/v1/vector-search`,
 *     { query: "test", tables: "both" },
 *     { userId: "abc-123" }
 *   );
 */
export async function callInternalFunction(
  url: string,
  body: unknown,
  options?: {
    extraHeaders?: Record<string, string>;
    userId?: string;
    requestId?: string;
    timeoutMs?: number;
  },
): Promise<Response> {
  const extra: Record<string, string> = { ...options?.extraHeaders };
  if (options?.userId) {
    extra["x-user-id"] = options.userId;
  }
  if (options?.requestId) {
    extra["x-request-id"] = options.requestId;
  }
  const headers = buildInternalHeaders(extra);

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
