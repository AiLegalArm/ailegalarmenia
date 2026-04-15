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

import {
  DEFAULT_SEGMENT_CONFIG,
  l2Normalize,
  meanPool,
  segmentTextForEmbedding,
  type SegmentConfig,
  type Tokenizer,
} from "./embedding-segmentation.ts";

const DEFAULT_MODEL = "text-embedding-3-small";
const MAX_BATCH_SIZE = 100;
const FUNCTION_URL_ENV = "SUPABASE_URL"; // injected by Supabase runtime

let cachedTokenizer: Tokenizer | null = null;

async function getTokenizer(): Promise<Tokenizer> {
  if (cachedTokenizer) return cachedTokenizer;
  const mod = await import("https://esm.sh/js-tiktoken@1.0.12?pin=v135");
  const enc = mod.getEncoding("cl100k_base");
  cachedTokenizer = {
    encode: (t: string) => enc.encode(t),
    decode: (tokens: number[]) => enc.decode(tokens),
  };
  return cachedTokenizer;
}

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

  const tokenizer = await getTokenizer();
  const cfg: SegmentConfig = DEFAULT_SEGMENT_CONFIG;

  const flatSegments: string[] = [];
  const segmentCounts: number[] = [];

  for (const text of texts) {
    const { segments } = segmentTextForEmbedding(text, tokenizer, cfg);
    segmentCounts.push(segments.length);
    for (const s of segments) flatSegments.push(s.text);
  }

  const segmentVectors: number[][] = [];
  for (let i = 0; i < flatSegments.length; i += MAX_BATCH_SIZE) {
    const batch = flatSegments.slice(i, i + MAX_BATCH_SIZE);
    const vectors = await callEmbeddingsFunction(batch, model, dimensions);
    segmentVectors.push(...vectors);
  }

  const out: number[][] = [];
  let cursor = 0;
  for (const count of segmentCounts) {
    const vectors = segmentVectors.slice(cursor, cursor + count);
    cursor += count;
    out.push(l2Normalize(meanPool(vectors)));
  }

  return out;
}

/**
 * Build a stable fingerprint string that matches the actual segments used for embeddings.
 * Use `sha256` over this fingerprint for idempotency fields.
 */
export async function buildEmbeddingFingerprintText(
  text: string,
  cfg: SegmentConfig = DEFAULT_SEGMENT_CONFIG,
): Promise<string> {
  const tokenizer = await getTokenizer();
  const { fingerprintText } = segmentTextForEmbedding(text, tokenizer, cfg);
  return fingerprintText;
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
  const supabaseUrl = Deno.env.get(FUNCTION_URL_ENV) ?? Deno.env.get("VITE_SUPABASE_URL");
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
