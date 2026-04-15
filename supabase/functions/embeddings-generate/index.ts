/**
 * embeddings-generate — Central server-side embeddings service.
 *
 * Uses OpenAI embeddings with text-embedding-3-small by default.
 *
 * Security:
 *   - Requires x-internal-key header (INTERNAL_INGEST_KEY) OR valid Bearer JWT.
 *   - NEVER logs raw text — counts only.
 *
 * Input:  { texts: string[], model?: string, dimensions?: number }
 * Output: { vectors: number[][], model: string, usage: { total_tokens: number } }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

// ─── Config ────────────────────────────────────────────────────────────────
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";
const MAX_BATCH_SIZE = 100;
const MAX_CHARS_PER_TEXT = 6_000; // worst-case Armenian ≈ 1 char/token; model limit 8191
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1_000;

// ─── CORS via centralized handler ──────────────────────────────────────────
import { handleCors } from "../_shared/edge-security.ts";

// ─── Auth guard ────────────────────────────────────────────────────────────
async function authenticate(req: Request): Promise<boolean> {
  // 1. Internal key (service-to-service)
  const internalKey = req.headers.get("x-internal-key");
  const expectedKey = Deno.env.get("INTERNAL_INGEST_KEY");
  if (internalKey && expectedKey && internalKey === expectedKey) {
    return true;
  }

  // 2. Bearer JWT (authenticated user / service role)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return false;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await client.auth.getUser(token);
  return !error && !!data?.user;
}

// ─── Retry helper ──────────────────────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delayMs = RETRY_DELAY_MS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Non-retryable errors (token limit) → throw immediately
      if (err && typeof err === "object" && "nonRetryable" in err && (err as { nonRetryable: boolean }).nonRetryable) throw err;
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

// ─── OpenAI embedding call ─────────────────────────────────────────────────
async function callOpenAIEmbeddings(
  texts: string[],
  model: string,
  dimensions?: number,
): Promise<{ vectors: number[][]; totalTokens: number }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const body: Record<string, unknown> = {
    model,
    input: texts,
  };
  if (dimensions) body.dimensions = dimensions;

  const response = await withRetry(async () => {
    const res = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      // 400 with token-limit message → do not retry (text too long)
      if (res.status === 400 && /token|too long|maximum context/i.test(errText)) {
        const err = new Error(`OpenAI token limit exceeded (400): ${errText.substring(0, 200)}`);
        (err as Error & { nonRetryable: boolean }).nonRetryable = true;
        throw err;
      }
      throw new Error(`OpenAI embeddings error ${res.status}: ${errText}`);
    }

    return res;
  });

  const json = await response.json();

  if (!json.data || !Array.isArray(json.data)) {
    throw new Error("Unexpected response format from OpenAI embeddings");
  }

  // Sort by index to preserve order
  const sorted = [...json.data].sort((a: { index: number }, b: { index: number }) => a.index - b.index);
  const vectors = sorted.map((d: { embedding: number[] }) => d.embedding);
  const totalTokens: number = json.usage?.total_tokens ?? 0;

  return { vectors, totalTokens };
}

// ─── Main handler ──────────────────────────────────────────────────────────
serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Auth
  const authed = await authenticate(req);
  if (!authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { texts, model, dimensions } = await req.json();

    // ── Validation ─────────────────────────────────────────────────────────
    if (!Array.isArray(texts) || texts.length === 0) {
      return new Response(
        JSON.stringify({ error: "texts must be a non-empty array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (texts.length > MAX_BATCH_SIZE) {
      return new Response(
        JSON.stringify({ error: `Batch too large. Max ${MAX_BATCH_SIZE} texts.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const invalidIdx = texts.findIndex(
      (t) => typeof t !== "string" || t.trim().length === 0,
    );
    if (invalidIdx !== -1) {
      return new Response(
        JSON.stringify({ error: `texts[${invalidIdx}] is empty or not a string` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tooLongIdx = texts.findIndex((t) => t.length > 50_000);
    if (tooLongIdx !== -1) {
      return new Response(
        JSON.stringify({
          error: `texts[${tooLongIdx}] exceeds max 50000 chars`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resolvedModel = model ?? Deno.env.get("EMBEDDING_MODEL") ?? DEFAULT_MODEL;

    // Log counts only — never raw text
    console.log(
      `[embeddings-generate] batch=${texts.length} model=${resolvedModel}${dimensions ? ` dims=${dimensions}` : ""}`,
    );

    const { vectors, totalTokens } = await callOpenAIEmbeddings(
      texts,
      resolvedModel,
      dimensions,
    );

    console.log(
      `[embeddings-generate] done vectors=${vectors.length} tokens=${totalTokens}`,
    );

    return new Response(
      JSON.stringify({
        vectors,
        model: resolvedModel,
        usage: { total_tokens: totalTokens },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[embeddings-generate] error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
