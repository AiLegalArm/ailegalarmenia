/**
 * _shared/ai-provider.ts — Resolves the active AI provider setting.
 *
 * Reads `ai_provider` from `app_settings` table.
 * Values: "gateway" (default, Lovable AI Gateway) | "openai" (direct OpenAI API) | "openrouter" (OpenRouter API).
 *
 * Cached per cold-start to avoid repeated DB calls within the same invocation.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AIProvider = "gateway" | "openai" | "openrouter";

let cachedProvider: AIProvider | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Functions that MUST always use direct OpenAI (embeddings, enrich workers).
 * These bypass the provider setting entirely.
 */
const OPENAI_ONLY_FUNCTIONS = new Set([
  "generate-embeddings",
  "practice-embed-worker",
  "practice-ai-enrich-worker",
  "legal-practice-enrich",
  "vector-search-rerank",
]);

/**
 * Check if a function must bypass provider routing and use OpenAI directly.
 */
export function isOpenAIOnlyFunction(functionName: string): boolean {
  return OPENAI_ONLY_FUNCTIONS.has(functionName);
}

/**
 * Get the configured AI provider. Caches for 30s.
 */
export async function getAIProvider(): Promise<AIProvider> {
  const now = Date.now();
  if (cachedProvider && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProvider;
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      console.warn("[ai-provider] Missing SUPABASE_URL or SERVICE_ROLE_KEY, defaulting to gateway");
      return "gateway";
    }

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "ai_provider")
      .single();

    if (error || !data) {
      console.warn("[ai-provider] Could not read ai_provider setting, defaulting to gateway:", error?.message);
      cachedProvider = "gateway";
    } else {
      const val = data.value as string;
      if (val === "openai") {
        cachedProvider = "openai";
      } else if (val === "openrouter") {
        cachedProvider = "openrouter";
      } else {
        cachedProvider = "gateway";
      }
    }
  } catch (e) {
    console.warn("[ai-provider] Error reading setting:", e);
    cachedProvider = "gateway";
  }

  cacheTimestamp = now;
  return cachedProvider!;
}

/**
 * Get the endpoint URL and API key for the active provider.
 *
 * Routing rules:
 *   - Google models (google/*) → always Lovable AI Gateway
 *   - OpenAI embedding models → always direct OpenAI API
 *   - "openrouter" provider → OpenRouter API (strips "openai/" prefix)
 *   - "openai" provider → direct OpenAI API (strips "openai/" prefix)
 *   - "gateway" provider → Lovable AI Gateway (keeps full model name)
 */
export function resolveEndpoint(
  provider: AIProvider,
  modelName: string,
  functionName?: string
): { url: string; apiKey: string; modelForApi: string } {
  // Embedding models always go direct to OpenAI
  if (modelName.startsWith("openai/text-embedding-")) {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("[ai-provider] OPENAI_API_KEY is not configured for embeddings");
    const rawModel = modelName.replace(/^openai\//, "");
    return {
      url: "https://api.openai.com/v1/embeddings",
      apiKey: key,
      modelForApi: rawModel,
    };
  }

  // Functions that must always use direct OpenAI
  if (functionName && isOpenAIOnlyFunction(functionName)) {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("[ai-provider] OPENAI_API_KEY is not configured for OpenAI-only function");
    const rawModel = modelName.replace(/^openai\//, "");
    return {
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: key,
      modelForApi: rawModel,
    };
  }

  // OpenRouter provider: route ALL models (including google/*) through OpenRouter
  if (provider === "openrouter") {
    const key = Deno.env.get("OPENROUTER_API_KEY");
    if (!key) throw new Error("[ai-provider] OPENROUTER_API_KEY is not configured for OpenRouter mode");
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: key,
      modelForApi: modelName, // OpenRouter accepts full model names like "google/gemini-2.5-flash:free"
    };
  }

  // Google models go through gateway when not on OpenRouter
  if (modelName.startsWith("google/")) {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("[ai-provider] LOVABLE_API_KEY is not configured");
    // Strip ":free" suffix — it's an OpenRouter convention, not supported by the gateway
    const cleanModel = modelName.replace(/:free$/, "");
    return {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: key,
      modelForApi: cleanModel,
    };
  }

  // Direct OpenAI provider
  if (provider === "openai" && modelName.startsWith("openai/")) {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) throw new Error("[ai-provider] OPENAI_API_KEY is not configured for direct OpenAI mode");
    const rawModel = modelName.replace(/^openai\//, "");
    return {
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: key,
      modelForApi: rawModel,
    };
  }

  // Default: gateway
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("[ai-provider] LOVABLE_API_KEY is not configured");
  return {
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKey: key,
    modelForApi: modelName,
  };
}
