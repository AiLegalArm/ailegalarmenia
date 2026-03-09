/**
 * _shared/embeddings.ts — Shared helper to call the central embeddings-generate function.
 *
 * All Edge Functions (legal-chat, ai-analyze, multi-agent-analyze,
 * generate-complaint, generate-document, ingest/enrich) should import this helper
 * instead of calling OpenRouter directly.
 *
 * Usage:
 *   import { generateEmbeddings, generateEmbedding } from "../_shared/embeddings.ts";
 *
 *   const vectors = await generateEmbeddings(["text 1", "text 2"]);
 *   const single  = await generateEmbedding("text 1");
 */

const DEFAULT_MODEL = "text-embedding-3-large";
const MAX_BATCH_SIZE = 100;
const FUNCTION_URL_ENV = "SUPABASE_URL"; // injected by Supabase runtime

/**
 * Generate embeddings for multiple texts via the embeddings-generate Edge Function.
 *
 * @param texts    Array of texts to embed (max 100, max 32k chars each)
 * @param model    Optional model override
 * @param dimensions Optional dimensions override
 * @returns        Array of embedding vectors in the same order as inputs
 */
export async function generateEmbeddings(
  texts: string[],
  model = DEFAULT_MODEL,
  dimensions?: number,
): Promise<number[][]> {
  if (!texts.length) return [];

  // Chunk into batches if needed
  const allVectors: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const vectors = await callEmbeddingsFunction(batch, model, dimensions);
    allVectors.push(...vectors);
  }
  return allVectors;
}

/**
 * Generate embedding for a single text.
 */
export async function generateEmbedding(
  text: string,
  model = DEFAULT_MODEL,
  dimensions?: number,
): Promise<number[]> {
  const [vector] = await generateEmbeddings([text], model, dimensions);
  return vector;
}

// ─── Internal ──────────────────────────────────────────────────────────────

async function callEmbeddingsFunction(
  texts: string[],
  model: string,
  dimensions?: number,
): Promise<number[][]> {
  const supabaseUrl = Deno.env.get(FUNCTION_URL_ENV);
  const internalKey = Deno.env.get("INTERNAL_INGEST_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl) throw new Error("SUPABASE_URL not available");

  const functionUrl = `${supabaseUrl}/functions/v1/embeddings-generate`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Prefer internal key, fall back to service role JWT
  if (internalKey) {
    headers["x-internal-key"] = internalKey;
  } else if (serviceKey) {
    headers["Authorization"] = `Bearer ${serviceKey}`;
  } else {
    throw new Error("No auth credentials available for embeddings-generate");
  }

  const body: Record<string, unknown> = { texts, model };
  if (dimensions) body.dimensions = dimensions;

  const res = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`embeddings-generate responded ${res.status}: ${errText}`);
  }

  const json = await res.json();

  if (!json.vectors || !Array.isArray(json.vectors)) {
    throw new Error("embeddings-generate returned unexpected format");
  }

  return json.vectors as number[][];
}

/**
 * Format a vector as a Postgres-compatible string literal.
 * Use when updating an 'embedding' column directly via SQL.
 */
export function vectorToString(v: number[]): string {
  return `[${v.join(",")}]`;
}
