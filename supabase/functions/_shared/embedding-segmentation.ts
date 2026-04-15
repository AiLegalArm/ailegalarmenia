/**
 * Token-aware segmentation for embeddings + stable fingerprint text.
 *
 * Purpose:
 * - Avoid OpenAI "token limit exceeded" by embedding up to N windows per text.
 * - Pool the segment vectors (mean + L2 normalization) back into one vector.
 * - Provide a stable fingerprint string for idempotency hashing that matches
 *   the actual segments used for embeddings.
 */

export type Tokenizer = {
  encode: (text: string) => number[];
  decode: (tokens: number[]) => string;
};

export type SegmentConfig = {
  tokenLimit: number;
  windowTokens: number;
  maxSegments: number;
};

export const DEFAULT_SEGMENT_CONFIG: SegmentConfig = {
  // text-embedding-3-small context is 8191 tokens. Leave headroom.
  tokenLimit: 7800,
  // Conservative window size; cap=4 → ~8k tokens embedded max.
  windowTokens: 2000,
  maxSegments: 4,
};

export type TokenWindow = { start: number; end: number };

export function selectTokenWindows(
  totalTokens: number,
  cfg: SegmentConfig,
): TokenWindow[] {
  const tokenLimit = Math.max(1, cfg.tokenLimit);
  const windowTokens = Math.max(1, Math.min(cfg.windowTokens, totalTokens || cfg.windowTokens));
  const maxSegments = Math.max(1, cfg.maxSegments);

  if (totalTokens <= tokenLimit) return [{ start: 0, end: totalTokens }];

  const clampStart = (s: number) => Math.max(0, Math.min(s, Math.max(0, totalTokens - windowTokens)));
  const starts = [
    0,
    clampStart(Math.floor(totalTokens / 3) - Math.floor(windowTokens / 2)),
    clampStart(Math.floor((2 * totalTokens) / 3) - Math.floor(windowTokens / 2)),
    clampStart(totalTokens - windowTokens),
  ];

  // De-dupe while keeping order, then cap.
  const uniqueStarts: number[] = [];
  for (const s of starts) {
    if (!uniqueStarts.includes(s)) uniqueStarts.push(s);
  }

  return uniqueStarts.slice(0, maxSegments).map((s) => ({
    start: s,
    end: Math.min(totalTokens, s + windowTokens),
  }));
}

export function buildEmbeddingFingerprintTextFromSegments(
  segments: Array<{ window: TokenWindow; text: string }>,
): string {
  // Include window ranges to prevent accidental collisions if segment text repeats.
  return segments.map((s) => `[[w:${s.window.start}-${s.window.end}]]\n${s.text}`).join("\n\n---SEG---\n\n");
}

export function segmentTextForEmbedding(
  text: string,
  tokenizer: Tokenizer,
  cfg: SegmentConfig = DEFAULT_SEGMENT_CONFIG,
): { segments: Array<{ window: TokenWindow; text: string }>; fingerprintText: string } {
  const tokens = tokenizer.encode(text);
  const windows = selectTokenWindows(tokens.length, cfg);
  const segments = windows.map((w) => ({
    window: w,
    text: tokenizer.decode(tokens.slice(w.start, w.end)),
  }));
  const fingerprintText = buildEmbeddingFingerprintTextFromSegments(segments);
  return { segments, fingerprintText };
}

export function meanPool(vectors: number[][]): number[] {
  if (!vectors.length) return [];
  const dim = vectors[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) throw new Error("Cannot pool vectors with different dimensions");
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

export function l2Normalize(v: number[]): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (!Number.isFinite(norm) || norm <= 0) return v;
  return v.map((x) => x / norm);
}

