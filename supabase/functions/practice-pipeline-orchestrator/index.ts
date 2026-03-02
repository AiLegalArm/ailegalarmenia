/**
 * practice-pipeline-orchestrator
 * 
 * Cron-triggered (every minute) orchestrator that drives the full pipeline:
 *   1. Chunking  → practice-chunk-worker
 *   2. Embedding → practice-embed-worker
 *   3. Enrichment → practice-ai-enrich-worker
 * 
 * Priority: chunk > embed > enrich.
 * Auth: x-internal-key (INTERNAL_INGEST_KEY or CRON_WORKER_KEY).
 * 
 * NOTE: Does NOT count pending jobs via PostgREST (schema cache unreliable).
 * Instead, calls workers directly — they use claim_pipeline_jobs RPC internally.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors, validateInternalRequest, buildInternalHeaders } from "../_shared/edge-security.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const authErr = validateInternalRequest(req, corsHeaders);
  if (authErr) return authErr;

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const callWorker = async (functionName: string): Promise<{ data: Record<string, unknown>; status: number }> => {
      const url = `${supabaseUrl}/functions/v1/${functionName}`;
      const headers = buildInternalHeaders();
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ concurrency_docs: 25 }),
      });
      const data = await res.json().catch(() => ({ raw_status: res.status }));
      return { data, status: res.status };
    };

    let stageTriggered = "idle";
    let workerResponse: Record<string, unknown> | null = null;

    // 1) Chunk
    const chunkResult = await callWorker("practice-chunk-worker");
    if (chunkResult.status === 200 && (chunkResult.data?.picked ?? 0) > 0) {
      stageTriggered = "chunk";
      workerResponse = chunkResult.data;
    } else {
      // 2) Embed
      const embedResult = await callWorker("practice-embed-worker");
      if (embedResult.status === 200 && (embedResult.data?.picked ?? 0) > 0) {
        stageTriggered = "embed";
        workerResponse = embedResult.data;
      } else {
        // 3) Enrich
        const enrichResult = await callWorker("practice-ai-enrich-worker");
        if (enrichResult.status === 200 && (enrichResult.data?.picked ?? 0) > 0) {
          stageTriggered = "enrich";
          workerResponse = enrichResult.data;
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[pipeline-orchestrator] stage=${stageTriggered} duration=${duration}ms result=${JSON.stringify(workerResponse ?? {}).slice(0, 200)}`,
    );

    return new Response(JSON.stringify({
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
