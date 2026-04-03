/**
 * practice-pipeline-orchestrator
 * 
 * Cron-triggered (every minute) orchestrator that drives the full pipeline:
 *   1. Chunking  -> practice-chunk-worker
 *   2. Enrichment -> practice-ai-enrich-worker
 *   3. Embedding -> practice-embed-worker
 * 
 * Priority: chunk > enrich > embed.
 * Auth: x-internal-key (INTERNAL_INGEST_KEY or CRON_WORKER_KEY).
 * 
 * Concurrency: Uses pg_try_advisory_lock to prevent overlapping runs.
 * Tracing: Generates a pipeline_run_id propagated to all workers via x-request-id.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors, validateInternalRequest, buildInternalHeaders } from "../_shared/edge-security.ts";

const WORKER_TIMEOUT_MS = 25_000;
const RETRY_DELAY_MS = 3_000;
const MAX_RETRIES = 1;

interface WorkerResult {
  data: Record<string, unknown>;
  status: number;
  error?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isHtmlResponse(text: string): boolean {
  return text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html");
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const authErr = validateInternalRequest(req, corsHeaders);
  if (authErr) return authErr;

  const startTime = Date.now();
  const pipelineRunId = `run_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Concurrency guard: advisory lock ─────────────────────────────
    const { data: lockAcquired, error: lockErr } = await supabase.rpc("try_acquire_pipeline_lock");
    
    if (lockErr) {
      console.warn(`[pipeline-orchestrator] lock RPC error: ${lockErr.message}`);
      // Proceed without lock on RPC failure (graceful degradation)
    } else if (lockAcquired === false) {
      console.log(`[pipeline-orchestrator] run=${pipelineRunId} skipped: another orchestrator is running`);
      return new Response(JSON.stringify({
        stage_triggered: "skipped_concurrent",
        pipeline_run_id: pipelineRunId,
        duration_ms: Date.now() - startTime,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callWorker = async (
      functionName: string,
      payload: Record<string, unknown> = {},
      attempt = 0,
    ): Promise<WorkerResult> => {
      const url = `${supabaseUrl}/functions/v1/${functionName}`;
      const headers = buildInternalHeaders({ "x-request-id": pipelineRunId });
      try {
        const res = await fetchWithTimeout(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ concurrency_docs: 25, pipeline_run_id: pipelineRunId, ...payload }),
        }, WORKER_TIMEOUT_MS);

        const rawText = await res.text();
        
        if (isHtmlResponse(rawText)) {
          const errMsg = `${functionName} returned HTML (likely 522/503), status=${res.status}`;
          console.warn(`[pipeline-orchestrator] run=${pipelineRunId} ${errMsg}`);
          
          if (attempt < MAX_RETRIES) {
            console.log(`[pipeline-orchestrator] run=${pipelineRunId} retrying ${functionName} in ${RETRY_DELAY_MS}ms...`);
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            return callWorker(functionName, payload, attempt + 1);
          }
          return { data: { picked: 0 }, status: res.status, error: errMsg };
        }

        try {
          const data = JSON.parse(rawText);
          return { data, status: res.status };
        } catch {
          console.warn(`[pipeline-orchestrator] run=${pipelineRunId} ${functionName} non-JSON: ${rawText.slice(0, 200)}`);
          return { data: { picked: 0 }, status: res.status, error: "non-JSON response" };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = msg.includes("aborted") || msg.includes("abort");
        console.warn(`[pipeline-orchestrator] run=${pipelineRunId} ${functionName} fetch error: ${msg}`);
        
        if (!isTimeout && attempt < MAX_RETRIES) {
          console.log(`[pipeline-orchestrator] run=${pipelineRunId} retrying ${functionName} in ${RETRY_DELAY_MS}ms...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            return callWorker(functionName, payload, attempt + 1);
        }
        return { data: { picked: 0 }, status: 0, error: msg };
      }
    };

    const results: Record<string, WorkerResult> = {};
    let stageTriggered = "idle";

    // 1) Chunk always runs first because it unblocks downstream work.
    const chunkResult = await callWorker("practice-chunk-worker");
    results.chunk = chunkResult;
    if (chunkResult.status === 200 && ((chunkResult.data?.picked as number) ?? 0) > 0) {
      stageTriggered = "chunk";
    } else {
      // 2) Run legal practice enrichment and knowledge base embeddings side-by-side.
      // This prevents the large enrich backlog from starving KB vectorization.
      const [enrichResult, embedKbResult] = await Promise.all([
        callWorker("practice-ai-enrich-worker"),
        callWorker("practice-embed-worker", { source_table: "knowledge_base" }),
      ]);
      results.enrich = enrichResult;
      results.embed_kb = embedKbResult;

      const enrichPicked = (enrichResult.data?.picked as number) ?? 0;
      const embedKbPicked = (embedKbResult.data?.picked as number) ?? 0;

      if (enrichResult.status === 200 && enrichPicked > 0 && embedKbResult.status === 200 && embedKbPicked > 0) {
        stageTriggered = "enrich+embed_kb";
      } else if (enrichResult.status === 200 && enrichPicked > 0) {
        stageTriggered = "enrich";
      } else if (embedKbResult.status === 200 && embedKbPicked > 0) {
        stageTriggered = "embed_kb";
      }

      // 3) Only embed legal_practice_kb after enrichment backlog is drained.
      if (!(enrichResult.status === 200 && enrichPicked > 0)) {
        const embedPracticeResult = await callWorker("practice-embed-worker", { source_table: "legal_practice_kb" });
        results.embed_practice = embedPracticeResult;
        if (embedPracticeResult.status === 200 && ((embedPracticeResult.data?.picked as number) ?? 0) > 0) {
          stageTriggered = stageTriggered === "embed_kb" ? "embed_kb+embed_practice" : "embed_practice";
        }
      }
    }

    // ── Release advisory lock ────────────────────────────────────────
    if (lockAcquired === true) {
      const { error: releaseErr } = await supabase.rpc("release_pipeline_lock");
      if (releaseErr) {
        console.warn(`[pipeline-orchestrator] run=${pipelineRunId} lock release failed: ${releaseErr.message}`);
      }
    }

    const duration = Date.now() - startTime;
    const errors = Object.entries(results)
      .filter(([, r]) => r.error)
      .map(([name, r]) => `${name}: ${r.error}`);

    console.log(
      `[pipeline-orchestrator] run=${pipelineRunId} stage=${stageTriggered} duration=${duration}ms` +
      (errors.length > 0 ? ` errors=[${errors.join("; ")}]` : "") +
      ` results=${JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { picked: v.data?.picked, status: v.status }]))).slice(0, 300)}`,
    );

    return new Response(JSON.stringify({
      stage_triggered: stageTriggered,
      pipeline_run_id: pipelineRunId,
      results: Object.fromEntries(
        Object.entries(results).map(([k, v]) => [k, { picked: v.data?.picked ?? 0, status: v.status, error: v.error }])
      ),
      duration_ms: duration,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[pipeline-orchestrator] run=${pipelineRunId} fatal: ${msg}`);
    return new Response(JSON.stringify({ error: msg, pipeline_run_id: pipelineRunId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
