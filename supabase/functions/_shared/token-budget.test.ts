// =============================================================================
// TOKEN BUDGET LIMITER — Unit Tests
// =============================================================================

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  estimateTokens,
  trimToBudget,
  truncateToTokenBudget,
  applyBudgets,
  logTokenUsage,
  BUDGET_PROFILES,
  type RankedContent,
  type TokenUsageReport,
} from "./token-budget.ts";

// =============================================
// estimateTokens
// =============================================

Deno.test("estimateTokens returns 0 for empty input", () => {
  assertEquals(estimateTokens(""), 0);
  assertEquals(estimateTokens(null as any), 0);
  assertEquals(estimateTokens(undefined as any), 0);
});

Deno.test("estimateTokens counts Latin text at ~4 chars/token", () => {
  // 20 chars => ~5 tokens
  const result = estimateTokens("Hello World Test1234");
  assertEquals(result, 5);
});

Deno.test("estimateTokens counts Armenian text at ~2 chars/token", () => {
  // 10 Armenian chars => ~5 tokens
  const armenian = "\u0540\u0561\u0575\u0561\u057D\u057F\u0561\u0576\u056B\u0576";
  const result = estimateTokens(armenian);
  assertEquals(result, 5);
});

Deno.test("estimateTokens handles mixed Latin + Armenian", () => {
  // "Article " = 8 Latin chars => 2 tokens
  // + 6 Armenian chars => 3 tokens = 5 total
  const mixed = "Article \u0540\u0578\u0564\u057E\u0561\u056E";
  const result = estimateTokens(mixed);
  assertEquals(result, 5);
});

Deno.test("estimateTokens counts Cyrillic at ~2 chars/token", () => {
  // 8 Cyrillic chars => 4 tokens
  const cyrillic = "\u041F\u0440\u0438\u043C\u0435\u0440\u044B\u0439";
  const result = estimateTokens(cyrillic);
  assertEquals(result, 4);
});

// =============================================
// truncateToTokenBudget
// =============================================

Deno.test("truncateToTokenBudget returns text unchanged if within budget", () => {
  const short = "Short text.";
  const result = truncateToTokenBudget(short, 100);
  assertEquals(result, short);
});

Deno.test("truncateToTokenBudget truncates long text", () => {
  // Create text that's ~100 tokens (400 Latin chars)
  const longText = "A".repeat(400) + " end.";
  const result = truncateToTokenBudget(longText, 50);
  // Should be shorter than original
  assertEquals(result.length < longText.length, true);
  // Should be roughly 100 chars (50 tokens * 2 chars/token safety)
  assertEquals(result.length <= 100, true);
});

Deno.test("truncateToTokenBudget handles empty input", () => {
  assertEquals(truncateToTokenBudget("", 100), "");
  assertEquals(truncateToTokenBudget(null as any, 100), "");
});

Deno.test("truncateToTokenBudget tries to cut at sentence boundary", () => {
  const text = "First sentence. Second sentence. Third sentence is really long and goes on and on and on.";
  const result = truncateToTokenBudget(text, 10); // ~40 chars budget
  // Should end at a period
  assertEquals(result.endsWith("."), true);
});

// =============================================
// trimToBudget
// =============================================

Deno.test("trimToBudget returns empty for empty input", () => {
  const result = trimToBudget([], 1000);
  assertEquals(result.trimmedText, "");
  assertEquals(result.itemsKept, 0);
  assertEquals(result.wasTrimmed, false);
});

Deno.test("trimToBudget keeps all items if within budget", () => {
  const items: RankedContent[] = [
    { text: "Item one.", score: 5 },
    { text: "Item two.", score: 3 },
  ];
  const result = trimToBudget(items, 1000);
  assertEquals(result.itemsKept, 2);
  assertEquals(result.itemsDropped, 0);
  assertEquals(result.wasTrimmed, false);
});

Deno.test("trimToBudget sorts by score and drops lowest first", () => {
  const items: RankedContent[] = [
    { text: "Low relevance " + "x".repeat(200), score: 1 },
    { text: "High relevance short.", score: 10 },
    { text: "Medium relevance " + "y".repeat(200), score: 5 },
  ];
  // Budget: enough for ~2 short items but not all 3
  const result = trimToBudget(items, 30);
  // Should keep high-relevance first
  assertEquals(result.trimmedText.includes("High relevance"), true);
  assertEquals(result.itemsDropped > 0, true);
  assertEquals(result.wasTrimmed, true);
});

Deno.test("trimToBudget returns 0 for negative budget", () => {
  const items: RankedContent[] = [{ text: "test", score: 1 }];
  const result = trimToBudget(items, -1);
  assertEquals(result.trimmedText, "");
  assertEquals(result.itemsKept, 0);
});

// =============================================
// applyBudgets
// =============================================

Deno.test("applyBudgets uses chat profile by default", () => {
  const result = applyBudgets({
    userFacts: "Simple facts.",
    ragLegislation: [{ text: "Article 42 of RA Constitution.", score: 8 }],
  });
  assertEquals(result.usage.budgetProfile, "chat");
  assertEquals(result.usage.totalInputTokens > 0, true);
  assertEquals(result.userFacts, "Simple facts.");
});

Deno.test("applyBudgets trims oversized user facts", () => {
  const hugeFacts = "Fact. ".repeat(5000); // ~30000 chars => ~7500 tokens
  const result = applyBudgets({ userFacts: hugeFacts }, "chat");
  // Chat profile allows 2000 tokens for userFacts
  assertEquals(result.usage.buckets.userFacts.trimmed, true);
  assertEquals(result.usage.buckets.userFacts.tokens <= 2000, true);
});

Deno.test("applyBudgets handles analyze profile with larger budgets", () => {
  const result = applyBudgets({
    userFacts: "Facts here.",
    ocrText: "OCR content.",
    ragLegislation: [
      { text: "Legislation chunk 1.", score: 9 },
      { text: "Legislation chunk 2.", score: 7 },
    ],
    ragPractice: [
      { text: "Practice chunk 1.", score: 8 },
    ],
  }, "analyze");
  assertEquals(result.usage.budgetProfile, "analyze");
  assertEquals(result.ragLegislation.includes("Legislation chunk"), true);
  assertEquals(result.ragPractice.includes("Practice chunk"), true);
});

Deno.test("applyBudgets drops lowest-relevance RAG items first", () => {
  // Create items that exceed the legislation budget (chat: 4000 tokens)
  // Each item: ~1000 tokens (4000 Latin chars), 20 items = ~20000 tokens >> 4000 budget
  const items: RankedContent[] = [];
  for (let i = 0; i < 20; i++) {
    items.push({
      text: `Legal article ${i}: ${"x".repeat(4000)}`,
      score: 20 - i,
    });
  }
  const result = applyBudgets({ ragLegislation: items }, "chat");
  // Should have dropped some items
  assertEquals(result.usage.buckets.ragLegislation.itemsDropped > 0, true);
  // Should keep the highest-scored items
  assertEquals(result.ragLegislation.includes("Legal article 0"), true);
});

Deno.test("applyBudgets handles empty input gracefully", () => {
  const result = applyBudgets({});
  assertEquals(result.usage.totalInputTokens, 0);
  assertEquals(result.userFacts, "");
  assertEquals(result.ragLegislation, "");
});

// =============================================
// BUDGET_PROFILES
// =============================================

Deno.test("BUDGET_PROFILES has all required profiles", () => {
  assertEquals("chat" in BUDGET_PROFILES, true);
  assertEquals("analyze" in BUDGET_PROFILES, true);
  assertEquals("document" in BUDGET_PROFILES, true);
});

Deno.test("BUDGET_PROFILES have positive values for all buckets", () => {
  for (const [name, profile] of Object.entries(BUDGET_PROFILES)) {
    assertEquals(profile.userFacts > 0, true, `${name}.userFacts should be > 0`);
    assertEquals(profile.ragLegislation > 0, true, `${name}.ragLegislation should be > 0`);
    assertEquals(profile.ragPractice > 0, true, `${name}.ragPractice should be > 0`);
    assertEquals(profile.systemPrompt > 0, true, `${name}.systemPrompt should be > 0`);
  }
});

// =============================================
// logTokenUsage (smoke test)
// =============================================

Deno.test("logTokenUsage does not throw", () => {
  const usage: TokenUsageReport = {
    buckets: {
      userFacts: { tokens: 100, itemsKept: 1, itemsDropped: 0, trimmed: false },
      ragLegislation: { tokens: 500, itemsKept: 3, itemsDropped: 2, trimmed: true },
    },
    totalInputTokens: 600,
    budgetProfile: "chat",
    timestamp: new Date().toISOString(),
  };
  // Should not throw
  logTokenUsage("test-fn", "user-123-456-789", usage);
});
