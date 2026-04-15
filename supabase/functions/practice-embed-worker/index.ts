/**
 * practice-embed-worker — Lease-based embedding worker
 *
 * Claims "embed" jobs from practice_chunk_jobs, generates embeddings via the
 * centralized embeddings service (embeddings-generate), and updates the source table.
 *
 * Critical requirement: always populate `embedding_legacy_768` (dim=768) for any
 * record that participates in vector search. Never silently succeed without it.
 *
 * Auth: x-internal-key only (called by orchestrator/backfill scripts).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, validateInternalRequest } from "../_shared/edge-security.ts";
import {
  buildChunkEmbeddingText,
  buildEmbeddingText,
  type EmbeddingDoc,
} from "../_shared/build-embedding-text.ts";
import { buildEmbeddingFingerprintText, generateEmbedding, vectorToString } from "../_shared/embeddings.ts";
import {
  assertVectorDim,
  hasValidStoredVector,
  mergeJsonObject,
  PRIMARY_EMBEDDING_DIM,
  LEGACY_EMBEDDING_DIM,
} from "../_shared/embedding-legacy.ts";
import { assertLegacyWillExist, computeEmbeddingPlan } from "../_shared/embedding-idempotency.ts";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

// SHA-256 hash for idempotency
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new TextDecoder().decode(hexEncode(new Uint8Array(hash)));
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_CHARS_PER_TEXT = 4_000; // worst-case Armenian ≈ 1 char/token; model limit 8191
const DEFAULT_BATCH = 2; // reduced until token-overflow stabilised

type EmbeddingTarget = {
  kind: "doc" | "chunk";
  primaryColumn: "embedding";
  primaryDim: number;
  legacyColumn: "embedding_legacy_768";
  legacyDim: number;
};

const EMBEDDING_TARGETS: Record<string, EmbeddingTarget> = {
  knowledge_base: {
    kind: "doc",
    primaryColumn: "embedding",
    primaryDim: PRIMARY_EMBEDDING_DIM,
    legacyColumn: "embedding_legacy_768",
    legacyDim: LEGACY_EMBEDDING_DIM,
  },
  legal_practice_kb: {
    kind: "doc",
    primaryColumn: "embedding",
    primaryDim: PRIMARY_EMBEDDING_DIM,
    legacyColumn: "embedding_legacy_768",
    legacyDim: LEGACY_EMBEDDING_DIM,
  },
  legal_chunks: {
    kind: "chunk",
    primaryColumn: "embedding",
    primaryDim: PRIMARY_EMBEDDING_DIM,
    legacyColumn: "embedding_legacy_768",
    legacyDim: LEGACY_EMBEDDING_DIM,
  },
};

async function getEmbedding(text: string, dimensions: number): Promise<number[]> {
  const vector = await generateEmbedding(text, EMBEDDING_MODEL, dimensions);
  assertVectorDim(vector, dimensions, `generated_embedding_dim_${dimensions}`);
  return vector;
}

const PRACTICE_SELECT_FIELDS = [
  "id",
  "title",
  "content_text",
  "description",
  "court_type",
  "court_name",
  "source_name",
  "decision_date",
  "case_number_anonymized",
  "echr_case_id",
  "practice_category",
  "key_violations",
  "applied_articles",
  "legal_reasoning_summary",
  "outcome",
  "facts_hy",
  "judgment_hy",
  "content_hash",
  "embedding",
  "embedding_legacy_768",
].join(", ");

const KB_SELECT_FIELDS = [
  "id",
  "title",
  "content_text",
  "category",
  "article_number",
  "source_name",
  "version_date",
  "content_hash",
  "embedding",
  "embedding_legacy_768",
].join(", ");

const CHUNK_SELECT_FIELDS = [
  "id",
  "doc_id",
  "chunk_text",
  "chunk_type",
  "label",
  "chunk_hash",
  "metadata",
  "embedding",
  "embedding_legacy_768",
].join(", ");

function isFatalEmbeddingConfigError(message: string): boolean {
  return /OPENAI_API_KEY not configured|No auth credentials available/i.test(message);
}

function isTokenLimitError(message: string): boolean {
  return /token|too long|maximum context/i.test(message);
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authErr = validateInternalRequest(req, corsHeaders);
  if (authErr) return authErr;

  // Fail-fast: embeddings-generate requires OPENAI_API_KEY
  if (!Deno.env.get("OPENAI_API_KEY")) {
    console.error("[embed-worker] OPENAI_API_KEY missing");
    return new Response(
      JSON.stringify({
        error: "OPENAI_API_KEY not configured",
        hint: "Add OPENAI_API_KEY to Supabase Edge Function secrets",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const sourceFilter = body.source_table || null;
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
      p_source_table: sourceFilter,
    });

    if (claimErr) {
      const rawMsg = claimErr.message || "Unknown claim error";
      const isTransient = rawMsg.includes("Connection timed out") ||
        rawMsg.includes("<!DOCTYPE") ||
        rawMsg.includes("522") ||
        rawMsg.includes("503");
      const shortMsg = rawMsg.length > 300 ? rawMsg.substring(0, 200) + "... [truncated]" : rawMsg;
      console.error(`[embed-worker] claim error (transient=${isTransient}): ${shortMsg}`);
      if (isTransient) {
        return new Response(JSON.stringify({ picked: 0, error: "transient_db_error", detail: shortMsg }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: shortMsg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobs = (claimedRows || []) as Array<{
      id: string;
      document_id: string;
      source_table: string;
      attempts: number;
      max_attempts: number;
    }>;

    if (jobs.length === 0) {
      return new Response(JSON.stringify({ picked: 0, processed_ok: 0, pending_remaining: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processedOk = 0;
    let processedFailed = 0;
    let skippedIdempotent = 0;
    let invalidDimensions = 0;
    const errors: string[] = [];
    let fatalHit = false;

    for (const job of jobs) {
      if (fatalHit) {
        await supabase.from("practice_chunk_jobs").update({
          status: "failed",
          last_error: "Aborted: fatal embeddings configuration error in batch",
          lease_expires_at: null,
        }).eq("id", job.id);
        processedFailed++;
        continue;
      }

      const attempt = (job.attempts || 0) + 1;

      try {
        const src = job.source_table || "knowledge_base";
        const target = EMBEDDING_TARGETS[src];
        if (!target) {
          throw new Error(
            `Table "${src}" is not an allowed embedding target. Allowed: ${Object.keys(EMBEDDING_TARGETS).join(", ")}`,
          );
        }

        const selectFields = src === "knowledge_base"
          ? KB_SELECT_FIELDS
          : (src === "legal_chunks" ? CHUNK_SELECT_FIELDS : PRACTICE_SELECT_FIELDS);

        const { data: row, error: rowErr } = await supabase
          .from(src)
          .select(selectFields)
          .eq("id", job.document_id)
          .single();

        if (rowErr || !row) throw new Error(rowErr?.message || "Record not found");

        // Build embedding text from FINAL stored retrieval content (content_text / chunk_text)
        let embeddingText: string;
        let stableHash: string;
        let storedHash: string | null = null;
        let chunkMeta: Record<string, unknown> | null = null;

        if (target.kind === "chunk") {
          const docId = (row.doc_id as string | null) || null;
          const parentTitle = await (async () => {
            if (!docId) return undefined;
            const { data: parent } = await supabase
              .from("legal_documents")
              .select("title")
              .eq("id", docId)
              .maybeSingle();
            return (parent?.title as string | undefined) || undefined;
          })();

          embeddingText = buildChunkEmbeddingText({
            chunk_text: String(row.chunk_text || ""),
            chunk_type: (row.chunk_type as string | undefined) || undefined,
            label: (row.label as string | undefined) || undefined,
          }, parentTitle);

          stableHash = await sha256Hex(await buildEmbeddingFingerprintText(embeddingText));
          chunkMeta = (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata))
            ? (row.metadata as Record<string, unknown>)
            : {};
          storedHash = (chunkMeta.embedding_text_hash as string | undefined) || null;
        } else {
          embeddingText = buildEmbeddingText(row as EmbeddingDoc);
          stableHash = await sha256Hex(await buildEmbeddingFingerprintText(embeddingText));
          storedHash = (row.content_hash as string | null) || null;
        }

        const hasPrimary = hasValidStoredVector(row.embedding, target.primaryDim);
        const hasLegacy = hasValidStoredVector(row.embedding_legacy_768, target.legacyDim);

        // Malformed stored vectors count as invalid dimensions and must be repaired.
        if (row.embedding != null && !hasPrimary) invalidDimensions++;
        if (row.embedding_legacy_768 != null && !hasLegacy) invalidDimensions++;

        const plan = computeEmbeddingPlan({
          storedHash,
          computedHash: stableHash,
          hasPrimary,
          hasLegacy,
        });

        if (plan.skip) {
          // Job success without regeneration
          await supabase.from("practice_chunk_jobs").update({
            status: "done",
            attempts: attempt,
            completed_at: new Date().toISOString(),
            last_error: null,
          }).eq("id", job.id);

          if (target.kind === "doc") {
            await supabase.from(src).update({
              embedding_status: "success",
              embedding_last_attempt: new Date().toISOString(),
              embedding_error: null,
            }).eq("id", job.document_id);
          } else {
            const merged = mergeJsonObject(chunkMeta, {
              embedding_status: "success",
              embedding_last_attempt: new Date().toISOString(),
              embedding_error: null,
              embedding_text_hash: stableHash,
            });
            await supabase.from(src).update({ metadata: merged }).eq("id", job.document_id);
          }

          skippedIdempotent++;
          continue;
        }

        // Generate only what is needed (idempotent + partial repair):
        const needPrimary = plan.needPrimary;
        const needLegacy = plan.needLegacy;

        const primaryVec = needPrimary ? await getEmbedding(embeddingText, target.primaryDim) : null;
        const legacyVec = needLegacy ? await getEmbedding(embeddingText, target.legacyDim) : null;

        // Safety: do not mark success unless legacy_768 exists (valid pre-existing or generated).
        assertLegacyWillExist({ hasLegacy, legacyGenerated: !!legacyVec });

        const updatePayload: Record<string, unknown> = {};
        if (primaryVec) updatePayload[target.primaryColumn] = vectorToString(primaryVec);
        if (legacyVec) updatePayload[target.legacyColumn] = vectorToString(legacyVec);

        if (target.kind === "doc") {
          updatePayload.embedding_status = "success";
          updatePayload.embedding_attempts = attempt;
          updatePayload.embedding_last_attempt = new Date().toISOString();
          updatePayload.embedding_error = null;
          updatePayload.content_hash = stableHash;
        } else {
          const merged = mergeJsonObject(chunkMeta, {
            embedding_status: "success",
            embedding_attempts: attempt,
            embedding_last_attempt: new Date().toISOString(),
            embedding_error: null,
            embedding_text_hash: stableHash,
          });
          updatePayload.metadata = merged;
        }

        const { error: updateErr } = await supabase.from(src).update(updatePayload).eq("id", job.document_id);
        if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

        await supabase.from("practice_chunk_jobs").update({
          status: "done",
          attempts: attempt,
          completed_at: new Date().toISOString(),
          last_error: null,
        }).eq("id", job.id);

        processedOk++;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        errors.push(`${job.document_id}: ${errMsg}`);
        processedFailed++;

        // Mark source record as failed/unembedded (fail-closed)
        try {
          const src = job.source_table || "knowledge_base";
          if (src === "legal_chunks") {
            const { data: chunk } = await supabase
              .from("legal_chunks")
              .select("metadata")
              .eq("id", job.document_id)
              .maybeSingle();
            const merged = mergeJsonObject(chunk?.metadata, {
              embedding_status: "failed",
              embedding_attempts: (job.attempts || 0) + 1,
              embedding_last_attempt: new Date().toISOString(),
              embedding_error: errMsg.substring(0, 500),
            });
            await supabase.from("legal_chunks").update({ metadata: merged }).eq("id", job.document_id);
          } else if (src === "knowledge_base" || src === "legal_practice_kb") {
            await supabase.from(src).update({
              embedding_status: "failed",
              embedding_attempts: (job.attempts || 0) + 1,
              embedding_last_attempt: new Date().toISOString(),
              embedding_error: errMsg.substring(0, 500),
            }).eq("id", job.document_id);
          }
        } catch (markErr) {
          console.error("[embed-worker] failed to mark record as failed:", markErr instanceof Error ? markErr.message : String(markErr));
        }

        // Fatal config error → dead-letter this job and abort batch
        if (isFatalEmbeddingConfigError(errMsg)) {
          await supabase.from("practice_chunk_jobs").update({
            status: "dead_letter",
            attempts: attempt,
            last_error: errMsg.substring(0, 500),
            lease_expires_at: null,
          }).eq("id", job.id);
          fatalHit = true;
          continue;
        }

        // Token limit → dead letter this job only
        if (isTokenLimitError(errMsg)) {
          await supabase.from("practice_chunk_jobs").update({
            status: "dead_letter",
            attempts: attempt,
            last_error: errMsg.substring(0, 500),
            lease_expires_at: null,
          }).eq("id", job.id);
          continue;
        }

        // Retry with backoff unless maxed out
        if (attempt >= (job.max_attempts || 5)) {
          await supabase.from("practice_chunk_jobs").update({
            status: "dead_letter",
            attempts: attempt,
            last_error: errMsg.substring(0, 500),
            lease_expires_at: null,
          }).eq("id", job.id);
        } else {
          const backoffMinutes = attempt * 2;
          await supabase.from("practice_chunk_jobs").update({
            status: "pending",
            attempts: attempt,
            started_at: null,
            lease_expires_at: null,
            last_error: errMsg.substring(0, 500),
            next_run_at: new Date(Date.now() + backoffMinutes * 60000).toISOString(),
          }).eq("id", job.id);
        }
      }
    }

    const { count: remaining } = await supabase
      .from("practice_chunk_jobs")
      .select("id", { count: "exact", head: true })
      .eq("job_type", "embed")
      .in("status", ["pending", "failed"])
      .lt("attempts", 5);

    const duration = Date.now() - startTime;
    console.log(
      `[embed-worker] done picked=${jobs.length} ok=${processedOk} skipped=${skippedIdempotent} failed=${processedFailed} invalid_dims=${invalidDimensions} remaining=${remaining} duration=${duration}ms fatal=${fatalHit}`,
    );

    return new Response(JSON.stringify({
      picked: jobs.length,
      processed_ok: processedOk,
      skipped_idempotent: skippedIdempotent,
      processed_failed: processedFailed,
      invalid_dimensions: invalidDimensions,
      pending_remaining: remaining || 0,
      duration_ms: duration,
      fatal: fatalHit || undefined,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[embed-worker] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
