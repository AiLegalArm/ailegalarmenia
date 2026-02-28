/**
 * _shared/openai-router.ts — Centralized AI router for all non-OCR edge functions.
 *
 * MODEL GOVERNANCE (OpenAI-first):
 * - openai/gpt-5 is the DEFAULT for all legal text reasoning and drafting.
 * - google/gemini-2.5-pro is ONLY for strict JSON-output roles.
 * - google/gemini-2.5-flash / flash-lite for cheap utilities.
 * - openai/text-embedding-* ONLY for generate-embeddings.
 * - No silent fallbacks. No hardcoded model strings. model_used always from router.
 *
 * Required env vars:
 *   LOVABLE_API_KEY        — AI Gateway key (auto-provisioned)
 *   OPENAI_TIMEOUT_MS      — optional, default 60000
 *   OPENAI_AUDIO_TIMEOUT_MS — optional, default 120000
 *   OPENAI_MAX_RETRIES     — optional, default 2
 */

// ── Model map ────────────────────────────────────────────────────────────────

export interface ModelConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  json_mode?: boolean;
  description: string;
}

/** Governance metadata returned with every AI call */
export interface GovernanceMeta {
  role: string;
  model_used: string;
  temperature_used: number;
  max_tokens_used: number;
}

/**
 * Strict per-function model assignment — OpenAI-first for quality.
 * Gemini Pro reserved for strict JSON. Flash/Flash-lite for cheap utils.
 */
export const MODEL_MAP: Record<string, ModelConfig> = {
  // ── OpenAI GPT-5 (quality-first) ──────────────────────────────────────────
  "ai-analyze": {
    model: "openai/gpt-5",
    temperature: 0.15,
    max_tokens: 14000,
    description: "Case analysis (GPT-5)",
  },
  "multi-agent-analyze": {
    model: "openai/gpt-5",
    temperature: 0.2,
    max_tokens: 16000,
    description: "Multi-agent analysis (GPT-5)",
  },
  "generate-complaint": {
    model: "openai/gpt-5",
    temperature: 0.1,
    max_tokens: 14000,
    description: "Complaint drafting (GPT-5)",
  },
  "legal-chat": {
    model: "openai/gpt-5",
    temperature: 0.2,
    max_tokens: 16000,
    description: "Legal chat (GPT-5)",
  },
  "analyze-files-for-complaint": {
    model: "openai/gpt-5",
    temperature: 0.2,
    max_tokens: 16000,
    description: "File analysis (GPT-5)",
  },
  "generate-document": {
    model: "openai/gpt-5-mini",
    temperature: 0.2,
    max_tokens: 10000,
    description: "Documents (GPT-5-mini)",
  },

  // ── Strict JSON (Gemini Pro) ──────────────────────────────────────────────
  "extract-case-fields": {
    model: "openai/gpt-5",
    temperature: 0.2,
    max_tokens: 16000,
    json_mode: true,
    description: "Extract fields (GPT-5)",
  },
  "kb-search-assistant": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 200,
    json_mode: true,
    description: "KB keywords JSON (Gemini Pro)",
  },

  // ── Cheap utilities (Gemini Flash) ────────────────────────────────────────
  "audio-transcribe": {
    model: "google/gemini-2.5-pro",
    temperature: 0.1,
    max_tokens: 16000,
    description: "Transcription (Gemini Pro — anti-hallucination)",
  },
  "echr-translate": {
    model: "google/gemini-2.5-flash",
    temperature: 0.1,
    max_tokens: 8000,
    description: "ECHR translate (Gemini Flash)",
  },
  "legal-practice-enrich": {
    model: "google/gemini-2.5-flash",
    temperature: 0.2,
    max_tokens: 16000,
    description: "Enrich practice (Gemini Flash)",
  },
  "vector-search-rerank": {
    model: "google/gemini-2.5-flash-lite",
    temperature: 0.1,
    max_tokens: 1000,
    description: "Rerank (Flash-lite)",
  },

  // ── Bypass-only utilities (still in MODEL_MAP to prevent model drift) ─────
  "ocr-process": {
    model: "google/gemini-2.5-flash",
    temperature: 0.1,
    max_tokens: 8000,
    description: "OCR vision (Gemini Flash, bypass:multimodal)",
  },
  "kb-scrape-batch": {
    model: "google/gemini-2.5-flash",
    temperature: 0.1,
    max_tokens: 16000,
    description: "KB PDF scrape (Gemini Flash, bypass:multimodal)",
  },
  "kb-fetch-pdf-content": {
    model: "google/gemini-2.5-flash",
    temperature: 0.1,
    max_tokens: 16000,
    description: "KB fetch PDF (Gemini Flash, bypass:multimodal)",
  },
  "legal-practice-import": {
    model: "google/gemini-2.5-flash-lite",
    temperature: 0,
    max_tokens: 8000,
    description: "Practice import extract (Flash-lite, bypass:json_extract)",
  },
  "prompt-armor-repair": {
    model: "google/gemini-2.5-flash-lite",
    temperature: 0,
    max_tokens: 8000,
    description: "JSON repair (Flash-lite, bypass:repair)",
  },

  // ── Embeddings (OpenAI only) ──────────────────────────────────────────────
  "generate-embeddings": {
    model: "openai/text-embedding-3-large",
    temperature: 0,
    max_tokens: 0,
    description: "Embeddings (OpenAI)",
  },

  // ── Admin utilities ─────────────────────────────────────────────────────
  "admin-ai-chat": {
    model: "openai/gpt-5",
    temperature: 0.3,
    max_tokens: 16000,
    description: "Admin AI chat (GPT-5, streaming)",
  },

  // ── Aliases (worker functions that share config with their service) ────
  "practice-ai-enrich-worker": {
    model: "google/gemini-2.5-flash",
    temperature: 0.2,
    max_tokens: 16000,
    description: "Enrich practice worker (alias of legal-practice-enrich)",
  },
};

/**
 * Role-specific model overrides for ai-analyze engines.
 * Reasoning roles inherit GPT-5 base. JSON roles forced to Gemini Pro.
 */
const ROLE_OVERRIDES: Record<string, Partial<ModelConfig>> = {
  // ── Reasoning roles (inherit GPT-5 base) ───────────────────────────────────
  "ai-analyze:strategy_builder": { description: "Strategy builder" },
  "ai-analyze:risk_factors": { description: "Risk factors" },
  "ai-analyze:evidence_weakness": { description: "Evidence weakness" },
  "ai-analyze:hallucination_audit": { description: "Hallucination audit" },
  "ai-analyze:legal_position_comparator": { description: "Comparator" },
  // ── Deterministic draft (GPT-5, temp=0) ────────────────────────────────────
  "ai-analyze:draft_deterministic": {
    model: "openai/gpt-5",
    temperature: 0,
    max_tokens: 14000,
    description: "Deterministic draft (GPT-5 temp=0)",
  },
  // ── Strict JSON roles (Gemini Pro) ─────────────────────────────────────────
  "ai-analyze:precedent_citation": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 8000,
    description: "Precedent JSON (Gemini Pro)",
  },
  "ai-analyze:cross_exam": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 8000,
    description: "Cross-exam JSON (Gemini Pro)",
  },
  "ai-analyze:deadline_rules": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 8000,
    description: "Deadlines JSON (Gemini Pro)",
  },
  "ai-analyze:law_update_summary": {
    model: "google/gemini-2.5-pro",
    temperature: 0.2,
    max_tokens: 8000,
    description: "Law update JSON (Gemini Pro)",
  },
};

// ── Governance constants & allowlists ────────────────────────────────────────

const MAX_TEMPERATURE = 0.3;
const MAX_TOKENS_CAP = 16384;

/** OpenAI chat models allowed ONLY for these roleLabels/functionNames */
const OPENAI_CHAT_ALLOWLIST = new Set([
  "generate-complaint",
  "multi-agent-analyze",
  "legal-chat",
  "analyze-files-for-complaint",
  "generate-document",
  "extract-case-fields",
  "ai-analyze",
  "ai-analyze:strategy_builder",
  "ai-analyze:risk_factors",
  "ai-analyze:evidence_weakness",
  "ai-analyze:hallucination_audit",
  "ai-analyze:legal_position_comparator",
  "ai-analyze:draft_deterministic",
  "admin-ai-chat",
]);

/** OpenAI embedding models allowed ONLY for these functionNames */
const OPENAI_EMBEDDING_ALLOWLIST = new Set([
  "generate-embeddings",
]);

/** Roles that MUST use Gemini Pro strict JSON (callJSON only, callText forbidden) */
const STRICT_JSON_ROLES = new Set([
  "ai-analyze:precedent_citation",
  "ai-analyze:cross_exam",
  "ai-analyze:deadline_rules",
  "ai-analyze:law_update_summary",
]);

/** Functions that use callJSON with Gemini Pro (tool_calling or schema extraction) */
const STRICT_JSON_FUNCTIONS = new Set([
  "kb-search-assistant",
]);

/** Combined set of all roleLabels/functionNames allowed to use callJSON */
const CALLJSON_ALLOWED = new Set([
  ...STRICT_JSON_ROLES,
  ...STRICT_JSON_FUNCTIONS,
]);

/**
 * Governance-enforced model config resolution.
 */
export function getModelConfig(functionName: string, role?: string): ModelConfig {
  const roleLabel = role ? `${functionName}:${role}` : functionName;

  if (role) {
    const overrideKey = `${functionName}:${role}`;
    const override = ROLE_OVERRIDES[overrideKey];
    if (!override) {
      throw new Error(
        `[openai-router] Undefined role "${role}" for function "${functionName}". ` +
          `Register it in ROLE_OVERRIDES or check the role name.`
      );
    }
    const base = MODEL_MAP[functionName];
    if (!base) {
      throw new Error(
        `[openai-router] No model config for function "${functionName}".`
      );
    }
    const merged = { ...base, ...override } as ModelConfig;
    return enforceGovernance(merged, roleLabel, functionName);
  }

  const cfg = MODEL_MAP[functionName];
  if (!cfg) {
    // Audit-log the missing key for observability
    console.error(
      `[openai-router] GOVERNANCE VIOLATION: No MODEL_MAP entry for "${functionName}". ` +
      `Available keys: ${Object.keys(MODEL_MAP).join(", ")}`
    );
    throw new Error(
      `[openai-router] No model config for function "${functionName}". ` +
      `Register it in MODEL_MAP before calling getModelConfig().`
    );
  }
  return enforceGovernance(cfg, roleLabel, functionName);
}

export function buildGovernanceMeta(cfg: ModelConfig, roleLabel: string): GovernanceMeta {
  return {
    role: roleLabel,
    model_used: cfg.model,
    temperature_used: cfg.temperature,
    max_tokens_used: cfg.max_tokens,
  };
}

/**
 * Allowlist-based governance enforcement:
 * - openai/text-embedding-*: allowed ONLY by functionName (not roleLabel).
 * - openai/* chat: allowed ONLY if roleLabel is in OPENAI_CHAT_ALLOWLIST.
 * - STRICT_JSON_ROLES must resolve to google/gemini-2.5-pro.
 * - Temperature > 0.3 or max_tokens > 16384: STRICT THROW.
 */
function enforceGovernance(cfg: ModelConfig, roleLabel: string, functionName: string): ModelConfig {
  // ── OpenAI allowlist checks ────────────────────────────────────────────────
  if (cfg.model.startsWith("openai/")) {
    const isEmbedding = cfg.model.startsWith("openai/text-embedding-");
    if (isEmbedding) {
      // FIX #1: validate by functionName, not roleLabel
      if (!OPENAI_EMBEDDING_ALLOWLIST.has(functionName)) {
        throw new Error(
          `[openai-router] GOVERNANCE VIOLATION: OpenAI embedding model "${cfg.model}" ` +
            `is not allowed for function "${functionName}". Allowed only for: ${[...OPENAI_EMBEDDING_ALLOWLIST].join(", ")}.`
        );
      }
      return cfg;
    }
    // OpenAI chat: must be in allowlist
    if (!OPENAI_CHAT_ALLOWLIST.has(roleLabel)) {
      throw new Error(
        `[openai-router] GOVERNANCE VIOLATION: OpenAI chat model "${cfg.model}" ` +
          `is not allowed for "${roleLabel}". Add to OPENAI_CHAT_ALLOWLIST if intended.`
      );
    }
  }

  // ── Strict JSON roles must resolve to Gemini Pro ───────────────────────────
  if (STRICT_JSON_ROLES.has(roleLabel) && cfg.model !== "google/gemini-2.5-pro") {
    throw new Error(
      `[openai-router] GOVERNANCE VIOLATION: Strict JSON role "${roleLabel}" must use ` +
        `"google/gemini-2.5-pro", but resolved to "${cfg.model}".`
    );
  }

  // ── Parameter caps ─────────────────────────────────────────────────────────
  if (cfg.temperature > MAX_TEMPERATURE) {
    throw new Error(
      `[openai-router] GOVERNANCE VIOLATION: temperature ${cfg.temperature} exceeds cap ${MAX_TEMPERATURE} for "${roleLabel}".`
    );
  }
  if (cfg.max_tokens > MAX_TOKENS_CAP) {
    throw new Error(
      `[openai-router] GOVERNANCE VIOLATION: max_tokens ${cfg.max_tokens} exceeds cap ${MAX_TOKENS_CAP} for "${roleLabel}".`
    );
  }

  return cfg;
}

// ── LEGAL safety header (prepended to all legal reasoning functions) ─────────

const LEGAL_REASONING_FNS = new Set([
  "ai-analyze",
  "multi-agent-analyze",
  "legal-chat",
  "generate-complaint",
  "analyze-files-for-complaint",
  "generate-document",
  "extract-case-fields",
]);

const JSON_FNS = new Set(["kb-search-assistant"]);

export const LEGAL_SAFETY_HEADER = `RULES:
- Do not invent laws, articles, case numbers, or quotations.
- Use only provided context for citations; if missing, say so.
- If facts are insufficient, list missing facts explicitly.
- Keep output structured and conservative.`;

export const JSON_SAFETY_HEADER = `Return ONLY valid JSON matching the schema. No extra keys. No commentary. Unknown fields must be null.`;

function prependSafetyHeader(
  functionName: string,
  messages: RouterMessage[]
): RouterMessage[] {
  const header = LEGAL_REASONING_FNS.has(functionName)
    ? LEGAL_SAFETY_HEADER
    : JSON_FNS.has(functionName)
      ? JSON_SAFETY_HEADER
      : null;

  if (!header) return messages;

  return messages.map((m, idx) => {
    if (idx === 0 && m.role === "system") {
      return { ...m, content: header + "\n\n" + m.content };
    }
    return m;
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface RouterMessage {
  role: "system" | "user" | "assistant";
  content: string | unknown[]; // allow multimodal content arrays
}

export interface RouterCallOptions {
  /** Override timeout in ms (falls back to env var or default) */
  timeoutMs?: number;
}

export interface TextResult {
  text: string;
  model_used: string;
  latency_ms: number;
  request_id: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  governance: GovernanceMeta;
}

export interface JSONResult<T = unknown> {
  json: T;
  model_used: string;
  latency_ms: number;
  request_id: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  governance: GovernanceMeta;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

import { getAIProvider, resolveEndpoint } from "./ai-provider.ts";

function getApiKey(): string {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("[openai-router] LOVABLE_API_KEY is not configured");
  return key;
}

function defaultTimeout(isAudio: boolean): number {
  if (isAudio) {
    return parseInt(Deno.env.get("OPENAI_AUDIO_TIMEOUT_MS") ?? "120000", 10);
  }
  return parseInt(Deno.env.get("OPENAI_TIMEOUT_MS") ?? "60000", 10);
}

function maxRetries(): number {
  return parseInt(Deno.env.get("OPENAI_MAX_RETRIES") ?? "2", 10);
}

function newRequestId(): string {
  return crypto.randomUUID();
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Core fetch with retries + exponential backoff + jitter.
 * Logs metadata only — never logs user content.
 */
async function fetchWithRetry(
  functionName: string,
  requestId: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ data: Record<string, unknown>; latency_ms: number }> {
  // Resolve provider for this request
  const provider = await getAIProvider();
  const modelName = body.model as string;
  const endpoint = resolveEndpoint(provider, modelName);
  
  // Update model name in body if routing to OpenAI directly
  const resolvedBody = { ...body, model: endpoint.modelForApi };

  const max = maxRetries();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= max; attempt++) {
    const t0 = Date.now();

    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${endpoint.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resolvedBody),
        signal: controller.signal,
      });

      clearTimeout(timer);
    } catch (fetchErr) {
      const latency_ms = Date.now() - t0;
      const errClass =
        fetchErr instanceof Error && fetchErr.name === "AbortError"
          ? "TIMEOUT"
          : "NETWORK_ERROR";

      console.error(
        JSON.stringify({
          request_id: requestId,
          function_name: functionName,
          model_used: body.model,
          attempt,
          latency_ms,
          error_class: errClass,
        })
      );

      lastError = fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr));

      if (attempt < max) {
        const backoff = Math.pow(2, attempt) * 500 + Math.random() * 300;
        await sleep(backoff);
        continue;
      }
      throw lastError;
    }

    const latency_ms = Date.now() - t0;

    // Log metadata only
    console.log(
      JSON.stringify({
        request_id: requestId,
        function_name: functionName,
        model_used: body.model,
        attempt,
        status: response.status,
        latency_ms,
      })
    );

    if (!response.ok) {
      if (isRetryable(response.status) && attempt < max) {
        const backoff = Math.pow(2, attempt) * 500 + Math.random() * 300;
        await sleep(backoff);
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      // Surface rate-limit and payment errors clearly
      if (response.status === 429) {
        throw Object.assign(new Error("Rate limit exceeded. Please try again later."), {
          status: 429,
        });
      }
      if (response.status === 402) {
        throw Object.assign(
          new Error("AI credits exhausted. Please top up your Lovable Cloud balance."),
          { status: 402 }
        );
      }

      const errText = await response.text().catch(() => "");
      throw new Error(`AI Gateway error ${response.status}: ${errText.substring(0, 200)}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Log token usage
    const usage = data.usage as
      | { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      | undefined;
    if (usage) {
      console.log(
        JSON.stringify({
          request_id: requestId,
          function_name: functionName,
          model_used: body.model,
          token_usage: usage,
        })
      );
    }

    return { data, latency_ms };
  }

  throw lastError ?? new Error("[openai-router] Max retries exceeded");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a clean request body for the AI gateway.
 * Provider-aware parameter rules:
 *   - openai/* chat:  use max_completion_tokens (not max_tokens)
 *   - anthropic/*:    use temperature + max_tokens
 *   - google/*:       use temperature + max_tokens
 */
function buildRequestBody(
  cfg: ModelConfig,
  messages: RouterMessage[]
): Record<string, unknown> {
  if (cfg.model.startsWith("openai/") && !cfg.model.startsWith("openai/text-embedding-")) {
    // OpenAI GPT-5 family only supports default temperature (1).
    // Omit temperature entirely to use the model default.
    return {
      model: cfg.model,
      max_completion_tokens: cfg.max_tokens,
      messages,
    };
  }
  return {
    model: cfg.model,
    temperature: cfg.temperature,
    max_tokens: cfg.max_tokens,
    messages,
  };
}

/**
 * callText — Standard text completion (streaming disabled, waits for full response).
 */
export async function callText(
  functionName: string,
  messages: RouterMessage[],
  options: RouterCallOptions & { role?: string } = {}
): Promise<TextResult> {
  const roleLabel = options.role ? `${functionName}:${options.role}` : functionName;

  // Strict JSON roles MUST use callJSON, not callText
  if (STRICT_JSON_ROLES.has(roleLabel)) {
    throw new Error(
      `[openai-router] GOVERNANCE VIOLATION: "${roleLabel}" is a strict JSON role and MUST use callJSON, not callText.`
    );
  }

  const cfg = getModelConfig(functionName, options.role);
  const governance = buildGovernanceMeta(cfg, roleLabel);
  const requestId = newRequestId();
  const safeMessages = prependSafetyHeader(functionName, messages);
  const timeoutMs = options.timeoutMs ?? defaultTimeout(false);

  const body = buildRequestBody(cfg, safeMessages);

  const { data, latency_ms } = await fetchWithRetry(
    functionName,
    requestId,
    body,
    timeoutMs
  );

  const choices = data.choices as Array<{ message: { content: string } }>;
  const text = choices?.[0]?.message?.content ?? "";
  const usage = data.usage as TextResult["usage"];

  return { text, model_used: cfg.model, latency_ms, request_id: requestId, usage, governance };
}

/**
 * callJSON — JSON extraction with one auto-repair attempt + schema key validation.
 *
 * @param schema - Object with expected keys (values are unused; only keys matter for validation)
 */
export async function callJSON<T = Record<string, unknown>>(
  functionName: string,
  messages: RouterMessage[],
  schema: Record<string, unknown>,
  options: RouterCallOptions & { role?: string } = {}
): Promise<JSONResult<T>> {
  const roleLabel = options.role ? `${functionName}:${options.role}` : functionName;
  const cfg = getModelConfig(functionName, options.role);

  // Governance: callJSON allowed ONLY for strict JSON roles/functions (Gemini Pro)
  if (!CALLJSON_ALLOWED.has(roleLabel) && !CALLJSON_ALLOWED.has(functionName)) {
    throw new Error(
      `[openai-router] GOVERNANCE VIOLATION: callJSON is not allowed for "${roleLabel}". ` +
        `Only strict JSON roles (Gemini Pro) may use callJSON. Use callText for GPT-5 text roles.`
    );
  }
  // Explicit block: OpenAI chat models must NEVER use callJSON
  if (cfg.model.startsWith("openai/") && !cfg.model.startsWith("openai/text-embedding-")) {
    throw new Error(
      `[openai-router] GOVERNANCE VIOLATION: callJSON is forbidden for OpenAI chat model "${cfg.model}". ` +
        `Use Gemini Pro JSON roles only.`
    );
  }
  const governance = buildGovernanceMeta(cfg, roleLabel);
  const requestId = newRequestId();
  const safeMessages = prependSafetyHeader(functionName, messages);
  const timeoutMs = options.timeoutMs ?? defaultTimeout(false);

  const body = buildRequestBody(cfg, safeMessages);

  const { data, latency_ms } = await fetchWithRetry(
    functionName,
    requestId,
    body,
    timeoutMs
  );

  const choices = data.choices as Array<{ message: { content: string } }>;
  let raw = choices?.[0]?.message?.content ?? "";
  const usage = data.usage as JSONResult["usage"];

  // Strip markdown code fences
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) raw = fenceMatch[1].trim();

  // Attempt parse — no second AI call on failure
  const parsed: T | null = tryParse<T>(raw);

  if (parsed === null) {
    console.error(
      JSON.stringify({
        request_id: requestId,
        function_name: functionName,
        error_class: "JSON_PARSE_FAIL",
        raw_length: raw.length,
      })
    );
    throw Object.assign(
      new Error(
        `[openai-router] ${functionName}: AI returned invalid JSON. No retry.`
      ),
      { code: "INVALID_JSON", raw_preview: raw.substring(0, 200) }
    );
  }

  // Schema key validation: fill missing keys with null, drop extra keys
  const validated = validateSchema<T>(parsed, schema);

  return {
    json: validated,
    model_used: cfg.model,
    latency_ms,
    request_id: requestId,
    usage,
    governance,
  };
}

/**
 * callTranscription — Multimodal audio/video transcription via gateway.
 * Sends audio as base64 inline content.
 */
export async function callTranscription(
  functionName: string,
  messages: RouterMessage[],
  options: RouterCallOptions = {}
): Promise<TextResult> {
  const cfg = getModelConfig(functionName);
  const governance = buildGovernanceMeta(cfg, functionName);
  const requestId = newRequestId();
  const timeoutMs = options.timeoutMs ?? defaultTimeout(true);

  // Use shared buildRequestBody — governance already blocks openai/*
  const body = buildRequestBody(cfg, messages);

  const { data, latency_ms } = await fetchWithRetry(
    functionName,
    requestId,
    body,
    timeoutMs
  );

  const choices = data.choices as Array<{ message: { content: string } }>;
  const text = choices?.[0]?.message?.content ?? "";
  const usage = data.usage as TextResult["usage"];

  return { text, model_used: cfg.model, latency_ms, request_id: requestId, usage, governance };
}

/**
 * callEmbeddings — Vector embeddings (delegated to embeddings-generate function).
 * Included here for API completeness; actual call is via embeddings.ts.
 */
export async function callEmbeddings(
  texts: string[]
): Promise<{ vectors: number[][]; model_used: string }> {
  // Re-use the existing embeddings-generate edge function
  const cfg = MODEL_MAP["generate-embeddings"];
  const { generateEmbeddings } = await import("./embeddings.ts");
  const vectors = await generateEmbeddings(texts);
  return { vectors, model_used: cfg.model };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tryParse<T>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    // Try to extract JSON object/array from surrounding text
    const objMatch = str.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch {
        // ignore
      }
    }
    const arrMatch = str.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]) as T;
      } catch {
        // ignore
      }
    }
    return null;
  }
}

function validateSchema<T>(parsed: unknown, schema: Record<string, unknown>): T {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return parsed as T;
  }

  const obj = parsed as Record<string, unknown>;
  const schemaKeys = Object.keys(schema);

  // Fill missing keys with null
  for (const key of schemaKeys) {
    if (!(key in obj)) {
      obj[key] = null;
    }
  }

  // Drop extra keys
  for (const key of Object.keys(obj)) {
    if (!schemaKeys.includes(key)) {
      delete obj[key];
    }
  }

  return obj as T;
}
