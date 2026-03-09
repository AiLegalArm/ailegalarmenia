/**
 * pipeline-tick — Idempotent cron-safe endpoint.
 *
 * Thin wrapper around practice-pipeline-orchestrator.
 * Supports TWO trigger modes:
 *   A) pg_cron  → invoke_pipeline_tick() RPC → net.http_post → this endpoint
 *   B) External cron (cron-job.org / GitHub Actions) → POST with X-Cron-Key header
 *
 * Auth: x-internal-key OR X-Cron-Key (both checked against CRON_WORKER_KEY / INTERNAL_INGEST_KEY).
 * Idempotent: advisory lock prevents overlapping runs (delegated to orchestrator).
 * Logging: every call logs run_id + source for observability.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors, buildInternalHeaders } from "../_shared/edge-security.ts";

const ORCHESTRATOR_TIMEOUT_MS = 55_000; // Edge fn max ~60s, leave margin

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Auth: accept x-internal-key OR X-Cron-Key ─────────────────────
  const internalKey = Deno.env.get("INTERNAL_INGEST_KEY") || "";
  const cronKey = Deno.env.get("CRON_WORKER_KEY") || "";

  const providedInternal = req.headers.get("x-internal-key") || "";
  const providedCron = req.headers.get("x-cron-key") || "";

  let source = "unknown";

  if (internalKey && providedInternal === internalKey) {
    source = "internal"; // pg_cron via invoke_pipeline_tick()
  } else if (cronKey && providedCron === cronKey) {
    source = "external_cron"; // cron-job.org / GitHub Actions
  } else if (cronKey && providedInternal === cronKey) {
    source = "pg_cron"; // pg_cron sends x-internal-key with CRON_WORKER_KEY
  } else {
    console.warn("[pipeline-tick] Unauthorized attempt");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const runId = `tick_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

  // Parse optional body
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // No body is fine
  }

  console.log(`[pipeline-tick] run=${runId} source=${source} body=${JSON.stringify(body).slice(0, 200)}`);

  // ── Delegate to orchestrator ──────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const orchestratorUrl = `${supabaseUrl}/functions/v1/practice-pipeline-orchestrator`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ORCHESTRATOR_TIMEOUT_MS);

    const headers = buildInternalHeaders({ "x-request-id": runId });

    const res = await fetch(orchestratorUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ source, pipeline_run_id: runId, ...body }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const rawText = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText.slice(0, 500) };
    }

    console.log(
      `[pipeline-tick] run=${runId} orchestrator_status=${res.status} stage=${data.stage_triggered ?? "unknown"}`,
    );

    return new Response(
      JSON.stringify({
        ok: res.status === 200,
        run_id: runId,
        source,
        orchestrator_status: res.status,
        ...data,
      }),
      {
        status: res.status === 200 ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("aborted") || msg.includes("abort");
    console.error(`[pipeline-tick] run=${runId} error: ${msg}`);

    return new Response(
      JSON.stringify({
        ok: false,
        run_id: runId,
        source,
        error: isTimeout ? "orchestrator_timeout" : msg,
      }),
      {
        status: isTimeout ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
