/**
 * _shared/gateway-bypass.ts — Centralized helper for edge functions
 * that MUST call the AI gateway directly (e.g. tool_calling, streaming, multimodal).
 *
 * All bypass calls MUST resolve model/temperature/max_tokens from MODEL_MAP
 * to prevent model drift. Every call is logged with bypass_reason.
 */

import { getModelConfig, type ModelConfig } from "./openai-router.ts";
import { getAIProvider, resolveEndpoint } from "./ai-provider.ts";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface BypassOptions {
  /** Function name for MODEL_MAP lookup */
  functionName: string;
  /** Reason for bypassing the router (e.g. "tool_calling", "streaming", "multimodal") */
  bypassReason: string;
  /** Additional body fields (tools, tool_choice, stream, etc.) */
  extraBody?: Record<string, unknown>;
  /** Override timeout in ms (default 60000) */
  timeoutMs?: number;
  /** Max retries on 5xx/429 (default 0) */
  maxRetries?: number;
}

export interface BypassResult {
  data: Record<string, unknown>;
  model_used: string;
  latency_ms: number;
  request_id: string;
}

function getApiKey(): string {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("[gateway-bypass] LOVABLE_API_KEY is not configured");
  return key;
}

/**
 * Build a gateway request body using MODEL_MAP config + extra fields.
 * Respects provider-aware parameter rules (max_completion_tokens for OpenAI chat).
 */
function buildBypassBody(
  cfg: ModelConfig,
  messages: Array<{ role: string; content: unknown }>,
  extraBody?: Record<string, unknown>
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    max_tokens: cfg.max_tokens,
  };

  // Merge extra fields (tools, tool_choice, stream, etc.)
  if (extraBody) {
    Object.assign(base, extraBody);
  }

  return base;
}

/**
 * Execute a gateway bypass call with mandatory logging and optional retries.
 */
export async function callGatewayBypass(
  messages: Array<{ role: string; content: unknown }>,
  options: BypassOptions
): Promise<BypassResult> {
  const cfg = getModelConfig(options.functionName);
  const requestId = crypto.randomUUID();
  const provider = await getAIProvider();
  const endpoint = resolveEndpoint(provider, cfg.model, options.functionName);

  const body = buildBypassBody(cfg, messages, options.extraBody);
  // Update model in body to resolved model name
  body.model = endpoint.modelForApi;
  const timeoutMs = options.timeoutMs ?? 60000;
  const maxRetries = options.maxRetries ?? 0;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${endpoint.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const latency_ms = Date.now() - t0;

      // Mandatory bypass log
      console.log(JSON.stringify({
        fn: options.functionName,
        model: cfg.model,
        temperature: cfg.temperature,
        max_tokens: cfg.max_tokens,
        request_id: requestId,
        latency_ms,
        status: response.status,
        attempt,
        bypass_reason: options.bypassReason,
      }));

      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          await new Promise(r => setTimeout(r, backoff));
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        const errText = await response.text().catch(() => "");
        throw Object.assign(
          new Error(`AI Gateway error ${response.status}: ${errText.substring(0, 200)}`),
          { status: response.status }
        );
      }

      const data = await response.json();

      return {
        data,
        model_used: cfg.model,
        latency_ms,
        request_id: requestId,
      };
    } catch (err) {
      clearTimeout(timer);
      if (attempt < maxRetries && !(err instanceof Error && (err as Error & { status?: number }).status === 402)) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("[gateway-bypass] Max retries exceeded");
}

/**
 * Execute a streaming gateway bypass call. Returns the raw Response
 * so the caller can pipe response.body to the client.
 *
 * Model/temp/tokens are still resolved from MODEL_MAP.
 */
export async function callStreamBypass(
  messages: Array<{ role: string; content: unknown }>,
  options: BypassOptions
): Promise<{ response: Response; model_used: string; request_id: string }> {
  const cfg = getModelConfig(options.functionName);
  const requestId = crypto.randomUUID();
  const provider = await getAIProvider();
  const endpoint = resolveEndpoint(provider, cfg.model, options.functionName);

  const body = buildBypassBody(cfg, messages, {
    ...options.extraBody,
    stream: true,
  });
  body.model = endpoint.modelForApi;
  const timeoutMs = options.timeoutMs ?? 60000;

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timer);

  const latency_ms = Date.now() - t0;

  // Mandatory bypass log
  console.log(JSON.stringify({
    fn: options.functionName,
    model: cfg.model,
    temperature: cfg.temperature,
    max_tokens: cfg.max_tokens,
    request_id: requestId,
    latency_ms,
    status: response.status,
    bypass_reason: options.bypassReason,
  }));

  return { response, model_used: cfg.model, request_id: requestId };
}
