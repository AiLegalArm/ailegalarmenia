/**
 * Phase 2b court decision chunker tests — v2-am-ultra (Armenian-only)
 *
 * Tests:
 * 1. AM decision with \u054a\u0531\u054c\u0536\u054e\u0535\u0551/\u054e\u0543\u054b\u054c\u0535\u0551/\u0555\u054c\u0548\u0547\u0535\u0551 markers
 * 2. Merge does NOT combine reasoning + ruling
 * 3. source_anchor set correctly
 * 4. Strict slice invariant
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { chunkDocument, validateChunks, type LegalDocumentInput } from "./chunker.ts";

Deno.test("Phase2b: AM decision \u054a\u0531\u054c\u0536\u054e\u0535\u0551/\u054e\u0543\u054b\u054c\u0535\u0551 -> facts + resolution", async () => {
  const rawText = [
    "\u0555\u054c\u0548\u0547\u0548\u0552\u0544",
    "",
    "Header of the court decision.",
    "",
    "\u054a\u0531\u054c\u0536\u054e\u0535\u0551:",
    "",
    "Facts of the case described here in detail.",
    "",
    "\u054e\u0543\u054b\u054c\u0535\u0551:",
    "",
    "The court ruled in favor of the plaintiff.",
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "court_decision", content_text: rawText, title: "Test AM Decision" };
  const result = await chunkDocument(input);

  const types = result.chunks.map(c => c.chunk_type);
  assertEquals(types.includes("facts"), true, `Expected 'facts', got: ${types.join(", ")}`);
  assertEquals(types.includes("resolution"), true, `Expected 'resolution', got: ${types.join(", ")}`);

  const factsChunk = result.chunks.find(c => c.chunk_type === "facts");
  assertEquals(typeof factsChunk?.source_anchor, "string");
  assertEquals(factsChunk!.source_anchor!.length > 0, true);

  for (const chunk of result.chunks) {
    const slice = rawText.slice(chunk.char_start, chunk.char_end);
    assertEquals(slice, chunk.chunk_text, `Chunk ${chunk.chunk_index} (${chunk.chunk_type}): slice !== chunk_text`);
  }

  const qa = validateChunks(rawText, result.chunks);
  assertEquals(qa.ok, true, `QA errors: ${qa.errors.join("; ")}`);
});

Deno.test("Phase2b: merge does NOT combine reasoning + ruling (AM)", async () => {
  const rawText = [
    "\u054a\u0531\u054c\u0536\u054e\u0535\u0551:",
    "",
    "\u0553\u0561\u057d\u057f\u0565\u0580. " + "A".repeat(1500),
    "",
    "\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d",
    "",
    "\u054a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576\u0578\u0582\u0574. " + "B".repeat(1500),
    "",
    "\u054e\u0543\u054b\u054c\u0535\u0551:",
    "",
    "\u054e\u0573\u056b\u057c. " + "C".repeat(1500),
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "court_decision", content_text: rawText, title: "Test No Merge AM" };
  const result = await chunkDocument(input);

  const reasoningChunks = result.chunks.filter(c => c.chunk_type === "reasoning");
  const factsChunks = result.chunks.filter(c => c.chunk_type === "facts");
  const resolutionChunks = result.chunks.filter(c => c.chunk_type === "resolution");

  assertEquals(reasoningChunks.length >= 1 || factsChunks.length >= 1, true, "Must have reasoning or facts chunk");
  assertEquals(resolutionChunks.length >= 1, true, "Must have resolution chunk");

  for (const r of reasoningChunks) {
    for (const res of resolutionChunks) {
      assertEquals(r.chunk_index !== res.chunk_index, true, "reasoning and resolution must be separate chunks");
    }
  }
});

Deno.test("Phase2b: \u0555\u054c\u0548\u0547\u0535\u0551 marker maps to resolution", async () => {
  const rawText = [
    "\u054a\u0531\u054c\u0536\u054e\u0535\u0551:",
    "",
    "\u0553\u0561\u057d\u057f\u0565\u0580 \u0563\u0578\u0580\u056e\u056b. " + "A".repeat(1500),
    "",
    "\u0555\u054c\u0548\u0547\u0535\u0551:",
    "",
    "\u054e\u0573\u056b\u057c\u0568 \u0562\u0565\u056f\u0561\u0576\u0565\u056c. " + "B".repeat(1500),
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "court_decision", content_text: rawText, title: "Test OROSEC" };
  const result = await chunkDocument(input);

  const types = result.chunks.map(c => c.chunk_type);
  assertEquals(types.includes("facts"), true, `Expected 'facts', got: ${types.join(", ")}`);
  assertEquals(types.includes("resolution"), true, `Expected 'resolution', got: ${types.join(", ")}`);

  const rulingChunk = result.chunks.find(c => c.chunk_type === "resolution");
  // source_anchor should contain the marker (possibly with prefix)
  assertEquals(rulingChunk?.source_anchor?.includes("\u0555\u054c\u0548\u0547\u0535\u0551") || rulingChunk?.source_anchor?.includes("resolution"), true,
    `Ruling source_anchor should reference ruling marker, got: ${rulingChunk?.source_anchor}`);
});

Deno.test("Phase2b: source_anchor contains AM marker labels", async () => {
  const rawText = [
    "Header text",
    "",
    "\u054a\u0531\u054c\u0536\u054e\u0535\u0551:",
    "",
    "Facts content. " + "A".repeat(1500),
    "",
    "\u054e\u0543\u054b\u054c\u0535\u0551:",
    "",
    "Ruling content. " + "B".repeat(1500),
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "court_decision", content_text: rawText, title: "Test Anchors" };
  const result = await chunkDocument(input);

  const factsChunk = result.chunks.find(c => c.chunk_type === "facts");
  const rulingChunk = result.chunks.find(c => c.chunk_type === "resolution");

  // source_anchor should contain the AM marker labels (possibly with prefix)
  assertEquals(factsChunk?.source_anchor?.includes("\u054a\u0531\u054c\u0536\u054e\u0535\u0551") || factsChunk?.source_anchor?.includes("facts"), true,
    `Facts source_anchor should reference facts marker, got: ${factsChunk?.source_anchor}`);
  assertEquals(rulingChunk?.source_anchor?.includes("\u054e\u0543\u054b\u054c\u0535\u0551") || rulingChunk?.source_anchor?.includes("resolution"), true,
    `Ruling source_anchor should reference ruling marker, got: ${rulingChunk?.source_anchor}`);
});
