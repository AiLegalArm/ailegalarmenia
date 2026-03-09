/**
 * Tests for extractCourtMeta
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { extractCourtMeta, chunkDocument, type LegalDocumentInput } from "./chunker.ts";
import { detectCaseNumberInQuery } from "./rag-search.ts";

Deno.test("extracts case number \u0535\u053f\u0534/0229/01/16", () => {
  const text = "\u0540\u0540 \u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576\n\u0533\u0578\u0580\u056e \u0569\u056b\u057e \u0535\u053f\u0534/0229/01/16\n25.03.2019";
  const meta = extractCourtMeta(text);
  assertEquals(meta.case_number, "\u0535\u053f\u0534/0229/01/16");
});

Deno.test("normalizes spaces around slashes in case number", () => {
  const text = "\u0533\u0578\u0580\u056e \u0535\u053f\u0534 / 0229 / 01 / 16 some text";
  const meta = extractCourtMeta(text);
  assertEquals(meta.case_number, "\u0535\u053f\u0534/0229/01/16");
});

Deno.test("extracts court name - \u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576", () => {
  const text = "\u0540\u0540 \u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576\n\u0533\u0578\u0580\u056e \u0535\u053f\u0534/0001/01/20";
  const meta = extractCourtMeta(text);
  assertEquals(meta.court_name, "\u0540\u0540 \u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576");
});

Deno.test("extracts court name - \u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0564\u0561\u057f\u0561\u0580\u0561\u0576", () => {
  const text = "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0564\u0561\u057f\u0561\u0580\u0561\u0576 decisions";
  const meta = extractCourtMeta(text);
  assertEquals(meta.court_name, "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0564\u0561\u057f\u0561\u0580\u0561\u0576");
});

Deno.test("extracts court name - \u0531\u057c\u0561\u057b\u056b\u0576 \u0561\u057f\u0575\u0561\u0576\u056b \u0564\u0561\u057f\u0561\u0580\u0561\u0576", () => {
  const text = "\u0531\u057c\u0561\u057b\u056b\u0576 \u0561\u057f\u0575\u0561\u0576\u056b \u0564\u0561\u057f\u0561\u0580\u0561\u0576 ruling";
  const meta = extractCourtMeta(text);
  assertEquals(meta.court_name, "\u0531\u057c\u0561\u057b\u056b\u0576 \u0561\u057f\u0575\u0561\u0576\u056b \u0564\u0561\u057f\u0561\u0580\u0561\u0576");
});

Deno.test("extracts date dd.mm.yyyy", () => {
  const text = "Some header 25.03.2019 more text";
  const meta = extractCourtMeta(text);
  assertEquals(meta.decision_date, "25.03.2019");
});

Deno.test("extracts date yyyy-mm-dd", () => {
  const text = "Decision issued 2019-03-25 by court";
  const meta = extractCourtMeta(text);
  assertEquals(meta.decision_date, "2019-03-25");
});

Deno.test("returns empty object for empty text", () => {
  const meta = extractCourtMeta("");
  assertEquals(meta.case_number, undefined);
  assertEquals(meta.court_name, undefined);
  assertEquals(meta.decision_date, undefined);
});

Deno.test("extracts all three fields together", () => {
  const text = "\u0540\u0540 \u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576\n\u0535\u053f\u0534/0229/01/16\n25.03.2019\n\u054a\u0531\u054c\u0536\u054e\u0535\u0551";
  const meta = extractCourtMeta(text);
  assertEquals(meta.case_number, "\u0535\u053f\u0534/0229/01/16");
  assertEquals(meta.court_name, "\u0540\u0540 \u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576");
  assertEquals(meta.decision_date, "25.03.2019");
});

// ─── Integration: source_anchor uses prefix · marker ─────────────

Deno.test("court chunks use case_number prefix in source_anchor", async () => {
  const rawText = [
    "\u0540\u0540 \u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
    "\u0535\u053f\u0534/0229/01/16",
    "25.03.2019",
    "",
    "\u054a\u0531\u054c\u0536\u054e\u0535\u0551:",
    "",
    "Facts of the case described here in detail. " + "A".repeat(1500),
    "",
    "\u054e\u0543\u054b\u054c\u0535\u0551:",
    "",
    "The court ruled in favor of the plaintiff. " + "B".repeat(1500),
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "court_decision", content_text: rawText, title: "Test Prefix" };
  const result = await chunkDocument(input);

  const factsChunk = result.chunks.find(c => c.chunk_type === "facts");
  assertEquals(factsChunk?.source_anchor?.startsWith("\u0535\u053f\u0534/0229/01/16 \u00b7"), true,
    `facts source_anchor should start with case number prefix, got: ${factsChunk?.source_anchor}`);

  const rulingChunk = result.chunks.find(c => c.chunk_type === "resolution");
  assertEquals(rulingChunk?.source_anchor?.startsWith("\u0535\u053f\u0534/0229/01/16 \u00b7"), true,
    `ruling source_anchor should start with case number prefix, got: ${rulingChunk?.source_anchor}`);

  // Label should include court_name and date
  assertEquals(factsChunk?.label?.includes("\u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576"), true,
    `label should include court name, got: ${factsChunk?.label}`);
  assertEquals(factsChunk?.label?.includes("25.03.2019"), true,
    `label should include date, got: ${factsChunk?.label}`);
});

Deno.test("court chunks without case_number use marker only in source_anchor", async () => {
  const rawText = [
    "\u054a\u0531\u054c\u0536\u054e\u0535\u0551:",
    "",
    "Facts here.",
    "",
    "\u054e\u0543\u054b\u054c\u0535\u0551:",
    "",
    "Ruling here.",
  ].join("\n");

  const input: LegalDocumentInput = { doc_type: "court_decision", content_text: rawText, title: "No CN" };
  const result = await chunkDocument(input);

  const factsChunk = result.chunks.find(c => c.chunk_type === "facts");
  // No prefix, so anchor should NOT contain " · " at start
  assertEquals(factsChunk?.source_anchor?.includes("\u00b7"), false,
    `Without case_number, anchor should have no dot separator, got: ${factsChunk?.source_anchor}`);
});

// ─── detectCaseNumberInQuery tests ──────────────────────────────

Deno.test("detectCaseNumberInQuery: extracts case number from query text", () => {
  assertEquals(detectCaseNumberInQuery("\u0535\u053f\u0534/0229/01/16 \u057e\u0573\u056b\u057c"), "\u0535\u053f\u0534/0229/01/16");
});

Deno.test("detectCaseNumberInQuery: normalizes spaces around slashes", () => {
  assertEquals(detectCaseNumberInQuery("\u0535\u053f\u0534 / 0229 / 01 / 16"), "\u0535\u053f\u0534/0229/01/16");
});

Deno.test("detectCaseNumberInQuery: returns null for no match", () => {
  assertEquals(detectCaseNumberInQuery("some regular query text"), null);
});

Deno.test("detectCaseNumberInQuery: works with surrounding text", () => {
  const cn = detectCaseNumberInQuery("\u0563\u057f\u0576\u0565\u056c \u0535\u053f\u0534/0229/01/16 \u057e\u0565\u0580\u0561\u0562\u0565\u0580\u0575\u0561\u056c");
  assertEquals(cn, "\u0535\u053f\u0534/0229/01/16");
});
