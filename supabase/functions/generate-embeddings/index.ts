import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { buildEmbeddingText, buildChunkEmbeddingText, type EmbeddingDoc } from "../_shared/build-embedding-text.ts";

// ─── Config ────────────────────────────────────────────────────────────────
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 3072;
const MAX_ATTEMPTS_BEFORE_DEAD_LETTER = 5;
const MAX_CHARS_PER_TEXT = 12_000;
const MAX_RETRIES = 5;

// ─── CORS ──────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Custom error for fatal OpenAI responses (401/403) ─────────────────────
class FatalOpenAIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "FatalOpenAIError";
  }
}

// ─── Retry helper (only retries 429/5xx) ───────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Never retry fatal auth errors
      if (err instanceof FatalOpenAIError) throw err;
      lastError = err;
      if (attempt < retries) {
        const wait = delayMs * Math.pow(2, attempt);
        console.log(`[generate-embeddings] retry attempt=${attempt + 1}/${retries} wait=${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

// ─── OpenAI embedding call ─────────────────────────────────────────────────
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new FatalOpenAIError(500, "OPENAI_API_KEY not configured");

  const truncated = texts.map((t) => t.substring(0, MAX_CHARS_PER_TEXT));

  const response = await withRetry(async () => {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncated,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      // 401/403 = fatal, do not retry
      if (res.status === 401 || res.status === 403) {
        throw new FatalOpenAIError(res.status, `OpenAI auth error ${res.status}: ${errText.substring(0, 200)}`);
      }
      // 429/5xx = retryable
      throw new Error(`OpenAI embeddings error ${res.status}: ${errText.substring(0, 200)}`);
    }

    return res;
  });

  const json = await response.json();

  if (!json.data || !Array.isArray(json.data)) {
    throw new Error("Unexpected response format from OpenAI embeddings");
  }

  const sorted = [...json.data].sort(
    (a: { index: number }, b: { index: number }) => a.index - b.index,
  );
  return sorted.map((d: { embedding: number[] }) => d.embedding);
}

// ─── Main handler ─────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Fail-fast: no API key ────────────────────────────────────────────────
  if (!Deno.env.get("OPENAI_API_KEY")) {
    console.error("[generate-embeddings] OPENAI_API_KEY missing");
    return new Response(
      JSON.stringify({
        error: "OPENAI_API_KEY not configured",
        hint: "Add OPENAI_API_KEY secret in Lovable Cloud → Secrets",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Auth: internal key OR Bearer JWT
  const internalKey = req.headers.get("x-internal-key");
  const expectedKey = Deno.env.get("INTERNAL_INGEST_KEY");
  const isInternalAuth = internalKey && expectedKey && internalKey === expectedKey;

  if (!isInternalAuth) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !data?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { table, batchLimit = 10 } = await req.json();

    const validTables = [
      "knowledge_base", "legal_practice_kb",
    ];
    if (!table || !validTables.includes(table)) {
      return new Response(
        JSON.stringify({ error: `Invalid table. Use one of: ${validTables.join(", ")}. Chunk tables do not store embeddings.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Guard: chunk tables must never receive embeddings
    if (table.endsWith("_chunks")) {
      return new Response(
        JSON.stringify({ error: `Embedding into chunk tables is forbidden. Target parent table instead.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isChunkTable = false; // chunk tables are no longer supported

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Build query based on table type
    const selectFields = isChunkTable
      ? "id, chunk_text, chunk_type, label, embedding_attempts"
      : table === "legal_practice_kb"
        ? "id, title, content_text, description, court_type, court_name, source_name, decision_date, case_number_anonymized, echr_case_id, practice_category, keywords, key_violations, violation_type, applied_articles, interpreted_norms, decision_map, key_paragraphs, ratio_decidendi, legal_principle, echr_principle_formula, legal_reasoning_summary, outcome, echr_article, facts_hy, judgment_hy, procedural_aspect, application_scope, limitations_of_application, embedding_attempts"
        : "id, title, content_text, category, article_number, source_name, version_date, embedding_attempts";

    const activeFilter = isChunkTable && table === "legal_practice_kb_chunks"
      ? supabase.from(table).select(selectFields)
      : supabase.from(table).select(selectFields).eq("is_active", true);

    // Fetch documents/chunks pending embedding
    const { data: docs, error: fetchError } = await activeFilter
      .or(
        `embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`,
      )
      .order("embedding_attempts", { ascending: true })
      .limit(batchLimit);

    if (fetchError) throw fetchError;

    if (!docs || docs.length === 0) {
      const countBase = isChunkTable && table === "legal_practice_kb_chunks"
        ? supabase.from(table).select("id", { count: "exact", head: true })
        : supabase.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);

      const { count } = await countBase
        .or(
          `embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`,
        );

      const deadBase = isChunkTable && table === "legal_practice_kb_chunks"
        ? supabase.from(table).select("id", { count: "exact", head: true })
        : supabase.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);

      const { count: deadCount } = await deadBase
        .eq("embedding_status", "failed")
        .gte("embedding_attempts", MAX_ATTEMPTS_BEFORE_DEAD_LETTER);

      return new Response(
        JSON.stringify({
          processedDocs: 0,
          totalRemaining: count || 0,
          deadLetterCount: deadCount || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let processed = 0;
    const errors: string[] = [];
    const now = new Date().toISOString();

    // Build embedding texts using the unified builder
    const texts = docs.map((doc) => {
      if (isChunkTable) {
        return buildChunkEmbeddingText(
          { chunk_text: doc.chunk_text || "", chunk_type: doc.chunk_type, label: doc.label },
          doc.title,
        );
      }
      return buildEmbeddingText(doc as EmbeddingDoc);
    });

    let vectors: number[][] | null = null;
    try {
      vectors = await getEmbeddings(texts);
      console.log(
        `[generate-embeddings] batch ok: vectors=${vectors.length} dim=${vectors[0]?.length} table=${table}`,
      );
    } catch (batchErr) {
      // Fatal auth errors → stop entire batch, no individual fallback
      if (batchErr instanceof FatalOpenAIError) {
        console.error(`[generate-embeddings] fatal: status=${batchErr.status} table=${table}`);
        // Mark all docs as failed
        for (const doc of docs) {
          await supabase.from(table).update({
            embedding_status: "failed",
            embedding_attempts: (doc.embedding_attempts || 0) + 1,
            embedding_last_attempt: now,
            embedding_error: batchErr.message.substring(0, 500),
          }).eq("id", doc.id);
        }
        return new Response(
          JSON.stringify({ error: batchErr.message, fatal: true }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.error(`[generate-embeddings] batch failed, falling back to individual: table=${table}`);
    }

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const attempts = (doc.embedding_attempts || 0) + 1;

      try {
        let embedding: number[];

        if (vectors && vectors[i]) {
          embedding = vectors[i];
        } else {
          // Individual fallback using the same unified builder
          const fallbackText = texts[i];
          const fallback = await getEmbeddings([fallbackText]);
          embedding = fallback[0];
        }

        const vectorStr = `[${embedding.join(",")}]`;

        const { error: updateError } = await supabase
          .from(table)
          .update({
            embedding: vectorStr,
            embedding_status: "success",
            embedding_attempts: attempts,
            embedding_last_attempt: now,
            embedding_error: null,
          })
          .eq("id", doc.id);

        if (updateError) {
          errors.push(`${doc.id}: ${updateError.message}`);
          console.error(`[generate-embeddings] update failed: id=${doc.id} table=${table} err=${updateError.message}`);
        } else {
          processed++;
          console.log(`[generate-embeddings] ok: id=${doc.id} table=${table} attempt=${attempts}`);
        }
      } catch (docError) {
        // Fatal = stop processing remaining docs
        if (docError instanceof FatalOpenAIError) {
          console.error(`[generate-embeddings] fatal on individual: status=${docError.status} id=${doc.id} table=${table}`);
          await supabase.from(table).update({
            embedding_status: "failed",
            embedding_attempts: attempts,
            embedding_last_attempt: now,
            embedding_error: docError.message.substring(0, 500),
          }).eq("id", doc.id);
          errors.push(`${doc.id}: FATAL ${docError.message}`);
          break; // stop loop
        }

        const errMsg = docError instanceof Error ? docError.message : "Unknown error";
        errors.push(`${doc.id}: ${errMsg}`);
        console.error(`[generate-embeddings] failed: id=${doc.id} table=${table} attempt=${attempts}`);

        await supabase
          .from(table)
          .update({
            embedding_status: "failed",
            embedding_attempts: attempts,
            embedding_last_attempt: now,
            embedding_error: errMsg.substring(0, 500),
          })
          .eq("id", doc.id);
      }
    }

    // ── Counts ──────────────────────────────────────────────────────────────
    const remainBase = isChunkTable && table === "legal_practice_kb_chunks"
      ? supabase.from(table).select("id", { count: "exact", head: true })
      : supabase.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);

    const { count: remaining } = await remainBase
      .or(
        `embedding_status.eq.pending,and(embedding_status.eq.failed,embedding_attempts.lt.${MAX_ATTEMPTS_BEFORE_DEAD_LETTER})`,
      );

    const deadBase2 = isChunkTable && table === "legal_practice_kb_chunks"
      ? supabase.from(table).select("id", { count: "exact", head: true })
      : supabase.from(table).select("id", { count: "exact", head: true }).eq("is_active", true);

    const { count: deadLetterCount } = await deadBase2
      .eq("embedding_status", "failed")
      .gte("embedding_attempts", MAX_ATTEMPTS_BEFORE_DEAD_LETTER);

    console.log(
      `[generate-embeddings] done: processed=${processed} remaining=${remaining} deadLetter=${deadLetterCount} table=${table}`,
    );

    return new Response(
      JSON.stringify({
        processedDocs: processed,
        totalRemaining: remaining || 0,
        deadLetterCount: deadLetterCount || 0,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-embeddings] error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
