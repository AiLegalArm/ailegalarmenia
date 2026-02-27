/**
 * practice-pipeline-orchestrator
 * 
 * Cron-triggered (every minute) orchestrator that drives the full pipeline:
 *   1. Chunking  → practice-chunk-worker
 *   2. Embedding → practice-embed-worker
 *   3. Enrichment → practice-ai-enrich-worker
 * 
 * Priority: chunk > embed > enrich (only one stage per invocation).
 * Auth: x-internal-key (INTERNAL_INGEST_KEY or CRON_WORKER_KEY).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, validateInternalRequest, buildInternalHeaders } from "../_shared/edge-security.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const authErr = validateInternalRequest(req, corsHeaders);
  if (authErr) return authErr;

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Count pending jobs by type
    const [chunkRes, embedRes, enrichRes] = await Promise.all([
      supabase
        .from("practice_chunk_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", "chunk")
        .in("status", ["pending", "failed"])
        .lt("attempts", 5)
        .lte("next_run_at", new Date().toISOString()),
      supabase
        .from("practice_chunk_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", "embed")
        .in("status", ["pending", "failed"])
        .lt("attempts", 5)
        .lte("next_run_at", new Date().toISOString()),
      supabase
        .from("practice_chunk_jobs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", "enrich")
        .in("status", ["pending", "failed"])
        .lt("attempts", 5)
        .lte("next_run_at", new Date().toISOString()),
    ]);

    // Also count stale processing jobs (lease expired)
    const now = new Date().toISOString();
    const [chunkStale, embedStale, enrichStale] = await Promise.all([
      supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true })
        .eq("job_type", "chunk").eq("status", "processing").lt("lease_expires_at", now),
      supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true })
        .eq("job_type", "embed").eq("status", "processing").lt("lease_expires_at", now),
      supabase.from("practice_chunk_jobs").select("id", { count: "exact", head: true })
        .eq("job_type", "enrich").eq("status", "processing").lt("lease_expires_at", now),
    ]);

    const chunkPending = (chunkRes.count || 0) + (chunkStale.count || 0);
    const embedPending = (embedRes.count || 0) + (embedStale.count || 0);
    const enrichPending = (enrichRes.count || 0) + (enrichStale.count || 0);

    let stageTriggered = "idle";
    let workerResponse: Record<string, unknown> | null = null;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const callWorker = async (functionName: string): Promise<Record<string, unknown>> => {
      const url = `${supabaseUrl}/functions/v1/${functionName}`;
      const headers = buildInternalHeaders();
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ concurrency_docs: 50 }),
      });
      const data = await res.json().catch(() => ({ status: res.status }));
      return data;
    };

    // Priority dispatch
    if (chunkPending > 0) {
      stageTriggered = "chunk";
      workerResponse = await callWorker("practice-chunk-worker");
    } else if (embedPending > 0) {
      stageTriggered = "embed";
      workerResponse = await callWorker("practice-embed-worker");
    } else if (enrichPending > 0) {
      stageTriggered = "enrich";
      workerResponse = await callWorker("practice-ai-enrich-worker");
    }

    const duration = Date.now() - startTime;
    console.log(
      `[pipeline-orchestrator] chunk=${chunkPending} embed=${embedPending} enrich=${enrichPending} stage=${stageTriggered} duration=${duration}ms`,
    );

    return new Response(JSON.stringify({
      chunk_pending: chunkPending,
      embed_pending: embedPending,
      enrich_pending: enrichPending,
      stage_triggered: stageTriggered,
      worker_result: workerResponse,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[pipeline-orchestrator] error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
