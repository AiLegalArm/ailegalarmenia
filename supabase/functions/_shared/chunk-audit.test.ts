/**
 * chunk-audit unit tests — pure deterministic checks
 * Updated for v2.2.0: strict slice equality, SHA-256 hashes, no table chunk exemption
 *
 * Tests prove:
 * 1. Law article chunks satisfy rawText.slice(char_start, char_end) === chunk_text
 * 2. Court decision with reasoning overlap satisfies strict invariant
 * 3. Registry table chunks satisfy strict invariant (raw slices, no markdown)
 * 4. computeMetrics detects all integrity violations
 */

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { computeMetrics } from "./chunk-audit.ts";
import {
  chunkDocument,
  validateChunks,
  sha256Hex,
  type LegalDocumentInput,
} from "./chunker.ts";

// ─── computeMetrics tests ──────────────────────────────────────────

Deno.test("computeMetrics: empty chunks returns zero metrics", () => {
  const m = computeMetrics("doc1", "knowledge_base", "Hello world content text here.", []);
  assertEquals(m.chunk_count, 0);
  assertEquals(m.coverage_ok, false);
  assertEquals(m.boundary_violations.length, 0);
});

Deno.test("computeMetrics: single chunk full coverage", () => {
  const text = "A".repeat(200);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: text, char_start: 0, char_end: 200, chunk_hash: "abc" },
  ]);
  assertEquals(m.chunk_count, 1);
  assertEquals(m.coverage_ratio, 1);
  assertEquals(m.coverage_ok, true);
  assertEquals(m.gap_violations.length, 0);
  assertEquals(m.overlap_violations.length, 0);
  assertEquals(m.index_continuity_ok, true);
});

Deno.test("computeMetrics: detects gap between chunks", () => {
  const text = "A".repeat(300);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "A".repeat(100), char_start: 0, char_end: 100, chunk_hash: "a1" },
    { chunk_index: 1, chunk_text: "A".repeat(100), char_start: 150, char_end: 250, chunk_hash: "a2" },
  ]);
  assertEquals(m.gap_violations.length, 1);
  assertEquals(m.gap_violations[0].gap_size, 50);
  assertEquals(m.coverage_ok, false);
});

Deno.test("computeMetrics: detects excessive overlap", () => {
  const text = "A".repeat(200);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "A".repeat(100), char_start: 0, char_end: 100, chunk_hash: "a1" },
    { chunk_index: 1, chunk_text: "A".repeat(100), char_start: 50, char_end: 150, chunk_hash: "a2" },
  ]);
  assertEquals(m.overlap_violations.length, 1);
  assertEquals(m.overlap_violations[0].overlap_ratio, 0.5);
});

Deno.test("computeMetrics: detects boundary violation (char_end > doc)", () => {
  const text = "A".repeat(100);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "A".repeat(100), char_start: 0, char_end: 200, chunk_hash: "a1" },
  ]);
  assertEquals(m.boundary_violations.length, 1);
});

Deno.test("computeMetrics: detects missing indices", () => {
  const text = "A".repeat(300);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "A".repeat(100), char_start: 0, char_end: 100, chunk_hash: "a1" },
    { chunk_index: 2, chunk_text: "A".repeat(100), char_start: 100, char_end: 200, chunk_hash: "a2" },
  ]);
  assertEquals(m.index_continuity_ok, false);
  assertEquals(m.missing_indices, [1]);
});

Deno.test("computeMetrics: detects duplicate hashes", () => {
  const text = "A".repeat(200);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "A".repeat(100), char_start: 0, char_end: 100, chunk_hash: "same" },
    { chunk_index: 1, chunk_text: "A".repeat(100), char_start: 100, char_end: 200, chunk_hash: "same" },
  ]);
  assertEquals(m.duplicate_hashes.length, 1);
  assertEquals(m.duplicate_hashes[0], "same");
});

Deno.test("computeMetrics: detects empty chunks", () => {
  const text = "A".repeat(200);
  const m = computeMetrics("doc1", "knowledge_base", text, [
    { chunk_index: 0, chunk_text: "", char_start: 0, char_end: 100, chunk_hash: "a1" },
    { chunk_index: 1, chunk_text: "A".repeat(100), char_start: 100, char_end: 200, chunk_hash: "a2" },
  ]);
  assertEquals(m.empty_chunks.length, 1);
  assertEquals(m.empty_chunks[0], 0);
});

// ─── STRICT SLICE INVARIANT TESTS ──────────────────────────────────

Deno.test("STRICT INVARIANT: law article chunks satisfy rawText.slice(char_start, char_end) === chunk_text", async () => {
  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u054f\u0565\u057d\u057f \u0570\u0578\u0564\u057e\u0561\u056e\u056b \u057f\u0565\u0584\u057d\u057f",
    "",
    "1) \u0531\u057c\u0561\u057b\u056b\u0576 \u056f\u0565\u057f \u0569\u0565\u057d\u057f",
    "2) \u0535\u0580\u056f\u0580\u0578\u0580\u0564 \u056f\u0565\u057f \u0569\u0565\u057d\u057f",
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0535\u0580\u056f\u0580\u0578\u0580\u0564 \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    "\u054d\u0561 \u0569\u0565\u057d\u057f \u0570\u0578\u0564\u057e\u0561\u056e\u056b \u057f\u0565\u0584\u057d\u057f \u0567",
  ].join("\n");

  const input: LegalDocumentInput = {
    doc_type: "law",
    content_text: rawText,
    title: "Test Law",
  };

  const result = await chunkDocument(input);
  const qa = validateChunks(rawText, result.chunks);

  assertEquals(qa.ok, true, `QA errors: ${qa.errors.join("; ")}`);

  for (const chunk of result.chunks) {
    const slice = rawText.slice(chunk.char_start, chunk.char_end);
    assertEquals(
      slice, chunk.chunk_text,
      `Law chunk ${chunk.chunk_index}: slice !== chunk_text`
    );
  }
});

Deno.test("STRICT INVARIANT: court decision with reasoning overlap satisfies strict slice equality", async () => {
  const rawText = [
    "\u0555\u054c\u0548\u0547\u0548\u0552\u0544",
    "",
    "Header text of the court decision with case details and participants.",
    "",
    "\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576 \u0574\u0561\u057d",
    "",
    "A".repeat(500) + " facts section content with details about the case and evidence.",
    "",
    "\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d",
    "",
    "B".repeat(500) + " reasoning section with legal analysis and interpretation.",
    "",
    "\u057e\u0573\u056b\u057c\u0565\u0581",
    "",
    "Resolution: the court decides the following outcome of the case.",
  ].join("\n");

  const input: LegalDocumentInput = {
    doc_type: "court_decision",
    content_text: rawText,
    title: "Test Court Decision",
  };

  const result = await chunkDocument(input);
  const qa = validateChunks(rawText, result.chunks);

  assertEquals(qa.ok, true, `QA errors: ${qa.errors.join("; ")}`);

  for (const chunk of result.chunks) {
    const slice = rawText.slice(chunk.char_start, chunk.char_end);
    assertEquals(
      slice, chunk.chunk_text,
      `Court chunk ${chunk.chunk_index} (${chunk.chunk_type}): slice !== chunk_text`
    );
  }
});

Deno.test("STRICT INVARIANT: registry table chunks are raw slices (no markdown)", async () => {
  const lines = [
    "Registry of Companies",
    "",
  ];
  for (let i = 1; i <= 10; i++) {
    lines.push(`${i}. Company${i} | Address${i} | Type${i}`);
  }
  const rawText = lines.join("\n");

  const input: LegalDocumentInput = {
    doc_type: "other",
    content_text: rawText,
    title: "Test Registry",
  };

  const result = await chunkDocument(input);
  const qa = validateChunks(rawText, result.chunks);

  assertEquals(qa.ok, true, `QA errors: ${qa.errors.join("; ")}`);

  for (const chunk of result.chunks) {
    const slice = rawText.slice(chunk.char_start, chunk.char_end);
    assertEquals(
      slice, chunk.chunk_text,
      `Registry chunk ${chunk.chunk_index}: slice !== chunk_text`
    );
  }
});

Deno.test("sha256Hex: produces real 64-char SHA-256 hex", async () => {
  const h1 = await sha256Hex("hello world");
  const h2 = await sha256Hex("hello world");
  const h3 = await sha256Hex("hello world!");

  assertEquals(h1, h2, "Same input must produce same hash");
  assertEquals(h1.length, 64, "Hash must be 64 hex chars (256-bit SHA-256)");
  assertEquals(h1 !== h3, true, "Different input must produce different hash");
  // Known SHA-256 of "hello world"
  assertEquals(h1, "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
});

Deno.test("validateChunks: NO table chunk exemption — synthetic chunks fail", async () => {
  const rawText = "Hello world this is a test document with some content.";
  const fakeChunks = [{
    chunk_index: 0,
    chunk_type: "full_text" as const,
    chunk_text: "SYNTHETIC CONTENT NOT IN RAW TEXT",
    char_start: 0,
    char_end: 32,
    label: null,
    locator: null,
    chunk_hash: await sha256Hex("SYNTHETIC CONTENT NOT IN RAW TEXT"),
    metadata: null,
  }];

  const qa = validateChunks(rawText, fakeChunks);
  assertEquals(qa.ok, false, "Synthetic chunks must fail strict validation");
  assertEquals(qa.errors.length > 0, true, "Must report slice mismatch error");
});
