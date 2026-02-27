// =============================================================================
// MODEL CONFIG PROFILES — Centralized AI model configuration
// =============================================================================
// DEPRECATED: This file is a LEGACY fallback only.
// The authoritative model registry is MODEL_MAP in openai-router.ts.
// These profiles are kept for seed/fallback purposes only.
// ALL openai/* models have been replaced per governance policy.
// =============================================================================

export interface ModelConfig {
  /** Model identifier for Lovable AI Gateway */
  model: string;
  /** Sampling temperature (0.0 = deterministic, 1.0 = creative) */
  temperature: number;
  /** Maximum output tokens */
  max_tokens: number;
  /** Optional: top_p nucleus sampling */
  top_p?: number;
  /** Optional: frequency penalty */
  frequency_penalty?: number;
  /** Profile description for logging */
  description: string;
}

/**
 * LEGAL_DETERMINISTIC — For all legal analysis, document generation, complaint generation.
 * Low temperature ensures consistent, reproducible legal reasoning.
 * USES: anthropic/claude-3.7-sonnet via Lovable AI Gateway
 */
export const LEGAL_DETERMINISTIC: ModelConfig = {
  model: "anthropic/claude-3.7-sonnet",
  temperature: 0.1,
  max_tokens: 16384,
  top_p: 0.92,
  description: "Legal analysis with deterministic output (temp=0.1, Claude 3.7 Sonnet)",
};

/**
 * LEGAL_CHAT — For interactive legal chat.
 * USES: anthropic/claude-3.7-sonnet via Lovable AI Gateway
 */
export const LEGAL_CHAT: ModelConfig = {
  model: "anthropic/claude-3.7-sonnet",
  temperature: 0.1,
  max_tokens: 16000,
  description: "Legal chat (temp=0.1, Claude 3.7 Sonnet)",
};

/**
 * DOCUMENT_GENERATION — For generating legal documents.
 * USES: google/gemini-2.5-flash via Lovable AI Gateway
 */
export const DOCUMENT_GENERATION: ModelConfig = {
  model: "google/gemini-2.5-flash",
  temperature: 0.2,
  max_tokens: 10000,
  description: "Document generation (temp=0.2, Gemini 2.5 Flash)",
};

/**
 * COMPLAINT_GENERATION — For generating judicial complaints.
 * USES: anthropic/claude-3.7-sonnet via Lovable AI Gateway
 */
export const COMPLAINT_GENERATION: ModelConfig = {
  model: "anthropic/claude-3.7-sonnet",
  temperature: 0.1,
  max_tokens: 12000,
  description: "Complaint generation (temp=0.1, Claude 3.7 Sonnet)",
};

/**
 * OCR_EXTRACTION — For OCR/vision-based text extraction.
 * UNCHANGED: OCR functions are excluded from migration.
 * Still uses Google Gemini Flash for vision tasks.
 */
export const OCR_EXTRACTION: ModelConfig = {
  model: "google/gemini-2.5-flash",
  temperature: 0.1,
  max_tokens: 8000,
  description: "OCR text extraction — OCR ONLY, do NOT migrate (temp=0.1, Gemini Flash)",
};

/**
 * AUDIO_TRANSCRIPTION — For audio/video transcription.
 * USES: google/gemini-2.5-flash via Lovable AI Gateway
 */
export const AUDIO_TRANSCRIPTION: ModelConfig = {
  model: "google/gemini-2.5-flash",
  temperature: 0.1,
  max_tokens: 16000,
  description: "Audio transcription (temp=0.1, Gemini 2.5 Flash)",
};

/**
 * MULTI_AGENT_ANALYSIS — For 9-agent multi-agent system.
 * USES: anthropic/claude-3.7-sonnet via Lovable AI Gateway
 */
export const MULTI_AGENT_ANALYSIS: ModelConfig = {
  model: "anthropic/claude-3.7-sonnet",
  temperature: 0.1,
  max_tokens: 16384,
  description: "Multi-agent legal analysis (temp=0.1, Claude 3.7 Sonnet)",
};

/**
 * FILE_ANALYSIS — For analyzing uploaded files for complaints.
 * USES: anthropic/claude-3.7-sonnet via Lovable AI Gateway
 */
export const FILE_ANALYSIS: ModelConfig = {
  model: "anthropic/claude-3.7-sonnet",
  temperature: 0.1,
  max_tokens: 16384,
  description: "File analysis for complaints (temp=0.1, Claude 3.7 Sonnet)",
};

/**
 * FIELD_EXTRACTION — For extracting structured fields from case materials.
 * USES: google/gemini-2.5-pro via Lovable AI Gateway
 */
export const FIELD_EXTRACTION: ModelConfig = {
  model: "google/gemini-2.5-pro",
  temperature: 0.2,
  max_tokens: 16000,
  description: "Case field extraction — JSON output (temp=0.2, Gemini 2.5 Pro)",
};

/**
 * KEYWORD_EXTRACTION — For KB search keyword extraction.
 * USES: google/gemini-2.5-pro via Lovable AI Gateway
 */
export const KEYWORD_EXTRACTION: ModelConfig = {
  model: "google/gemini-2.5-pro",
  temperature: 0.2,
  max_tokens: 200,
  description: "Keyword extraction — JSON output (temp=0.2, Gemini 2.5 Pro)",
};

/**
 * EMBEDDING_GENERATION — For generating vector embeddings. Lightweight model.
 */
export const EMBEDDING_GENERATION: ModelConfig = {
  model: "google/gemini-2.5-flash-lite",
  temperature: 0.0,
  max_tokens: 0,
  description: "Embedding generation (Flash Lite)",
};

// =============================================================================
// PROFILE REGISTRY — All profiles in one place for validation and iteration
// =============================================================================

export const MODEL_PROFILES = {
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
} as const;

export type ProfileName = keyof typeof MODEL_PROFILES;

/**
 * Get a model config profile by name with runtime validation.
 */
export function getProfile(name: ProfileName): ModelConfig {
  const profile = MODEL_PROFILES[name];
  if (!profile) {
    throw new Error(`Unknown model profile: ${String(name)}`);
  }
  return profile;
}

/**
 * Build the request body parameters from a ModelConfig.
 * Strips undefined optional fields for clean API payloads.
 */
export function buildModelParams(config: ModelConfig): Record<string, unknown> {
  const params: Record<string, unknown> = {
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
  };
  if (config.top_p !== undefined) params.top_p = config.top_p;
  if (config.frequency_penalty !== undefined) params.frequency_penalty = config.frequency_penalty;
  return params;
}

/**
 * Validate that all profiles meet legal safety constraints.
 * Returns an array of violation messages (empty = all valid).
 */
export function validateProfiles(): string[] {
  const violations: string[] = [];
  const LEGAL_MAX_TEMP = 0.3;

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
    if (p.temperature > LEGAL_MAX_TEMP) {
      violations.push(
        `${name}: temperature ${p.temperature} exceeds legal max ${LEGAL_MAX_TEMP}`
      );
    }
    // Block openai/* models
    if (p.model.startsWith("openai/")) {
      violations.push(
        `${name}: openai/* models are forbidden, found ${p.model}`
      );
    }
  }

  // All profiles must have positive max_tokens (except embeddings)
  for (const [name, p] of Object.entries(MODEL_PROFILES)) {
    if (name === "EMBEDDING_GENERATION") continue;
    if (p.max_tokens <= 0) {
      violations.push(`${name}: max_tokens must be > 0, got ${p.max_tokens}`);
    }
  }

  return violations;
}
