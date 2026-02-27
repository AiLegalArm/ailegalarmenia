/**
 * practice-chunk-enqueue
 *
 * Admin-only endpoint to enqueue missing chunks/embeddings jobs.
 * Supports both legal_practice_kb and knowledge_base tables.
 *
 * Actions:
 *   - diagnostics:               return coverage stats (requires source_table param)
 *   - enqueue_missing_chunks:    docs without any chunks
 *   - enqueue_missing_embeddings: docs with embedding_status != 'success'
 *   - reset_dead_letters:        reset dead-lettered jobs to pending
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

import { handleCors } from "../_shared/edge-security.ts";

const VALID_SOURCES = ["legal_practice_kb", "knowledge_base"] as const;
type SourceTable = typeof VALID_SOURCES[number];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
  }

  try {
    const { action, source_table: rawSource } = await req.json();
    const source: SourceTable = VALID_SOURCES.includes(rawSource) ? rawSource : "legal_practice_kb";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── Diagnostics ─────────────────────────────────────────
    if (action === "diagnostics") {
      if (source === "knowledge_base") {
        const [totalDocsRes, totalChunksRes, embPendingRes, embFailedRes, docsNoChunksRes, avgChunksRes] = await Promise.all([
          supabase.from("knowledge_base").select("id", { count: "exact", head: true }).eq("is_active", true),
          supabase.from("knowledge_base_chunks").select("id", { count: "exact", head: true }),
          supabase.from("knowledge_base").select("id", { count: "exact", head: true }).eq("is_active", true).eq("embedding_status", "pending"),
          supabase.from("knowledge_base").select("id", { count: "exact", head: true }).eq("is_active", true).eq("embedding_status", "failed"),
          supabase.rpc("count_kb_docs_without_chunks"),
          supabase.rpc("avg_chunks_per_kb_doc"),
        ]);

        const totalDocs = totalDocsRes.count || 0;
        const docsWithoutChunks = typeof docsNoChunksRes.data === "number" ? docsNoChunksRes.data : null;
        const avgChunks = typeof avgChunksRes.data === "number" ? avgChunksRes.data : null;

        // Job queue stats for KB
        const [
          pendingJobs,
          processingJobs,
          doneJobs,
          failedJobs,
          deadJobs,
          chunkPendingJobs,
          chunkProcessingJobs,
          chunkFailedJobs,
          embedPendingJobs,
          embedProcessingJobs,
          embedFailedJobs,
          enrichPendingJobs,
          enrichProcessingJobs,
          enrichFailedJobs,
        ] = await Promise.all([
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "pending").eq("source_table", "knowledge_base"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "processing").eq("source_table", "knowledge_base"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "done").eq("source_table", "knowledge_base"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").eq("source_table", "knowledge_base"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "dead_letter").eq("source_table", "knowledge_base"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "knowledge_base").eq("job_type", "chunk").eq("status", "pending"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "knowledge_base").eq("job_type", "chunk").eq("status", "processing"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "knowledge_base").eq("job_type", "chunk").eq("status", "failed"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "knowledge_base").eq("job_type", "embed").eq("status", "pending"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "knowledge_base").eq("job_type", "embed").eq("status", "processing"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "knowledge_base").eq("job_type", "embed").eq("status", "failed"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "knowledge_base").eq("job_type", "enrich").eq("status", "pending"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "knowledge_base").eq("job_type", "enrich").eq("status", "processing"),
          supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "knowledge_base").eq("job_type", "enrich").eq("status", "failed"),
        ]);

        return new Response(JSON.stringify({
          total_docs: totalDocs,
          total_chunks: totalChunksRes.count || 0,
          docs_without_chunks: docsWithoutChunks,
          avg_chunks_per_doc: avgChunks,
          embedding_pending: embPendingRes.count || 0,
          embedding_failed: embFailedRes.count || 0,
          jobs: {
            pending: pendingJobs.count || 0,
            processing: processingJobs.count || 0,
            done: doneJobs.count || 0,
            failed: failedJobs.count || 0,
            dead_letter: deadJobs.count || 0,
          },
          pipeline: {
            chunk_pending: (chunkPendingJobs.count || 0) + (chunkProcessingJobs.count || 0) + (chunkFailedJobs.count || 0),
            embed_pending: (embedPendingJobs.count || 0) + (embedProcessingJobs.count || 0) + (embedFailedJobs.count || 0),
            enrich_pending: (enrichPendingJobs.count || 0) + (enrichProcessingJobs.count || 0) + (enrichFailedJobs.count || 0),
          },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Default: legal_practice_kb diagnostics (existing logic)
      const [totalDocsRes, totalChunksRes, docsNoChunksRes, avgChunksRes, embPendingRes, embFailedRes] = await Promise.all([
        supabase.from("legal_practice_kb").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("legal_practice_kb_chunks").select("id", { count: "exact", head: true }),
        supabase.rpc("count_docs_without_chunks"),
        supabase.rpc("avg_chunks_per_practice_doc"),
        supabase.from("legal_practice_kb").select("id", { count: "exact", head: true }).eq("is_active", true).eq("embedding_status", "pending"),
        supabase.from("legal_practice_kb").select("id", { count: "exact", head: true }).eq("is_active", true).eq("embedding_status", "failed"),
      ]);

      const docsWithoutChunks = docsNoChunksRes.data;
      const avgChunks = avgChunksRes.data;

      const [
        pendingJobs,
        processingJobs,
        doneJobs,
        failedJobs,
        deadJobs,
        chunkPendingJobs,
        chunkProcessingJobs,
        chunkFailedJobs,
        embedPendingJobs,
        embedProcessingJobs,
        embedFailedJobs,
        enrichPendingJobs,
        enrichProcessingJobs,
        enrichFailedJobs,
      ] = await Promise.all([
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "pending").eq("source_table", "legal_practice_kb"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "processing").eq("source_table", "legal_practice_kb"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "done").eq("source_table", "legal_practice_kb"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").eq("source_table", "legal_practice_kb"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("status", "dead_letter").eq("source_table", "legal_practice_kb"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "legal_practice_kb").eq("job_type", "chunk").eq("status", "pending"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "legal_practice_kb").eq("job_type", "chunk").eq("status", "processing"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "legal_practice_kb").eq("job_type", "chunk").eq("status", "failed"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "legal_practice_kb").eq("job_type", "embed").eq("status", "pending"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "legal_practice_kb").eq("job_type", "embed").eq("status", "processing"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "legal_practice_kb").eq("job_type", "embed").eq("status", "failed"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "legal_practice_kb").eq("job_type", "enrich").eq("status", "pending"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "legal_practice_kb").eq("job_type", "enrich").eq("status", "processing"),
        supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true }).eq("source_table", "legal_practice_kb").eq("job_type", "enrich").eq("status", "failed"),
      ]);

      return new Response(JSON.stringify({
        total_docs: totalDocsRes.count || 0,
        total_chunks: totalChunksRes.count || 0,
        docs_without_chunks: typeof docsWithoutChunks === "number" ? docsWithoutChunks : null,
        avg_chunks_per_doc: typeof avgChunks === "number" ? avgChunks : null,
        embedding_pending: embPendingRes.count || 0,
        embedding_failed: embFailedRes.count || 0,
        jobs: {
          pending: pendingJobs.count || 0,
          processing: processingJobs.count || 0,
          done: doneJobs.count || 0,
          failed: failedJobs.count || 0,
          dead_letter: deadJobs.count || 0,
        },
        pipeline: {
          chunk_pending: (chunkPendingJobs.count || 0) + (chunkProcessingJobs.count || 0) + (chunkFailedJobs.count || 0),
          embed_pending: (embedPendingJobs.count || 0) + (embedProcessingJobs.count || 0) + (embedFailedJobs.count || 0),
          enrich_pending: (enrichPendingJobs.count || 0) + (enrichProcessingJobs.count || 0) + (enrichFailedJobs.count || 0),
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── Enqueue missing chunks ──────────────────────────────
    if (action === "enqueue_missing_chunks") {
      let docIds: string[] = [];

      if (source === "knowledge_base") {
        const { data: missingDocs, error: queryErr } = await supabase
          .rpc("get_kb_docs_without_chunks", { batch_limit: 2000 });

        if (queryErr || !missingDocs) {
          console.error("[practice-chunk-enqueue] RPC error:", queryErr?.message);
          docIds = [];
        } else {
          docIds = missingDocs.map((d: { id: string }) => d.id);
        }
      } else {
        // legal_practice_kb - existing logic
        const { data: missingDocs, error: queryErr } = await supabase
          .rpc("get_practice_docs_without_chunks", { batch_limit: 2000 });

        if (queryErr || !missingDocs) {
          const { data: allDocs } = await supabase
            .from("legal_practice_kb")
            .select("id")
            .eq("is_active", true);

          const { data: chunkedDocs } = await supabase
            .from("legal_practice_kb_chunks")
            .select("doc_id");

          if (allDocs && chunkedDocs) {
            const chunkedSet = new Set(chunkedDocs.map((c: { doc_id: string }) => c.doc_id));
            docIds = allDocs
              .filter((d: { id: string }) => !chunkedSet.has(d.id))
              .map((d: { id: string }) => d.id);
          }
        } else {
          docIds = missingDocs.map((d: { id: string }) => d.id);
        }
      }

      if (docIds.length === 0) {
        return new Response(JSON.stringify({ enqueued: 0, message: "All docs have chunks" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const batchSize = 500;
      let enqueued = 0;

      for (let i = 0; i < docIds.length; i += batchSize) {
        const batch = docIds.slice(i, i + batchSize).map((id) => ({
          document_id: id,
          source_table: source,
          job_type: "chunk",
          status: "pending",
          attempts: 0,
        }));

        const { error: upsertErr } = await supabase
          .from("practice_chunk_jobs")
          .upsert(batch, { onConflict: "document_id,source_table,job_type", ignoreDuplicates: true });

        if (upsertErr) {
          console.error(`[practice-chunk-enqueue] batch upsert error:`, upsertErr.message);
        } else {
          enqueued += batch.length;
        }
      }

      console.log(`[practice-chunk-enqueue] enqueued ${enqueued} chunk jobs for ${source}`);

      // Also create embed jobs for these docs (they'll need embeddings after chunking)
      const embedBatch = docIds.map((id) => ({
        document_id: id,
        source_table: source,
        job_type: "embed",
        status: "pending",
        attempts: 0,
      }));
      for (let i = 0; i < embedBatch.length; i += 500) {
        await supabase.from("practice_chunk_jobs")
          .upsert(embedBatch.slice(i, i + 500), { onConflict: "document_id,source_table,job_type", ignoreDuplicates: true });
      }

      // Create enrich jobs for legal_practice_kb docs
      if (source === "legal_practice_kb") {
        const enrichBatch = docIds.map((id) => ({
          document_id: id,
          source_table: source,
          job_type: "enrich",
          status: "pending",
          attempts: 0,
        }));
        for (let i = 0; i < enrichBatch.length; i += 500) {
          await supabase.from("practice_chunk_jobs")
            .upsert(enrichBatch.slice(i, i + 500), { onConflict: "document_id,source_table,job_type", ignoreDuplicates: true });
        }
      }

      // Fire-and-forget: trigger orchestrator immediately
      const orchUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/practice-pipeline-orchestrator`;
      try {
        const { buildInternalHeaders } = await import("../_shared/edge-security.ts");
        const intHeaders = buildInternalHeaders();
        fetch(orchUrl, {
          method: "POST",
          headers: intHeaders,
          body: JSON.stringify({}),
        }).catch((e) => console.warn("[practice-chunk-enqueue] orchestrator kick failed:", e.message));
      } catch {
        console.warn("[practice-chunk-enqueue] could not build internal headers for orchestrator kick");
      }

      return new Response(JSON.stringify({ enqueued, total_missing: docIds.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Enqueue missing embeddings ──────────────────────────
    if (action === "enqueue_missing_embeddings") {
      const { data: docs, error: queryErr } = await supabase
        .from(source)
        .select("id")
        .eq("is_active", true)
        .neq("embedding_status", "success")
        .limit(2000);

      if (queryErr) throw queryErr;

      const docIds = (docs || []).map((d: { id: string }) => d.id);

      if (docIds.length === 0) {
        return new Response(JSON.stringify({ enqueued: 0, message: "All docs have embeddings" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const batchSize = 500;
      let reset = 0;

      for (let i = 0; i < docIds.length; i += batchSize) {
        const batch = docIds.slice(i, i + batchSize);
        const { error: updateErr } = await supabase
          .from(source)
          .update({
            embedding_status: "pending",
            embedding_error: null,
          })
          .in("id", batch)
          .lt("embedding_attempts", 5);

        if (!updateErr) reset += batch.length;
      }

      return new Response(JSON.stringify({ reset, total_missing: docIds.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Reset dead letters ──────────────────────────────────
    if (action === "reset_dead_letters") {
      let q = supabase
        .from("practice_chunk_jobs")
        .update({ status: "pending", attempts: 0, last_error: null })
        .eq("status", "dead_letter");

      if (rawSource && VALID_SOURCES.includes(rawSource)) {
        q = q.eq("source_table", rawSource);
      }

      const { error } = await q;
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      error: "Unknown action. Use: diagnostics, enqueue_missing_chunks, enqueue_missing_embeddings, reset_dead_letters",
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[practice-chunk-enqueue] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
