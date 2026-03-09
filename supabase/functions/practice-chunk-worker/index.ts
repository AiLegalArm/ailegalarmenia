/**
 * practice-chunk-worker — v6 (cron-driven, lease-based)
 *
 * Changes from v5:
 * 1. Designed to be triggered by pg_cron every 2 minutes.
 * 2. Uses claim_chunk_jobs() RPC (FOR UPDATE SKIP LOCKED) for atomic lease.
 * 3. Failed jobs with attempts < max get re-queued as 'pending'.
 * 4. Returns structured stats: picked/ok/failed/remaining.
 * 5. Accepts INTERNAL_INGEST_KEY or CRON_WORKER_KEY.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, validateInternalRequest } from "../_shared/edge-security.ts";
import {
  chunkDocument,
  validateChunks,
  CHUNKER_VERSION,
  type LegalDocumentInput,
} from "../_shared/chunker.ts";

const MAX_INPUT_CHARS = 200_000;
const PARALLEL_BATCH = 5;
const DEFAULT_BATCH_SIZE = 25;

// ─── Row-based doc type resolver ───────────────────────────────────
function resolveDocTypeFromRow(doc: Record<string, unknown>, sourceTable: string): string {
  if (sourceTable === "legal_practice_kb") {
    const courtType = doc.court_type as string | undefined;
    if (courtType === "echr") return "echr_judgment";
    if (courtType === "cassation") return "cassation_ruling";
    if (courtType === "appeal") return "appeal_ruling";
    if (courtType === "first_instance") return "first_instance_ruling";
    if (courtType === "constitutional") return "constitutional_court";
    return "court_decision";
  }
  if (sourceTable === "knowledge_base") {
    const category = doc.category as string | undefined;
    if (category?.includes("code")) return "code";
    if (category === "constitution") return "law";
    if (category === "echr" || category === "echr_judgments") return "echr_judgment";
    if (category?.includes("cassation")) return "cassation_ruling";
    return "law";
  }
  return "other";
}

// ─── Process a single job ──────────────────────────────────────────
interface JobRecord {
  id: string;
  document_id: string;
  source_table: string;
  attempts: number;
  max_attempts?: number;
}

async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: JobRecord,
) {
  const attempt = (job.attempts || 0) + 1;
  const src = job.source_table || "legal_practice_kb";

  const selectFields = src === "knowledge_base"
    ? "id, title, content_text, category"
    : "id, title, content_text, key_paragraphs, court_type, practice_category, case_number_anonymized, decision_date";

  // 1. Fetch source document
  const { data: doc, error: docErr } = await supabase
    .from(src)
    .select(selectFields)
    .eq("id", job.document_id)
    .single();

  if (docErr || !doc) {
    throw new Error(docErr?.message || "Document not found");
  }

  let contentText = (doc.content_text as string) || "";
  if (contentText.length > MAX_INPUT_CHARS) {
    contentText = contentText.substring(0, MAX_INPUT_CHARS);
  }

  if (!contentText || contentText.trim().length < 100) {
    await supabase
      .from("practice_chunk_jobs")
      .update({
        status: "done",
        attempts: attempt,
        completed_at: new Date().toISOString(),
        last_error: "No chunkable content (too short)",
      })
      .eq("id", job.id);
    return 0;
  }

  // 2. Chunk the document
  const docType = resolveDocTypeFromRow(doc, src);

  // Phase 0: clean text BEFORE chunking (same as chunker does internally)
  // Worker must validate against cleaned text, not raw DB text
  const { cleanupTextV2 } = await import("../_shared/chunker.ts");
  const { cleaned: cleanedText } = cleanupTextV2(contentText);
  
  if (!cleanedText || cleanedText.trim().length < 100) {
    await supabase
      .from("practice_chunk_jobs")
      .update({
        status: "done",
        attempts: attempt,
        completed_at: new Date().toISOString(),
        last_error: "No chunkable content after cleanup (too short)",
      })
      .eq("id", job.id);
    return 0;
  }

  const input: LegalDocumentInput = {
    doc_type: docType,
    content_text: contentText,
    title: (doc.title as string) || undefined,
    case_number: (doc as Record<string, unknown>).case_number_anonymized as string || undefined,
  };

  const result = await chunkDocument(input);

  if (result.chunks.length === 0) {
    await supabase
      .from("practice_chunk_jobs")
      .update({
        status: "done",
        attempts: attempt,
        completed_at: new Date().toISOString(),
        last_error: "No chunkable content (chunker returned 0 chunks)",
      })
      .eq("id", job.id);
    return 0;
  }

  // 3. QA GATE — validate against CLEANED text (same text chunker used)
  const qa = validateChunks(cleanedText, result.chunks);
  if (!qa.ok) {
    const errDetail = qa.errors.slice(0, 5).join("; ");
    console.warn(`[practice-chunk-worker] QA FAILED doc=${job.document_id} errors=${errDetail}`);
    throw new Error(`QA validation failed: ${errDetail}`);
  }

  // 4. Atomic: DELETE ALL old chunks, then INSERT fresh
  const isKB = src === "knowledge_base";
  const chunksTable = isKB ? "knowledge_base_chunks" : "legal_practice_kb_chunks";
  const fkColumn = isKB ? "kb_id" : "doc_id";

  const { error: deleteErr } = await supabase
    .from(chunksTable)
    .delete()
    .eq(fkColumn, job.document_id);

  if (deleteErr) {
    throw new Error(`Failed to delete old chunks: ${deleteErr.message}`);
  }

  // INSERT new chunks in batches
  if (isKB) {
    const rows = result.chunks.map((c) => ({
      kb_id: job.document_id,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      chunk_hash: c.chunk_hash,
      chunk_type: c.chunk_type,
      char_start: c.char_start,
      char_end: c.char_end,
      label: c.label,
      is_active: true,
      source_anchor: c.source_anchor || null,
      overlap_prev: c.overlap_prev || 0,
      rechunk_version: c.chunker_version || CHUNKER_VERSION,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: insertErr } = await supabase.from("knowledge_base_chunks").insert(batch);
      if (insertErr) throw new Error(`Failed to insert KB chunks: ${insertErr.message}`);
    }
  } else {
    const rows = result.chunks.map((c) => ({
      doc_id: job.document_id,
      chunk_index: c.chunk_index,
      chunk_text: c.chunk_text,
      chunk_hash: c.chunk_hash,
      title: c.label,
      source_anchor: c.source_anchor || null,
      overlap_prev: c.overlap_prev || 0,
      rechunk_version: c.chunker_version || CHUNKER_VERSION,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: insertErr } = await supabase.from("legal_practice_kb_chunks").insert(batch);
      if (insertErr) throw new Error(`Failed to insert practice chunks: ${insertErr.message}`);
    }
  }

  // 5. Mark job done
  await supabase
    .from("practice_chunk_jobs")
    .update({
      status: "done",
      attempts: attempt,
      completed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", job.id);

  return result.chunks.length;
}

// ─── Main handler ──────────────────────────────────────────────────
serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const authErr = validateInternalRequest(req, corsHeaders);
  if (authErr) return authErr;

  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const sourceFilter = body.source_table || null;
    const batchSize = Math.min(Number(body.concurrency_docs) || DEFAULT_BATCH_SIZE, 50);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Atomic claim via Postgres RPC (FOR UPDATE SKIP LOCKED) ────
    const { data: claimedRows, error: claimErr } = await supabase.rpc("claim_pipeline_jobs", {
      p_job_type: "chunk",
      p_source_table: sourceFilter,
      p_limit: batchSize,
      p_lease_minutes: 10,
    });

    if (claimErr) {
      const rawMsg = claimErr.message || "Unknown claim error";
      // 522/503 errors return HTML — truncate for logging
      const isTransient = rawMsg.includes("Connection timed out") || rawMsg.includes("<!DOCTYPE") || rawMsg.includes("522") || rawMsg.includes("503");
      const shortMsg = rawMsg.length > 300 ? rawMsg.substring(0, 200) + "... [truncated]" : rawMsg;
      console.error(`[practice-chunk-worker] claim error (transient=${isTransient}): ${shortMsg}`);
      
      // On transient errors, return picked:0 so orchestrator continues to next stage
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

    const claimedJobs: JobRecord[] = (claimedRows || []) as JobRecord[];

    if (claimedJobs.length === 0) {
      let countQuery = supabase
        .from("practice_chunk_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "failed"])
        .lt("attempts", 5);
      if (sourceFilter) countQuery = countQuery.eq("source_table", sourceFilter);
      const { count: pendingCount } = await countQuery;

      return new Response(JSON.stringify({
        picked: 0,
        processed_ok: 0,
        processed_failed: 0,
        total_chunks_inserted: 0,
        pending_remaining: pendingCount || 0,
        duration_ms: Date.now() - startTime,
        chunker_version: CHUNKER_VERSION,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let processedOk = 0;
    let processedFailed = 0;
    let totalChunks = 0;
    const errors: string[] = [];

    // ── Process in parallel batches ────────────────────────────────
    for (let i = 0; i < claimedJobs.length; i += PARALLEL_BATCH) {
      const batch = claimedJobs.slice(i, i + PARALLEL_BATCH);
      const results = await Promise.allSettled(
        batch.map((job) => processJob(supabase, job)),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const job = batch[j];

        if (result.status === "fulfilled") {
          totalChunks += result.value;
          processedOk++;
        } else {
          const errMsg = result.reason instanceof Error
            ? result.reason.message
            : "Unknown error";
          errors.push(`${job.document_id}: ${errMsg}`);
          processedFailed++;

          const attempt = (job.attempts || 0) + 1;
          const maxAttempts = job.max_attempts || 5;

          if (attempt >= maxAttempts) {
            // Dead letter
            await supabase
              .from("practice_chunk_jobs")
              .update({
                status: "dead_letter",
                attempts: attempt,
                last_error: errMsg.substring(0, 500),
              })
              .eq("id", job.id);
          } else {
            // Re-queue as pending with backoff (clear started_at so lease is released)
            await supabase
              .from("practice_chunk_jobs")
              .update({
                status: "pending",
                attempts: attempt,
                started_at: null,
                last_error: errMsg.substring(0, 500),
              })
              .eq("id", job.id);
          }
        }
      }
    }

    // ── Count remaining ────────────────────────────────────────────
    let remainQuery = supabase
      .from("practice_chunk_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "failed"])
      .lt("attempts", 5);
    if (sourceFilter) remainQuery = remainQuery.eq("source_table", sourceFilter);
    const { count: remainingCount } = await remainQuery;

    const duration = Date.now() - startTime;
    console.log(
      `[practice-chunk-worker] src=${sourceFilter || "all"} picked=${claimedJobs.length} ok=${processedOk} failed=${processedFailed} chunks=${totalChunks} remaining=${remainingCount} duration=${duration}ms version=${CHUNKER_VERSION}`,
    );

    return new Response(JSON.stringify({
      picked: claimedJobs.length,
      processed_ok: processedOk,
      processed_failed: processedFailed,
      total_chunks_inserted: totalChunks,
      pending_remaining: remainingCount || 0,
      duration_ms: duration,
      chunker_version: CHUNKER_VERSION,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[practice-chunk-worker] fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
