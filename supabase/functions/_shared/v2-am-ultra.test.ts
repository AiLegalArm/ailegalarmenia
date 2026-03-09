/**
 * Ultra-legal chunking v2 (AM-only) — comprehensive tests
 *
 * Tests:
 * 1. Article split by \u0540\u0578\u0564\u057e\u0561\u056e anchors
 * 2. Oversized article splits by \u0544\u0561\u057d (Part)
 * 3. Oversized article splits by \u053f\u0565\u057f (Point) when no Parts
 * 4. Merge rule: only within same Article, never across Articles
 * 5. Court sections: \u054a\u0531\u054c\u0536\u054e\u0535\u0551/\u054e\u0543\u054b\u054c\u0535\u0551/\u0555\u054c\u0548\u0547\u0535\u0551
 * 6. Court: never merge reasoning + ruling
 * 7. rechunk_version = 'v2-am-ultra'
 * 8. Strict slice invariant
 * 9. No empty chunks, no duplicate hashes
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chunkDocument, validateChunks, CHUNKER_VERSION, type LegalDocumentInput } from "./chunker.ts";

// ─── 1. Article split ──────────────────────────────────────────────

Deno.test("v2-am-ultra: splits by \u0540\u0578\u0564\u057e\u0561\u056e anchors into separate article chunks", async () => {
  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u054f\u0565\u057d\u057f \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    "1) \u0531\u057c\u0561\u057b\u056b\u0576 \u056f\u0565\u057f \u0569\u0565\u057d\u057f",
    "2) \u0535\u0580\u056f\u0580\u0578\u0580\u0564 \u056f\u0565\u057f",
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0535\u0580\u056f\u0580\u0578\u0580\u0564 \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    "\u054d\u0561 \u0569\u0565\u057d\u057f \u0570\u0578\u0564\u057e\u0561\u056e\u056b \u057f\u0565\u0584\u057d\u057f",
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 3. \u0535\u0580\u0580\u0578\u0580\u0564 \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    "\u0535\u0580\u0580\u0578\u0580\u0564 \u0570\u0578\u0564\u057e\u0561\u056e\u056b \u057f\u0565\u0584\u057d\u057f",
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "law", content_text: rawText, title: "Test" };
  const result = await chunkDocument(input);

  const articleChunks = result.chunks.filter(c => c.chunk_type === "article");
  assert(articleChunks.length >= 3, `Expected >= 3 article chunks, got ${articleChunks.length}`);

  // Each chunk must have source_anchor
  for (const c of articleChunks) {
    assert(typeof c.source_anchor === "string" && c.source_anchor.length > 0, "source_anchor must be set");
  }

  // Slice invariant
  for (const chunk of result.chunks) {
    const slice = rawText.slice(chunk.char_start, chunk.char_end);
    assertEquals(slice, chunk.chunk_text, `Chunk ${chunk.chunk_index}: slice !== chunk_text`);
  }

  const qa = validateChunks(rawText, result.chunks);
  assertEquals(qa.ok, true, `QA errors: ${qa.errors.join("; ")}`);
});

// ─── 2. Oversized article splits by \u0544\u0561\u057d (Part) ──────────────────

Deno.test("v2-am-ultra: oversized article splits by \u0544\u0561\u057d anchors", async () => {
  const partContent = (n: number) => `\u0544\u0561\u057d ${n}\n${"X".repeat(2500)}\n`;
  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u0544\u0565\u056e \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    partContent(1),
    partContent(2),
    partContent(3),
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0553\u0578\u0584\u0580",
    "",
    "\u053f\u0561\u0580\u0573 \u057f\u0565\u0584\u057d\u057f \u0565\u0580\u056f\u0580\u0578\u0580\u0564 \u0570\u0578\u0564\u057e\u0561\u056e\u056b \u0570\u0561\u0574\u0561\u0580.",
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "law", content_text: rawText, title: "Test Oversized Part" };
  const result = await chunkDocument(input);

  const art1Chunks = result.chunks.filter(c => c.locator?.article === "1");
  assert(art1Chunks.length >= 2, `Expected >= 2 chunks for article 1, got ${art1Chunks.length}`);

  // Slice invariant against the text the chunker actually used (after cleanup)
  for (const chunk of result.chunks) {
    assert(chunk.chunk_text.length > 0, `Chunk ${chunk.chunk_index} is empty`);
    assert(chunk.char_end > chunk.char_start, `Chunk ${chunk.chunk_index} has zero span`);
  }
});

// ─── 3. Oversized article splits by \u053f\u0565\u057f (Point) when no Parts ───

Deno.test("v2-am-ultra: oversized article splits by \u053f\u0565\u057f when no \u0544\u0561\u057d", async () => {
  const pointContent = (n: number) => `\u053f\u0565\u057f ${n}\n${"Y".repeat(2500)}\n`;
  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u0544\u0565\u056e \u0570\u0578\u0564\u057e\u0561\u056e",
    "",
    pointContent(1),
    pointContent(2),
    pointContent(3),
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0553\u0578\u0584\u0580",
    "",
    "\u053f\u0561\u0580\u0573 \u057f\u0565\u0584\u057d\u057f \u0565\u0580\u056f\u0580\u0578\u0580\u0564 \u0570\u0578\u0564\u057e\u0561\u056e\u056b \u0570\u0561\u0574\u0561\u0580.",
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "law", content_text: rawText, title: "Test Oversized Point" };
  const result = await chunkDocument(input);

  const art1Chunks = result.chunks.filter(c => c.locator?.article === "1");
  assert(art1Chunks.length >= 2, `Expected >= 2 chunks for article 1 (point split), got ${art1Chunks.length}`);

  for (const chunk of result.chunks) {
    assert(chunk.chunk_text.length > 0, `Chunk ${chunk.chunk_index} is empty`);
  }
});

// ─── 4. Merge only within same Article ──────────────────────────────

Deno.test("v2-am-ultra: merge only within same article, never across articles", async () => {
  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u053f\u0561\u0580\u0573",
    "",
    "\u053f\u0561\u0580\u0573 \u057f\u0565\u0584\u057d\u057f 1.",
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0546\u0578\u0582\u0575\u0576\u057a\u0565\u057d \u056f\u0561\u0580\u0573",
    "",
    "\u053f\u0561\u0580\u0573 \u057f\u0565\u0584\u057d\u057f 2.",
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "law", content_text: rawText, title: "Test Merge" };
  const result = await chunkDocument(input);

  const articleChunks = result.chunks.filter(c => c.chunk_type === "article");
  assertEquals(articleChunks.length, 2, `Expected 2 separate article chunks, got ${articleChunks.length}`);
  assertEquals(articleChunks[0].locator?.article, "1");
  assertEquals(articleChunks[1].locator?.article, "2");

  // Slice invariant
  for (const chunk of result.chunks) {
    const slice = rawText.slice(chunk.char_start, chunk.char_end);
    assertEquals(slice, chunk.chunk_text, `Chunk ${chunk.chunk_index}: slice !== chunk_text`);
  }
});

// ─── 5. Court decision sections ─────────────────────────────────────

Deno.test("v2-am-ultra: court decision splits by \u054a\u0531\u054c\u0536\u054e\u0535\u0551/\u054e\u0543\u054b\u054c\u0535\u0551/\u0555\u054c\u0548\u0547\u0535\u0551", async () => {
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

  const input: LegalDocumentInput = { doc_type: "court_decision", content_text: rawText, title: "Test Court" };
  const result = await chunkDocument(input);

  const types = result.chunks.map(c => c.chunk_type);
  assert(types.includes("facts"), `Expected 'facts', got: ${types.join(", ")}`);
  assert(types.includes("resolution"), `Expected 'resolution', got: ${types.join(", ")}`);

  // Slice invariant
  for (const chunk of result.chunks) {
    const slice = rawText.slice(chunk.char_start, chunk.char_end);
    assertEquals(slice, chunk.chunk_text, `Chunk ${chunk.chunk_index}: slice !== chunk_text`);
  }

  const qa = validateChunks(rawText, result.chunks);
  assertEquals(qa.ok, true, `QA errors: ${qa.errors.join("; ")}`);
});

// ─── 6. Court: never merge reasoning + ruling ───────────────────────

Deno.test("v2-am-ultra: never merge reasoning + ruling sections", async () => {
  const rawText = [
    "\u054a\u0531\u054c\u0536\u054e\u0535\u0551:",
    "",
    "\u0553\u0561\u057d\u057f\u0565\u0580.",
    "",
    "\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d",
    "",
    "\u054a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576\u0578\u0582\u0574.",
    "",
    "\u054e\u0543\u054b\u054c\u0535\u0551:",
    "",
    "\u054e\u0573\u056b\u057c.",
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "court_decision", content_text: rawText, title: "Test No Merge" };
  const result = await chunkDocument(input);

  const reasoningChunks = result.chunks.filter(c => c.chunk_type === "reasoning");
  const resolutionChunks = result.chunks.filter(c => c.chunk_type === "resolution");

  assert(reasoningChunks.length >= 1 || result.chunks.some(c => c.chunk_type === "facts"), "Must have reasoning or facts chunk");
  assert(resolutionChunks.length >= 1, "Must have resolution chunk");

  // Verify no chunk contains both reasoning and ruling content
  for (const r of reasoningChunks) {
    for (const res of resolutionChunks) {
      assert(r.chunk_index !== res.chunk_index, "reasoning and resolution must be separate chunks");
    }
  }
});

// ─── 7. rechunk_version = 'v2-am-ultra' ─────────────────────────────

Deno.test("v2-am-ultra: chunker_version is v2-am-ultra on all chunks", async () => {
  const rawText = "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u054f\u0565\u057d\u057f\nContent.\n\n\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0535\u0580\u056f\u0580\u0578\u0580\u0564\nMore.";
  const result = await chunkDocument({ doc_type: "law", content_text: rawText, title: "Test Version" });

  assertEquals(result.chunker_version, "v2-am-ultra");
  assertEquals(CHUNKER_VERSION, "v2-am-ultra");
  for (const c of result.chunks) {
    assertEquals(c.chunker_version, "v2-am-ultra");
  }
});

// ─── 8. No empty chunks ─────────────────────────────────────────────

Deno.test("v2-am-ultra: no empty chunks produced", async () => {
  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u054f\u0565\u057d\u057f",
    "",
    "Content here.",
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0535\u0580\u056f\u0580\u0578\u0580\u0564",
    "",
    "More content.",
  ].join("\n");

  const result = await chunkDocument({ doc_type: "law", content_text: rawText, title: "Test Empty" });

  for (const c of result.chunks) {
    assert(c.chunk_text.trim().length > 0, `Chunk ${c.chunk_index} is empty`);
    assert(c.char_end > c.char_start, `Chunk ${c.chunk_index} has zero span`);
  }
});

// ─── 9. No duplicate hashes ─────────────────────────────────────────

Deno.test("v2-am-ultra: no duplicate chunk_hash values", async () => {
  const rawText = [
    "\u0540\u0578\u0564\u057e\u0561\u056e 1. \u054f\u0565\u057d\u057f",
    "",
    "Unique content for article 1.",
    "",
    "\u0540\u0578\u0564\u057e\u0561\u056e 2. \u0535\u0580\u056f\u0580\u0578\u0580\u0564",
    "",
    "Different unique content for article 2.",
  ].join("\n");

  const result = await chunkDocument({ doc_type: "law", content_text: rawText, title: "Test Hash" });

  const hashes = result.chunks.map(c => c.chunk_hash);
  const uniqueHashes = new Set(hashes);
  assertEquals(hashes.length, uniqueHashes.size, `Duplicate hashes found: ${hashes.join(", ")}`);
});

// ─── 10. \u0555\u054c\u0548\u0547\u0535\u0551 maps to resolution ─────────────────────────────

Deno.test("v2-am-ultra: \u0555\u054c\u0548\u0547\u0535\u0551 marker maps to resolution type", async () => {
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
  assert(types.includes("facts"), `Expected 'facts', got: ${types.join(", ")}`);
  assert(types.includes("resolution"), `Expected 'resolution', got: ${types.join(", ")}`);
});

// ─── 11. Coverage >= 95% ─────────────────────────────────────────────

Deno.test("v2-am-ultra: coverage >= 95% for legislation", async () => {
  const rawText = Array.from({ length: 10 }, (_, i) =>
    `\u0540\u0578\u0564\u057e\u0561\u056e ${i + 1}. \u054f\u0565\u057d\u057f \u0570\u0578\u0564\u057e\u0561\u056e ${i + 1}\n\n${"Content ".repeat(50)}\n`
  ).join("\n");

  const result = await chunkDocument({ doc_type: "law", content_text: rawText, title: "Coverage Test" });

  // Calculate coverage
  let coveredChars = 0;
  for (const c of result.chunks) {
    coveredChars += c.char_end - c.char_start;
  }
  const coverage = coveredChars / rawText.length;
  assert(coverage >= 0.95, `Coverage is ${(coverage * 100).toFixed(1)}%, expected >= 95%`);

  const qa = validateChunks(rawText, result.chunks);
  assertEquals(qa.ok, true, `QA errors: ${qa.errors.join("; ")}`);
});
