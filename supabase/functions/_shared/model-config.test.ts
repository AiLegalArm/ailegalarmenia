import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  MODEL_PROFILES,
  LEGAL_DETERMINISTIC,
  LEGAL_CHAT,
  DOCUMENT_GENERATION,
  COMPLAINT_GENERATION,
  OCR_EXTRACTION,
  AUDIO_TRANSCRIPTION,
  MULTI_AGENT_ANALYSIS,
  FILE_ANALYSIS,
  FIELD_EXTRACTION,
  KEYWORD_EXTRACTION,
  EMBEDDING_GENERATION,
  getProfile,
  buildModelParams,
  validateProfiles,
  type ModelConfig,
  type ProfileName,
} from "./model-config.ts";

// =============================================================================
// 1) PROFILE INTEGRITY — All profiles must exist and have required fields
// =============================================================================

Deno.test("All profiles have required fields", () => {
  for (const [name, profile] of Object.entries(MODEL_PROFILES)) {
    assert(profile.model, `${name}: model is required`);
    assert(typeof profile.temperature === "number", `${name}: temperature must be number`);
    assert(typeof profile.max_tokens === "number", `${name}: max_tokens must be number`);
    assert(profile.description, `${name}: description is required`);
  }
});

Deno.test("Profile count matches expected", () => {
  assertEquals(Object.keys(MODEL_PROFILES).length, 11);
});

// =============================================================================
// 2) LEGAL TEMPERATURE CONSTRAINTS — Critical safety check
// =============================================================================

Deno.test("LEGAL_DETERMINISTIC temperature <= 0.3", () => {
  assert(LEGAL_DETERMINISTIC.temperature <= 0.3,
    `LEGAL_DETERMINISTIC temp ${LEGAL_DETERMINISTIC.temperature} exceeds 0.3`);
});

Deno.test("LEGAL_CHAT temperature <= 0.3", () => {
  assert(LEGAL_CHAT.temperature <= 0.3,
    `LEGAL_CHAT temp ${LEGAL_CHAT.temperature} exceeds 0.3`);
});

Deno.test("DOCUMENT_GENERATION temperature <= 0.3", () => {
  assert(DOCUMENT_GENERATION.temperature <= 0.3,
    `DOCUMENT_GENERATION temp ${DOCUMENT_GENERATION.temperature} exceeds 0.3`);
});

Deno.test("COMPLAINT_GENERATION temperature <= 0.3", () => {
  assert(COMPLAINT_GENERATION.temperature <= 0.3,
    `COMPLAINT_GENERATION temp ${COMPLAINT_GENERATION.temperature} exceeds 0.3`);
});

Deno.test("MULTI_AGENT_ANALYSIS temperature <= 0.3", () => {
  assert(MULTI_AGENT_ANALYSIS.temperature <= 0.3,
    `MULTI_AGENT_ANALYSIS temp ${MULTI_AGENT_ANALYSIS.temperature} exceeds 0.3`);
});

Deno.test("FILE_ANALYSIS temperature <= 0.3", () => {
  assert(FILE_ANALYSIS.temperature <= 0.3,
    `FILE_ANALYSIS temp ${FILE_ANALYSIS.temperature} exceeds 0.3`);
});

Deno.test("All legal profiles pass validateProfiles()", () => {
  const violations = validateProfiles();
  assertEquals(violations.length, 0, `Violations found: ${violations.join("; ")}`);
});

// =============================================================================
// 3) MODEL SELECTION — Correct model for each use case
// =============================================================================

Deno.test("Deep analysis uses GPT-5", () => {
  assertEquals(LEGAL_DETERMINISTIC.model, "openai/gpt-5");
  assertEquals(LEGAL_CHAT.model, "openai/gpt-5");
  assertEquals(MULTI_AGENT_ANALYSIS.model, "openai/gpt-5");
  assertEquals(DOCUMENT_GENERATION.model, "openai/gpt-5");
  assertEquals(COMPLAINT_GENERATION.model, "openai/gpt-5");
  assertEquals(FILE_ANALYSIS.model, "openai/gpt-5");
});

Deno.test("Utility operations use Flash model", () => {
  assertEquals(OCR_EXTRACTION.model, "google/gemini-2.5-flash");
  assertEquals(AUDIO_TRANSCRIPTION.model, "google/gemini-2.5-flash");
  assertEquals(FIELD_EXTRACTION.model, "google/gemini-2.5-flash");
});

Deno.test("Lightweight tasks use Flash Lite", () => {
  assertEquals(KEYWORD_EXTRACTION.model, "google/gemini-2.5-flash-lite");
  assertEquals(EMBEDDING_GENERATION.model, "google/gemini-2.5-flash-lite");
});

// =============================================================================
// 4) OCR/TRANSCRIPTION profiles — Low temperature for accuracy
// =============================================================================

Deno.test("OCR_EXTRACTION temperature <= 0.1", () => {
  assert(OCR_EXTRACTION.temperature <= 0.1);
});

Deno.test("AUDIO_TRANSCRIPTION temperature <= 0.1", () => {
  assert(AUDIO_TRANSCRIPTION.temperature <= 0.1);
});

Deno.test("FIELD_EXTRACTION temperature <= 0.1", () => {
  assert(FIELD_EXTRACTION.temperature <= 0.1);
});

// =============================================================================
// 5) getProfile() — Runtime access with validation
// =============================================================================

Deno.test("getProfile returns correct profile", () => {
  const p = getProfile("LEGAL_DETERMINISTIC");
  assertEquals(p.model, "openai/gpt-5");
  assertEquals(p.temperature, 0.2);
});

Deno.test("getProfile throws on invalid name", () => {
  let threw = false;
  try {
    getProfile("NONEXISTENT" as ProfileName);
  } catch {
    threw = true;
  }
  assert(threw, "getProfile should throw for invalid profile name");
});

// =============================================================================
// 6) buildModelParams() — Clean API payload generation
// =============================================================================

Deno.test("buildModelParams includes base fields", () => {
  const params = buildModelParams(FIELD_EXTRACTION);
  assertEquals(params.model, "google/gemini-2.5-flash");
  assertEquals(params.temperature, 0.1);
  assertEquals(params.max_tokens, 16000);
  assertEquals(params.top_p, undefined);
  assertEquals(params.frequency_penalty, undefined);
});

Deno.test("buildModelParams includes optional fields when present", () => {
  const params = buildModelParams(LEGAL_DETERMINISTIC);
  assertEquals(params.top_p, 0.92);
  assertEquals(params.frequency_penalty, 1.2);
});

// =============================================================================
// 7) REGRESSION — Temperature never exceeds safe bounds after edits
// =============================================================================

Deno.test("No profile has temperature > 1.0", () => {
  for (const [name, p] of Object.entries(MODEL_PROFILES)) {
    assert(p.temperature <= 1.0, `${name}: temperature ${p.temperature} exceeds 1.0`);
  }
});

Deno.test("No legal profile has temperature > 0.3", () => {
  const legalProfiles: ProfileName[] = [
    "LEGAL_DETERMINISTIC",
    "LEGAL_CHAT",
    "DOCUMENT_GENERATION",
    "COMPLAINT_GENERATION",
    "MULTI_AGENT_ANALYSIS",
    "FILE_ANALYSIS",
  ];
  for (const name of legalProfiles) {
    const p = MODEL_PROFILES[name];
    assert(p.temperature <= 0.3,
      `REGRESSION: ${name} temperature ${p.temperature} exceeds legal max 0.3`);
  }
});

Deno.test("max_tokens is positive for non-embedding profiles", () => {
  for (const [name, p] of Object.entries(MODEL_PROFILES)) {
    if (name === "EMBEDDING_GENERATION") continue;
    assert(p.max_tokens > 0, `${name}: max_tokens should be > 0`);
  }
});
