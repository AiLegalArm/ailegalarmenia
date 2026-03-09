// =============================================================================
// TOKEN BUDGET LIMITER — Deterministic token estimation, allocation & trimming
// Shared across all AI edge functions
// =============================================================================

// ---------------------------------------------------------------------------
// Token Estimation
// ---------------------------------------------------------------------------

/**
 * Estimates token count for a given text string.
 * Uses a deterministic heuristic: ~4 characters per token for Latin,
 * ~2 characters per token for Armenian/Cyrillic (wider Unicode).
 * This is conservative to avoid exceeding model limits.
 */
export function estimateTokens(text: string): number {
  if (!text || typeof text !== "string") return 0;

  let latinChars = 0;
  let wideChars = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // Armenian: U+0531-U+058F, Cyrillic: U+0400-U+04FF
    if ((code >= 0x0531 && code <= 0x058F) || (code >= 0x0400 && code <= 0x04FF)) {
      wideChars++;
    } else {
      latinChars++;
    }
  }

  // Latin: ~4 chars/token, Armenian/Cyrillic: ~2 chars/token
  return Math.ceil(latinChars / 4) + Math.ceil(wideChars / 2);
}

// ---------------------------------------------------------------------------
// Budget Configuration
// ---------------------------------------------------------------------------

/** Default token budgets per content bucket */
export interface TokenBudgetConfig {
  /** Max tokens for user-provided facts/context */
  userFacts: number;
  /** Max tokens for OCR-extracted text */
  ocrText: number;
  /** Max tokens for KB legislation RAG context */
  ragLegislation: number;
  /** Max tokens for legal practice RAG context */
  ragPractice: number;
  /** Max tokens for conversation history */
  conversationHistory: number;
  /** Max tokens for system prompt (informational, not trimmed) */
  systemPrompt: number;
}

/** Preset budget profiles */
export const BUDGET_PROFILES: Record<string, TokenBudgetConfig> = {
  /** For legal-chat: balanced, moderate context */
  chat: {
    userFacts: 2000,
    ocrText: 3000,
    ragLegislation: 4000,
    ragPractice: 3000,
    conversationHistory: 6000,
    systemPrompt: 4000,
  },
  /** For ai-analyze: heavy RAG, large facts — supports up to 110k tokens per file */
  analyze: {
    userFacts: 110000,
    ocrText: 110000,
    ragLegislation: 15000,
    ragPractice: 15000,
    conversationHistory: 0,
    systemPrompt: 10000,
  },
  /** For generate-document: moderate everything */
  document: {
    userFacts: 3000,
    ocrText: 2000,
    ragLegislation: 4000,
    ragPractice: 3000,
    conversationHistory: 0,
    systemPrompt: 5000,
  },
};

// ---------------------------------------------------------------------------
// Ranked Content Item (for trimming by relevance)
// ---------------------------------------------------------------------------

export interface RankedContent {
  /** The text content */
  text: string;
  /** Relevance score (higher = more relevant, keep first) */
  score: number;
  /** Optional source label for logging */
  source?: string;
}

// ---------------------------------------------------------------------------
// Budget Trimmer
// ---------------------------------------------------------------------------

export interface TrimResult {
  /** Trimmed text that fits within budget */
  trimmedText: string;
  /** Estimated tokens of trimmed output */
  tokenCount: number;
  /** Number of items kept */
  itemsKept: number;
  /** Number of items dropped */
  itemsDropped: number;
  /** Whether any trimming occurred */
  wasTrimmed: boolean;
}

/**
 * Trims a list of ranked content items to fit within a token budget.
 * Items are sorted by score descending; lowest-relevance items are dropped first.
 * Within the last kept item, text is truncated at a sentence boundary if possible.
 */
export function trimToBudget(
  items: RankedContent[],
  maxTokens: number
): TrimResult {
  if (!items || items.length === 0 || maxTokens <= 0) {
    return { trimmedText: "", tokenCount: 0, itemsKept: 0, itemsDropped: 0, wasTrimmed: false };
  }

  // Sort by score descending (most relevant first)
  const sorted = [...items].sort((a, b) => b.score - a.score);

  let totalTokens = 0;
  const kept: string[] = [];
  let dropped = 0;

  for (const item of sorted) {
    const itemTokens = estimateTokens(item.text);

    if (totalTokens + itemTokens <= maxTokens) {
      // Fits entirely
      kept.push(item.text);
      totalTokens += itemTokens;
    } else {
      // Partial fit: truncate this item to fill remaining budget
      const remaining = maxTokens - totalTokens;
      if (remaining > 50) {
        // Enough room for meaningful content
        const truncated = truncateToTokenBudget(item.text, remaining);
        if (truncated.length > 0) {
          kept.push(truncated);
          totalTokens += estimateTokens(truncated);
        }
      }
      dropped++;
      // All subsequent items are also dropped
      dropped += sorted.length - kept.length - dropped;
      break;
    }
  }

  // Count remaining dropped items
  if (kept.length + dropped < sorted.length) {
    dropped = sorted.length - kept.length;
  }

  const trimmedText = kept.join("\n\n---\n\n");

  return {
    trimmedText,
    tokenCount: estimateTokens(trimmedText),
    itemsKept: kept.length,
    itemsDropped: dropped,
    wasTrimmed: dropped > 0 || kept.length < sorted.length,
  };
}

/**
 * Trims a single text string to fit within a token budget.
 * Truncates at the nearest sentence boundary before the limit.
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (!text) return "";
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Approximate character limit (conservative: use 2 chars/token for safety)
  const charLimit = maxTokens * 2;
  let truncated = text.substring(0, charLimit);

  // Try to cut at last sentence boundary
  const lastSentence = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf(".\n"),
    truncated.lastIndexOf("\u0589 "), // Armenian full stop
    truncated.lastIndexOf("\u0589\n"),
  );

  if (lastSentence > charLimit * 0.5) {
    truncated = truncated.substring(0, lastSentence + 1);
  }

  return truncated;
}

// ---------------------------------------------------------------------------
// Apply Budget to All Buckets
// ---------------------------------------------------------------------------

export interface BucketInput {
  userFacts?: string;
  ocrText?: string;
  ragLegislation?: RankedContent[];
  ragPractice?: RankedContent[];
  conversationHistory?: string;
}

export interface BudgetedOutput {
  userFacts: string;
  ocrText: string;
  ragLegislation: string;
  ragPractice: string;
  conversationHistory: string;
  usage: TokenUsageReport;
}

export interface TokenUsageReport {
  buckets: Record<string, { tokens: number; itemsKept: number; itemsDropped: number; trimmed: boolean }>;
  totalInputTokens: number;
  budgetProfile: string;
  timestamp: string;
}

/**
 * Applies token budgets to all content buckets.
 * Returns trimmed content and a usage report.
 */
export function applyBudgets(
  input: BucketInput,
  profileName: string = "chat"
): BudgetedOutput {
  const config = BUDGET_PROFILES[profileName] || BUDGET_PROFILES.chat;
  const buckets: TokenUsageReport["buckets"] = {};

  // 1. User facts — single text, truncate directly
  const userFacts = truncateToTokenBudget(input.userFacts || "", config.userFacts);
  const userFactsTokens = estimateTokens(userFacts);
  buckets.userFacts = {
    tokens: userFactsTokens,
    itemsKept: userFacts ? 1 : 0,
    itemsDropped: 0,
    trimmed: userFactsTokens < estimateTokens(input.userFacts || ""),
  };

  // 2. OCR text — single text, truncate directly
  const ocrText = truncateToTokenBudget(input.ocrText || "", config.ocrText);
  const ocrTokens = estimateTokens(ocrText);
  buckets.ocrText = {
    tokens: ocrTokens,
    itemsKept: ocrText ? 1 : 0,
    itemsDropped: 0,
    trimmed: ocrTokens < estimateTokens(input.ocrText || ""),
  };

  // 3. RAG legislation — ranked items, trim by relevance
  const legResult = trimToBudget(input.ragLegislation || [], config.ragLegislation);
  buckets.ragLegislation = {
    tokens: legResult.tokenCount,
    itemsKept: legResult.itemsKept,
    itemsDropped: legResult.itemsDropped,
    trimmed: legResult.wasTrimmed,
  };

  // 4. RAG practice — ranked items, trim by relevance
  const practiceResult = trimToBudget(input.ragPractice || [], config.ragPractice);
  buckets.ragPractice = {
    tokens: practiceResult.tokenCount,
    itemsKept: practiceResult.itemsKept,
    itemsDropped: practiceResult.itemsDropped,
    trimmed: practiceResult.wasTrimmed,
  };

  // 5. Conversation history — single text, truncate directly
  const history = truncateToTokenBudget(input.conversationHistory || "", config.conversationHistory);
  const historyTokens = estimateTokens(history);
  buckets.conversationHistory = {
    tokens: historyTokens,
    itemsKept: history ? 1 : 0,
    itemsDropped: 0,
    trimmed: historyTokens < estimateTokens(input.conversationHistory || ""),
  };

  const totalInputTokens = userFactsTokens + ocrTokens + legResult.tokenCount
    + practiceResult.tokenCount + historyTokens;

  return {
    userFacts,
    ocrText,
    ragLegislation: legResult.trimmedText,
    ragPractice: practiceResult.trimmedText,
    conversationHistory: history,
    usage: {
      buckets,
      totalInputTokens,
      budgetProfile: profileName,
      timestamp: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Usage Logger
// ---------------------------------------------------------------------------

/**
 * Logs token usage report to console in a structured format.
 * Can be extended to write to a database table.
 */
export function logTokenUsage(
  functionName: string,
  userId: string,
  usage: TokenUsageReport
): void {
  const bucketSummary = Object.entries(usage.buckets)
    .map(([name, b]) => `${name}=${b.tokens}t/${b.itemsKept}k/${b.itemsDropped}d${b.trimmed ? "/T" : ""}`)
    .join(" | ");

  console.log(
    `[TOKEN-BUDGET] fn=${functionName} user=${userId.substring(0, 8)}... ` +
    `profile=${usage.budgetProfile} total=${usage.totalInputTokens}t | ${bucketSummary}`
  );
}
