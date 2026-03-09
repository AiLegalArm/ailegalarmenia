/**
 * Tests for _shared/ingestion-service.ts
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  parseInput,
  normalizeText,
  chunkDoc,
  buildJsonl,
  validateJsonl,
  ingestText,
} from "./ingestion-service.ts";

// ─── parseInput ─────────────────────────────────────────────────────

Deno.test("parseInput: detects raw text", () => {
  const result = parseInput("Hello world\nSecond line");
  assertEquals(result.sourceType, "raw_text");
  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].rawText, "Hello world\nSecond line");
});

Deno.test("parseInput: detects HTML", () => {
  const result = parseInput("<html><body><p>Test</p></body></html>", {
    mimeType: "text/html",
  });
  assertEquals(result.sourceType, "html");
  assertEquals(result.items.length, 1);
});

Deno.test("parseInput: detects JSON array", () => {
  const input = JSON.stringify([
    { title: "Doc1", content_text: "Text one" },
    { title: "Doc2", content_text: "Text two" },
  ]);
  const result = parseInput(input);
  assertEquals(result.sourceType, "json");
  assertEquals(result.items.length, 2);
  assertEquals(result.items[0].rawText, "Text one");
  assertEquals(result.items[1].rawText, "Text two");
});

Deno.test("parseInput: detects JSONL", () => {
  const input = '{"title":"A","content_text":"AAA"}\n{"title":"B","content_text":"BBB"}';
  const result = parseInput(input);
  assertEquals(result.sourceType, "jsonl");
  assertEquals(result.items.length, 2);
});

Deno.test("parseInput: JSON array with missing text warns", () => {
  const input = JSON.stringify([{ title: "No text" }]);
  const result = parseInput(input);
  assertEquals(result.sourceType, "json");
  assertEquals(result.warnings.length, 1);
});

// ─── normalizeText ──────────────────────────────────────────────────

Deno.test("normalizeText: produces LegalDocument with hash", async () => {
  const { document, validationErrors } = await normalizeText(
    "This is a test legal document with enough content to pass validation.\n".repeat(10),
    { fileName: "test.txt" }
  );
  assertExists(document);
  assertEquals(document.jurisdiction, "AM");
  assertExists(document.ingestion.source_hash);
  assertEquals(document.ingestion.schema_version, "1.0");
  // 'other' doc_type for generic text
  assertEquals(document.doc_type, "other");
});

Deno.test("normalizeText: applies forceDocType override", async () => {
  const { document } = await normalizeText("Test content.\n".repeat(5), {
    fileName: "test.txt",
    forceDocType: "law",
  });
  assertEquals(document.doc_type, "law");
});

// ─── chunkDoc ───────────────────────────────────────────────────────

Deno.test("chunkDoc: returns chunks for text", async () => {
  const chunks = await chunkDoc({
    doc_type: "other",
    content_text: "A test paragraph.\n\nAnother paragraph.\n",
    title: "Test",
  });
  assertExists(chunks);
  assertEquals(chunks.length >= 1, true);
});

Deno.test("chunkDoc: mode override works", async () => {
  const text = "\u0540\u0578\u0564\u057e\u0561\u056e 1. Test article\nContent here.\n\n\u0540\u0578\u0564\u057e\u0561\u056e 2. Second\nMore content.";
  const chunks = await chunkDoc(
    { doc_type: "other", content_text: text },
    { mode: "legislation" }
  );
  // Should detect articles since mode forced to legislation
  const articleChunks = chunks.filter(c => c.chunk_type === "article");
  assertEquals(articleChunks.length >= 1, true);
});

// ─── buildJsonl ─────────────────────────────────────────────────────

Deno.test("buildJsonl: serializes chunks to JSONL", async () => {
  const chunks = await chunkDoc({
    doc_type: "other",
    content_text: "Test content for JSONL building.",
    title: "Test",
  });
  const jsonl = buildJsonl(chunks, {
    doc_id: "test-id",
    doc_type: "other",
    source_name: "test",
  });
  assertEquals(jsonl.length, chunks.length);
  for (const line of jsonl) {
    assertExists(line.json);
    const parsed = JSON.parse(line.json);
    assertEquals(parsed.metadata.doc_id, "test-id");
    assertExists(parsed.chunk.text);
  }
});

// ─── validateJsonl ──────────────────────────────────────────────────

Deno.test("validateJsonl: valid lines pass", () => {
  const lines = [
    '{"chunk_text":"Hello world","chunk_type":"article"}',
    '{"chunk_text":"Another chunk","chunk_type":"facts"}',
  ];
  const result = validateJsonl(lines);
  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
  assertEquals(result.records.length, 2);
});

Deno.test("validateJsonl: invalid JSON fails", () => {
  const lines = ['not json', '{"chunk_text":"ok"}'];
  const result = validateJsonl(lines);
  assertEquals(result.valid, false);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].line, 1);
});

Deno.test("validateJsonl: missing required field fails", () => {
  const lines = ['{"title":"no chunk_text"}'];
  const result = validateJsonl(lines);
  assertEquals(result.valid, false);
  assertEquals(result.errors[0].message.includes("chunk_text"), true);
});

Deno.test("validateJsonl: invalid chunk_type fails", () => {
  const lines = ['{"chunk_text":"ok","chunk_type":"invalid_type"}'];
  const result = validateJsonl(lines);
  assertEquals(result.valid, false);
});

Deno.test("validateJsonl: blank lines skipped", () => {
  const lines = ['{"chunk_text":"ok"}', "", '{"chunk_text":"also ok"}'];
  const result = validateJsonl(lines);
  assertEquals(result.valid, true);
  assertEquals(result.records.length, 2);
});

// ─── ingestText (full pipeline) ─────────────────────────────────────

Deno.test("ingestText: end-to-end produces document + chunks + jsonl", async () => {
  const raw = "Test legal content for full pipeline.\n".repeat(5);
  const result = await ingestText(raw, {
    fileName: "test.txt",
    category: "other",
  });
  assertExists(result.document);
  assertExists(result.chunks);
  assertExists(result.jsonl);
  assertEquals(result.chunks.length, result.jsonl.length);
  assertEquals(result.document.is_active, true);
});
