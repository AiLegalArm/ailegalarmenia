export type EmbeddingPlan = {
  hashUnchanged: boolean;
  skip: boolean;
  needPrimary: boolean;
  needLegacy: boolean;
};

/**
 * Decide whether to skip or generate embeddings based on:
 * - a stable hash of the embedding input text
 * - presence/validity of primary + legacy vectors
 *
 * Invariants:
 * - Never skip unless BOTH embeddings exist and the hash is unchanged.
 * - If the hash changed, regenerate BOTH (primary + legacy).
 * - If the hash is unchanged, generate only missing/invalid embeddings.
 */
export function computeEmbeddingPlan(args: {
  storedHash: string | null;
  computedHash: string;
  hasPrimary: boolean;
  hasLegacy: boolean;
}): EmbeddingPlan {
  const hashUnchanged = args.storedHash === args.computedHash;
  const skip = hashUnchanged && args.hasPrimary && args.hasLegacy;
  const needPrimary = !args.hasPrimary || !hashUnchanged;
  const needLegacy = !args.hasLegacy || !hashUnchanged;
  return { hashUnchanged, skip, needPrimary, needLegacy };
}

/**
 * Guardrail: refuse to mark a record as embedded if legacy_768 will be missing.
 */
export function assertLegacyWillExist(args: { hasLegacy: boolean; legacyGenerated: boolean }): void {
  if (!(args.hasLegacy || args.legacyGenerated)) {
    throw new Error("Refusing to mark embedded: embedding_legacy_768 missing/invalid");
  }
}

