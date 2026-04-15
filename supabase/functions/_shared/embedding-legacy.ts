/**
 * _shared/embedding-legacy.ts
 *
 * Shared helpers for maintaining legacy (768-d) embeddings alongside primary embeddings.
 * Works with Supabase/pgvector values that often arrive as a string like "[0.1,0.2,...]".
 */

export const PRIMARY_EMBEDDING_DIM = 1536;
export const LEGACY_EMBEDDING_DIM = 768;

export function assertVectorDim(vector: number[], expectedDim: number, label: string): void {
  if (!Array.isArray(vector)) throw new Error(`${label}: vector is not an array`);
  if (vector.length !== expectedDim) {
    throw new Error(`${label}: invalid dimensions (expected ${expectedDim}, got ${vector.length})`);
  }
  // Ensure numbers are finite before writing.
  const badIdx = vector.findIndex((n) => typeof n !== "number" || !Number.isFinite(n));
  if (badIdx !== -1) {
    throw new Error(`${label}: non-finite number at index ${badIdx}`);
  }
}

export function tryParseStoredVector(value: unknown): number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.every((n) => typeof n === "number") ? (value as number[]) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return null;
      if (!parsed.every((n) => typeof n === "number")) return null;
      return parsed as number[];
    } catch {
      return null;
    }
  }
  return null;
}

export function hasValidStoredVector(value: unknown, expectedDim: number): boolean {
  const v = tryParseStoredVector(value);
  return Array.isArray(v) && v.length === expectedDim && v.every((n) => typeof n === "number" && Number.isFinite(n));
}

export function mergeJsonObject(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = (existing && typeof existing === "object" && !Array.isArray(existing))
    ? (existing as Record<string, unknown>)
    : {};
  return { ...base, ...patch };
}

