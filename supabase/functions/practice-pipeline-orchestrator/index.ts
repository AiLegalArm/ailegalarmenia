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
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors, validateInternalRequest, buildInternalHeaders } from "../_shared/edge-security.ts";

const WORKER_TIMEOUT_MS = 25_000; // 25s per worker call
const RETRY_DELAY_MS = 3_000;     // 3s before retry
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const callWorker = async (functionName: string, attempt = 0): Promise<WorkerResult> => {
      const url = `${supabaseUrl}/functions/v1/${functionName}`;
      const headers = buildInternalHeaders();
      try {
        const res = await fetchWithTimeout(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ concurrency_docs: 25 }),
        }, WORKER_TIMEOUT_MS);

        const rawText = await res.text();
        
        // Handle HTML error pages (522, 503, etc.)
        if (isHtmlResponse(rawText)) {
          const errMsg = `${functionName} returned HTML (likely 522/503), status=${res.status}`;
          console.warn(`[pipeline-orchestrator] ${errMsg}`);
          
          if (attempt < MAX_RETRIES) {
            console.log(`[pipeline-orchestrator] Retrying ${functionName} in ${RETRY_DELAY_MS}ms...`);
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            return callWorker(functionName, attempt + 1);
          }
          return { data: { picked: 0 }, status: res.status, error: errMsg };
        }

        // Parse JSON
        try {
          const data = JSON.parse(rawText);
          return { data, status: res.status };
        } catch {
          console.warn(`[pipeline-orchestrator] ${functionName} returned non-JSON: ${rawText.slice(0, 200)}`);
          return { data: { picked: 0 }, status: res.status, error: "non-JSON response" };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = msg.includes("aborted") || msg.includes("abort");
        console.warn(`[pipeline-orchestrator] ${functionName} fetch error: ${msg}`);
        
        if (!isTimeout && attempt < MAX_RETRIES) {
          console.log(`[pipeline-orchestrator] Retrying ${functionName} in ${RETRY_DELAY_MS}ms...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          return callWorker(functionName, attempt + 1);
        }
        return { data: { picked: 0 }, status: 0, error: msg };
      }
    };

    const results: Record<string, WorkerResult> = {};
    let stageTriggered = "idle";

    // 1) Chunk
    const chunkResult = await callWorker("practice-chunk-worker");
    results.chunk = chunkResult;
    if (chunkResult.status === 200 && ((chunkResult.data?.picked as number) ?? 0) > 0) {
      stageTriggered = "chunk";
    } else {
      // 2) Embed
      const embedResult = await callWorker("practice-embed-worker");
      results.embed = embedResult;
      if (embedResult.status === 200 && ((embedResult.data?.picked as number) ?? 0) > 0) {
        stageTriggered = "embed";
      } else {
        // 3) Enrich
        const enrichResult = await callWorker("practice-ai-enrich-worker");
        results.enrich = enrichResult;
        if (enrichResult.status === 200 && ((enrichResult.data?.picked as number) ?? 0) > 0) {
          stageTriggered = "enrich";
        }
      }
    }

    const duration = Date.now() - startTime;
    const errors = Object.entries(results)
      .filter(([, r]) => r.error)
      .map(([name, r]) => `${name}: ${r.error}`);

    console.log(
      `[pipeline-orchestrator] stage=${stageTriggered} duration=${duration}ms` +
      (errors.length > 0 ? ` errors=[${errors.join("; ")}]` : "") +
      ` results=${JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { picked: v.data?.picked, status: v.status }]))).slice(0, 300)}`,
    );

    return new Response(JSON.stringify({
      stage_triggered: stageTriggered,
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
    console.error("[pipeline-orchestrator] fatal error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
