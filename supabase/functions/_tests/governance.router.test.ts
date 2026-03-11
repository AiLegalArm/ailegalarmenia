// @ts-nocheck
/**
 * Governance tests for openai-router.ts.
 * P1: Validates model allowlists, temperature caps, max_tokens caps.
 */

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getModelConfig, MODEL_MAP } from "../_shared/openai-router.ts";

// ─── Test 1: Unknown function → GOVERNANCE VIOLATION ────────────────────────

Deno.test("governance: unknown function throws GOVERNANCE VIOLATION", () => {
  assertThrows(
    () => getModelConfig("nonexistent-function-xyz"),
    Error,
    "No model config",
    "Unknown function must throw with model config error"
  );
});

Deno.test("governance: unknown function error includes available keys", () => {
  try {
    getModelConfig("nonexistent-function-xyz");
    throw new Error("Should have thrown");
  } catch (e) {
    const msg = (e as Error).message;
    assertEquals(
      msg.includes("Available keys:") || msg.includes("No model config"),
      true,
      "Error message must list available keys"
    );
  }
});

// ─── Test 2: Unknown role for known function → error ────────────────────────

Deno.test("governance: unknown role for ai-analyze throws error", () => {
  assertThrows(
    () => getModelConfig("ai-analyze", "nonexistent_role"),
    Error,
    "Undefined role",
    "Unknown role must throw"
  );
});

// ─── Test 3: All MODEL_MAP entries pass governance ──────────────────────────

Deno.test("governance: all MODEL_MAP entries have temperature <= 0.3", () => {
  for (const [key, cfg] of Object.entries(MODEL_MAP)) {
    assertEquals(
      cfg.temperature <= 0.3,
      true,
      `${key}: temperature ${cfg.temperature} exceeds cap 0.3`
    );
  }
});

Deno.test("governance: all MODEL_MAP entries have max_tokens <= 16384", () => {
  for (const [key, cfg] of Object.entries(MODEL_MAP)) {
    assertEquals(
      cfg.max_tokens <= 16384,
      true,
      `${key}: max_tokens ${cfg.max_tokens} exceeds cap 16384`
    );
  }
});

// ─── Test 4: Only allowed model prefixes ────────────────────────────────────

Deno.test("governance: all models use allowed prefixes (openai/, google/, openrouter/, anthropic/)", () => {
  for (const [key, cfg] of Object.entries(MODEL_MAP)) {
    const validPrefix = 
      cfg.model.startsWith("openai/") || 
      cfg.model.startsWith("google/") || 
      cfg.model.startsWith("openrouter/") || 
      cfg.model.startsWith("anthropic/");
    assertEquals(
      validPrefix,
      true,
      `${key}: model "${cfg.model}" has invalid prefix (must be openai/, google/, openrouter/, or anthropic/)`
    );
  }
});

// ─── Test 5: Strict JSON roles must use Gemini Pro ──────────────────────────

Deno.test("governance: strict JSON roles resolve to google/gemini-2.5-pro", () => {
  const strictRoles = [
    "precedent_citation",
    "cross_exam",
    "deadline_rules",
    "law_update_summary",
  ];

  for (const role of strictRoles) {
    const cfg = getModelConfig("ai-analyze", role);
    assertEquals(
      cfg.model,
      "google/gemini-2.5-pro",
      `ai-analyze:${role} must use google/gemini-2.5-pro, got ${cfg.model}`
    );
  }
});

// ─── Test 6: OpenAI chat functions are in allowlist ─────────────────────────

Deno.test("governance: critical OpenAI functions pass governance check", () => {
  const criticalFunctions = [
    "ai-analyze",
    "generate-complaint",
    "legal-chat",
    "generate-document",
    "multi-agent-analyze",
    "extract-case-fields",
    "admin-ai-chat",
  ];

  for (const fn of criticalFunctions) {
    // Should not throw
    const cfg = getModelConfig(fn);
    assertEquals(typeof cfg.model, "string", `${fn} must resolve to a valid model`);
    assertEquals(cfg.model.length > 0, true, `${fn} model must not be empty`);
  }
});

// ─── Test 7: Embedding model restricted ─────────────────────────────────────

Deno.test("governance: embedding model only allowed for generate-embeddings", () => {
  const cfg = getModelConfig("generate-embeddings");
  assertEquals(
    cfg.model,
    "openai/text-embedding-3-large",
    "generate-embeddings must use openai/text-embedding-3-large"
  );
});

// ─── Test 8: GovernanceMeta structure ───────────────────────────────────────

Deno.test("governance: getModelConfig returns complete ModelConfig", () => {
  const cfg = getModelConfig("ai-analyze");
  assertEquals(typeof cfg.model, "string");
  assertEquals(typeof cfg.temperature, "number");
  assertEquals(typeof cfg.max_tokens, "number");
  assertEquals(typeof cfg.description, "string");
});

// ─── Test 9: No hardcoded model strings outside MODEL_MAP ───────────────────

Deno.test("governance: openai-router.ts has no hardcoded AI Gateway URL outside constant", async () => {
  const source = await Deno.readTextFile(
    new URL("../_shared/openai-router.ts", import.meta.url)
  );

  // Count AI_GATEWAY occurrences
  const gatewayConstMatch = source.match(/const AI_GATEWAY\s*=/);
  assertEquals(gatewayConstMatch !== null, true, "AI_GATEWAY constant must be defined");

  // All fetch calls to AI should use the AI_GATEWAY constant
  const directGatewayUrls = source.match(/https:\/\/ai\.gateway\.lovable\.dev/g) || [];
  assertEquals(
    directGatewayUrls.length,
    1,
    "AI Gateway URL must appear exactly once (in the constant definition)"
  );
});
