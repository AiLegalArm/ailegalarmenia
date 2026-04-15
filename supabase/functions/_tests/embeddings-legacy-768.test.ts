import { assertEquals, assertThrows } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { assertLegacyWillExist, computeEmbeddingPlan } from "../_shared/embedding-idempotency.ts";
import { assertVectorDim, hasValidStoredVector, LEGACY_EMBEDDING_DIM } from "../_shared/embedding-legacy.ts";

Deno.test("embedding_legacy_768: vector length validation (768)", () => {
  const v = Array.from({ length: LEGACY_EMBEDDING_DIM }, () => 0.1);
  assertVectorDim(v, LEGACY_EMBEDDING_DIM, "legacy");

  const bad = Array.from({ length: LEGACY_EMBEDDING_DIM - 1 }, () => 0.1);
  assertThrows(() => assertVectorDim(bad, LEGACY_EMBEDDING_DIM, "legacy"), Error, "invalid dimensions");
});

Deno.test("embedding_legacy_768: stored vector parsing validates expected length", () => {
  const s = JSON.stringify([0.1, 0.2, 0.3]);
  assertEquals(hasValidStoredVector(s, 3), true);
  assertEquals(hasValidStoredVector(s, 4), false);
});

Deno.test("idempotency: never skip unless both embeddings exist and hash unchanged", () => {
  const ok = computeEmbeddingPlan({ storedHash: "a", computedHash: "a", hasPrimary: true, hasLegacy: true });
  assertEquals(ok.skip, true);

  const missingLegacy = computeEmbeddingPlan({ storedHash: "a", computedHash: "a", hasPrimary: true, hasLegacy: false });
  assertEquals(missingLegacy.skip, false);
  assertEquals(missingLegacy.needLegacy, true);

  const changed = computeEmbeddingPlan({ storedHash: "old", computedHash: "new", hasPrimary: true, hasLegacy: true });
  assertEquals(changed.skip, false);
  assertEquals(changed.needPrimary, true);
  assertEquals(changed.needLegacy, true);
});

Deno.test("guardrail: refuse to mark embedded without legacy_768", () => {
  assertThrows(
    () => assertLegacyWillExist({ hasLegacy: false, legacyGenerated: false }),
    Error,
    "embedding_legacy_768",
  );
  assertLegacyWillExist({ hasLegacy: true, legacyGenerated: false });
  assertLegacyWillExist({ hasLegacy: false, legacyGenerated: true });
});

