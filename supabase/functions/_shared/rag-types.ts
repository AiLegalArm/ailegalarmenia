// =============================================================================
// SHARED RAG TYPES — Single source of truth for search result shapes
// =============================================================================

/** Knowledge-base document returned by vector-search / search_knowledge_base RPC */
export interface KBSearchResult {
  id: string;
  title: string;
  content_text: string;
  category?: string;
  source_name?: string;
  version_date?: string;
  similarity?: number;
  rank?: number;
  score?: number;
}

/** Legal-practice document returned by vector-search / search_legal_practice RPC */
export interface PracticeSearchResult {
  id: string;
  title: string;
  content_text?: string;
  content_snippet?: string;
  practice_category?: string;
  court_type?: string;
  outcome?: string;
  applied_articles?: string[] | Record<string, unknown>[];
  key_violations?: string[];
  legal_reasoning_summary?: string;
  /** ISO date string (YYYY-MM-DD) of the court decision */
  decision_date?: string;
  /** Anonymized case number */
  case_number?: string;
  /** Court name (Armenian) */
  court_name?: string;
  /** Precedent unit paragraphs */
  key_paragraphs?: Record<string, unknown>[];
  similarity?: number;
  rank?: number;
  relevance_rank?: number;
  relevance_score?: number;
  score?: number;
}

/**
 * Single item in the unified merged result list returned by kb-unified-search.
 * Combines KB documents and legal-practice records into one ranked stream.
 */
export interface MergedItem {
  /** Which collection this result came from */
  source: "kb" | "practice";
  id: string;
  title: string;
  /** Hybrid score: 0.6 × FTS_normalized + 0.4 × cosine_similarity (range 0–1) */
  normalized_score: number;
  /** Raw FTS rank before normalization */
  raw_score: number;
  /** Truncated content preview (≤ MAX_PREVIEW_CHARS characters) */
  preview: string;
  /** Source-specific metadata (category, court_type, outcome, etc.) */
  meta: Record<string, unknown>;
}

/** Shape returned by the vector-search edge function */
export interface VectorSearchResponse {
  kb: KBSearchResult[];
  practice: PracticeSearchResult[];
  /** Unified ranked list merging KB + practice results by hybrid score */
  merged?: MergedItem[];
  /** Telemetry: which retrieval methods produced results */
  retrieval_mode?: "keyword+rerank" | "keyword_only" | "rpc_fallback";
  /** Whether AI reranking succeeded */
  rerank_ok?: boolean;
  /** Error message if AI reranking failed */
  rerank_error?: string;
  /** @deprecated Use retrieval_mode (kept for backward compat in logs) */
  semantic_ok?: boolean;
  /** @deprecated Use rerank_error */
  semantic_error?: string;
  /** Request tracing ID */
  request_id?: string;
}

/** OpenAI-compatible chat completion message content part */
export interface TextContentPart {
  type: "text";
  text: string;
}

export interface ImageContentPart {
  type: "image_url";
  image_url: { url: string };
}

export type ContentPart = TextContentPart | ImageContentPart;

/** Parsed multi-agent analysis result */
export interface MultiAgentParsedResult {
  summary: string;
  analysis: string;
  findings: unknown[];
  evidenceItems: unknown[];
  [key: string]: unknown;
}

/** Error shape thrown by requireAdmin / edge auth guards */
export interface EdgeFunctionError {
  status: number;
  code: string;
  message: string;
}

/** Supabase joined reminder with profile */
export interface ReminderWithProfile {
  id: string;
  title: string;
  event_datetime: string;
  reminder_type: string;
  description?: string | null;
  profiles: {
    telegram_chat_id: string | null;
    notification_preferences: { telegram?: boolean } | null;
  } | null;
}
