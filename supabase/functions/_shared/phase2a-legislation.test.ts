/**
 * Phase 2a legislation chunker tests — v2-am-ultra (Armenian-only)
 *
 * Tests:
 * 1. AM law with "\u0540\u0578\u0564\u057e\u0561\u056e 1 ... \u0540\u0578\u0564\u057e\u0561\u056e 2" \u2192 2+ chunks
 * 2. Oversized article > MAX \u2192 splits by secondary anchors / paragraphs
 * 3. MIN merge does not merge across different articles
 * 4. Strict slice invariant maintained
 * 5. overlap_prev is set on split chunks
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { chunkDocument, validateChunks, type LegalDocumentInput } from "./chunker.ts";

Deno.test("Phase2a: AM law '\u0540\u0578\u0564\u057e\u0561\u056e 1 ... \u0540\u0578\u0564\u057e\u0561\u056e 2' produces 2+ chunks with source_anchor", async () => {
  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u054f\u0565\u057d\u057f \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    "1) \u0531\u057c\u0561\u057b\u056b\u0576 \u056f\u0565\u057f \u0569\u0565\u057d\u057f",
    "2) \u0535\u0580\u056f\u0580\u0578\u0580\u0564 \u056f\u0565\u057f",
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0535\u0580\u056f\u0580\u0578\u0580\u0564 \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    "\u054d\u0561 \u0569\u0565\u057d\u057f \u0570\u0578\u0564\u057e\u0561\u056e\u056b \u057f\u0565\u0584\u057d\u057f",
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "law", content_text: rawText, title: "Test AM Law" };
  const result = await chunkDocument(input);

  const articleChunks = result.chunks.filter(c => c.chunk_type === "article");
  assertEquals(articleChunks.length >= 2, true, `Expected >= 2 article chunks, got ${articleChunks.length}`);

  for (const c of articleChunks) {
    assertEquals(typeof c.source_anchor, "string");
    assertEquals(c.source_anchor!.length > 0, true, "source_anchor must not be empty");
  }

  assertEquals(articleChunks[0].source_anchor!.includes("1"), true);

  const qa = validateChunks(rawText, result.chunks);
  assertEquals(qa.ok, true, `QA errors: ${qa.errors.join("; ")}`);
});

Deno.test("Phase2a: oversized article > MAX_CHUNK_CHARS splits into multiple chunks", async () => {
  const bigContent = "A".repeat(3000) + "\n\n" + "B".repeat(3000) + "\n\n" + "C".repeat(3000);
  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u0544\u0565\u056e \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    bigContent,
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0553\u0578\u0584\u0580 \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    "\u053f\u0561\u0580\u0573 \u057f\u0565\u0584\u057d\u057f.",
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "law", content_text: rawText, title: "Test Oversized" };
  const result = await chunkDocument(input);

  const art1Chunks = result.chunks.filter(c => c.locator?.article === "1");
  assertEquals(art1Chunks.length >= 2, true, `Expected >= 2 chunks for article 1, got ${art1Chunks.length}`);

  for (const c of art1Chunks) {
    assertEquals(typeof c.source_anchor, "string");
  }

  const qa = validateChunks(rawText, result.chunks);
  assertEquals(qa.ok, true, `QA errors: ${qa.errors.join("; ")}`);
});

Deno.test("Phase2a: MIN merge does NOT merge chunks from different articles", async () => {
  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u053f\u0561\u0580\u0573",
    "",
    "\u053f\u0561\u0580\u0573 \u057f\u0565\u0584\u057d\u057f 1.",
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0546\u0578\u0582\u0575\u0576\u057a\u0565\u057d \u056f\u0561\u0580\u0573",
    "",
    "\u053f\u0561\u0580\u0573 \u057f\u0565\u0584\u057d\u057f 2.",
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "law", content_text: rawText, title: "Test MIN merge" };
  const result = await chunkDocument(input);

  const articleChunks = result.chunks.filter(c => c.chunk_type === "article");
  assertEquals(articleChunks.length, 2, `Expected 2 separate article chunks, got ${articleChunks.length}`);

  assertEquals(articleChunks[0].locator?.article, "1");
  assertEquals(articleChunks[1].locator?.article, "2");

  for (const chunk of result.chunks) {
    const slice = rawText.slice(chunk.char_start, chunk.char_end);
    assertEquals(slice, chunk.chunk_text, `Chunk ${chunk.chunk_index}: slice !== chunk_text`);
  }
});

Deno.test("Phase2a: overlap_prev is set on split chunks", async () => {
  const bigContent = Array.from({ length: 20 }, (_, i) =>
    `\u053f\u0565\u057f ${i + 1}. ` + "X".repeat(500)
  ).join("\n\n");

  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u0544\u0565\u056e \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    bigContent,
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "law", content_text: rawText, title: "Test Overlap" };
  const result = await chunkDocument(input);

  const art1Chunks = result.chunks.filter(c => c.locator?.article === "1");
  assertEquals(art1Chunks.length >= 2, true, "Should split into multiple chunks");

  const withOverlap = art1Chunks.filter(c => (c.overlap_prev || 0) > 0);
  assertEquals(withOverlap.length >= 1, true, "At least one chunk should have overlap_prev > 0");
});
