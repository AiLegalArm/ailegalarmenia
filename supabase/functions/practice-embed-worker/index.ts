/**
 * practice-embed-worker — Lease-based embedding worker
 * 
 * Claims up to 25 "embed" jobs from practice_chunk_jobs,
 * generates embeddings via OpenAI API directly, updates the source table.
 * 
 * Auth: x-internal-key only (called by orchestrator).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, validateInternalRequest } from "../_shared/edge-security.ts";
import { buildEmbeddingText, type EmbeddingDoc } from "../_shared/build-embedding-text.ts";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

// ─── SHA-256 hash for idempotency ──────────────────────────────────────────
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new TextDecoder().decode(hexEncode(new Uint8Array(hash)));
}

const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 3072;
const MAX_CHARS_PER_TEXT = 12000;
const MAX_RETRIES = 5;
const DEFAULT_BATCH = 25;

// ─── Custom error for fatal OpenAI responses (401/403) ─────────────────────
class FatalOpenAIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "FatalOpenAIError";
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (err) {
      // Never retry fatal auth errors
      if (err instanceof FatalOpenAIError) throw err;
      lastError = err;
      if (attempt < retries) {
        const wait = delayMs * Math.pow(2, attempt);
        console.log(`[embed-worker] retry attempt=${attempt + 1}/${retries} wait=${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastError;
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new FatalOpenAIError(500, "OPENAI_API_KEY not configured");

  const truncated = texts.map(t => t.substring(0, MAX_CHARS_PER_TEXT));

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
  if (!json.data || !Array.isArray(json.data)) throw new Error("Unexpected embeddings response");

  return [...json.data].sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding);
}

/** Select fields needed for buildEmbeddingText */
const DOC_SELECT_FIELDS = [
  "id", "title", "content_text", "description",
  "court_type", "court_name", "source_name",
  "decision_date", "case_number_anonymized", "echr_case_id",
  "practice_category", "keywords", "key_violations", "violation_type",
  "applied_articles", "interpreted_norms", "decision_map", "key_paragraphs",
  "ratio_decidendi", "legal_principle", "echr_principle_formula",
  "legal_reasoning_summary", "outcome", "echr_article",
  "facts_hy", "judgment_hy", "procedural_aspect",
  "application_scope", "limitations_of_application",
  "content_hash", "embedding",
].join(", ");

/** Minimal select for knowledge_base (fewer fields) */
const KB_SELECT_FIELDS = [
  "id", "title", "content_text", "category", "article_number",
  "source_name", "version_date",
  "content_hash", "embedding",
].join(", ");

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authErr = validateInternalRequest(req, corsHeaders);
  if (authErr) return authErr;

  // ── Fail-fast: no API key ────────────────────────────────────────────────
  if (!Deno.env.get("OPENAI_API_KEY")) {
    console.error("[embed-worker] OPENAI_API_KEY missing");
    return new Response(
      JSON.stringify({
        error: "OPENAI_API_KEY not configured",
        hint: "Add OPENAI_API_KEY secret in Lovable Cloud → Secrets",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Number(body.concurrency_docs) || DEFAULT_BATCH, 50);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Claim jobs atomically
    const { data: claimedRows, error: claimErr } = await supabase.rpc("claim_pipeline_jobs", {
      p_job_type: "embed",
      p_limit: batchSize,
      p_lease_minutes: 10,
    });

    if (claimErr) {
      console.error(`[embed-worker] claim error: ${claimErr.message}`);
      return new Response(JSON.stringify({ error: claimErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobs = (claimedRows || []) as Array<{
      id: string; document_id: string; source_table: string; attempts: number; max_attempts: number;
    }>;

    if (jobs.length === 0) {
      return new Response(JSON.stringify({ picked: 0, processed_ok: 0, pending_remaining: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processedOk = 0;
    let processedFailed = 0;
    let skippedIdempotent = 0;
    const errors: string[] = [];
    let fatalHit = false;

    for (const job of jobs) {
      // If we hit a fatal OpenAI error, mark remaining jobs as failed too
      if (fatalHit) {
        await supabase.from("practice_chunk_jobs").update({
          status: "failed", last_error: "Aborted: fatal OpenAI auth error in batch",
          lease_expires_at: null,
        }).eq("id", job.id);
        processedFailed++;
        continue;
      }

      const attempt = (job.attempts || 0) + 1;
      try {
        const src = job.source_table || "knowledge_base";

        // Guard: chunk tables must never receive embeddings
        if (src.endsWith("_chunks")) {
          throw new Error(`Embedding into chunk table "${src}" is forbidden. Target parent table instead.`);
        }

        const isKB = src === "knowledge_base";
        const selectFields = isKB ? KB_SELECT_FIELDS : DOC_SELECT_FIELDS;

        const { data: doc, error: docErr } = await supabase
          .from(src)
          .select(selectFields)
          .eq("id", job.document_id)
          .single();

        if (docErr || !doc) throw new Error(docErr?.message || "Document not found");

        // Use unified embedding text builder
        const embeddingText = buildEmbeddingText(doc as EmbeddingDoc);
        const hash = await sha256Hex(embeddingText);

        // Idempotency: skip if content unchanged and embedding already exists
        const hasEmbedding = doc.embedding !== null && doc.embedding !== undefined;
        if (doc.content_hash === hash && hasEmbedding) {
          // Mark job done without calling OpenAI
          await supabase.from("practice_chunk_jobs").update({
            status: "done", attempts: attempt, completed_at: new Date().toISOString(), last_error: null,
          }).eq("id", job.id);
          // Ensure embedding_status is success
          await supabase.from(src).update({
            embedding_status: "success",
            embedding_last_attempt: new Date().toISOString(),
            embedding_error: null,
          }).eq("id", job.document_id);
          skippedIdempotent++;
          console.log(`[embed-worker] skip (idempotent): doc=${job.document_id} table=${src}`);
          continue;
        }

        const [embedding] = await getEmbeddings([embeddingText]);
        const vectorStr = `[${embedding.join(",")}]`;

        const { error: updateErr } = await supabase
          .from(src)
          .update({
            embedding: vectorStr,
            embedding_status: "success",
            embedding_attempts: attempt,
            embedding_last_attempt: new Date().toISOString(),
            embedding_error: null,
            content_hash: hash,
          })
          .eq("id", job.document_id);

        if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

        // Mark job done
        await supabase.from("practice_chunk_jobs").update({
          status: "done", attempts: attempt, completed_at: new Date().toISOString(), last_error: null,
        }).eq("id", job.id);

        processedOk++;
        console.log(`[embed-worker] ok: doc=${job.document_id} table=${src} attempt=${attempt}`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        errors.push(`${job.document_id}: ${errMsg}`);
        processedFailed++;

        // Fatal OpenAI error → mark job failed, stop processing
        if (e instanceof FatalOpenAIError) {
          console.error(`[embed-worker] fatal: status=${e.status} doc=${job.document_id}`);
          await supabase.from("practice_chunk_jobs").update({
            status: "dead_letter", attempts: attempt, last_error: errMsg.substring(0, 500),
            lease_expires_at: null,
          }).eq("id", job.id);
          fatalHit = true;
          continue;
        }

        console.error(`[embed-worker] failed: doc=${job.document_id} attempt=${attempt}`);

        if (attempt >= (job.max_attempts || 5)) {
          await supabase.from("practice_chunk_jobs").update({
            status: "dead_letter", attempts: attempt, last_error: errMsg.substring(0, 500),
            lease_expires_at: null,
          }).eq("id", job.id);
        } else {
          const backoffMinutes = attempt * 2;
          await supabase.from("practice_chunk_jobs").update({
            status: "pending", attempts: attempt, started_at: null, lease_expires_at: null,
            last_error: errMsg.substring(0, 500),
            next_run_at: new Date(Date.now() + backoffMinutes * 60000).toISOString(),
          }).eq("id", job.id);
        }
      }
    }

    // Count remaining
    const { count: remaining } = await supabase
      .from("practice_chunk_jobs")
      .select("id", { count: "exact", head: true })
      .eq("job_type", "embed")
      .in("status", ["pending", "failed"])
      .lt("attempts", 5);

    const duration = Date.now() - startTime;
    console.log(`[embed-worker] done: picked=${jobs.length} ok=${processedOk} skipped=${skippedIdempotent} failed=${processedFailed} remaining=${remaining} duration=${duration}ms fatal=${fatalHit}`);

    return new Response(JSON.stringify({
      picked: jobs.length, processed_ok: processedOk, skipped_idempotent: skippedIdempotent,
      processed_failed: processedFailed,
      pending_remaining: remaining || 0, duration_ms: duration,
      fatal: fatalHit || undefined,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[embed-worker] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
