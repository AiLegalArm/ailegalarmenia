import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  extractArlisId,
  matchSources,
  mergeSources,
  findMatchingPairs,
  type SourceRecord,
} from "./source-merger.ts";

// ─── extractArlisId ─────────────────────────────────────────────────

Deno.test("extractArlisId: extracts from arlis.am URL", () => {
  const id = extractArlisId(
    "https://www.arlis.am/DocumentView.aspx?docid=75863"
  );
  assertEquals(id, "75863");
});

Deno.test("extractArlisId: extracts from lowercase docview URL", () => {
  const id = extractArlisId(
    "https://arlis.am/docview.aspx?docid=12345&lang=arm"
  );
  assertEquals(id, "12345");
});

Deno.test("extractArlisId: extracts from fileName fallback", () => {
  const id = extractArlisId(undefined, "arlis_id_99001.txt");
  assertEquals(id, "99001");
});

Deno.test("extractArlisId: returns null when no arlis reference", () => {
  const id = extractArlisId("https://example.com/doc.pdf", "random.txt");
  assertEquals(id, null);
});

// ─── matchSources ───────────────────────────────────────────────────

function makeSource(overrides: Partial<SourceRecord>): SourceRecord {
  return {
    sourceKey: "test-key",
    fileName: "test.txt",
    mimeType: "text/plain",
    title: "Test Title",
    contentText: "content",
    chunks: [],
    ...overrides,
  };
}

Deno.test("matchSources: matches by arlis ID", () => {
  const a = makeSource({
    sourceKey: "a",
    sourceUrl: "https://arlis.am/DocumentView.aspx?docid=555",
    fileName: "law.txt",
  });
  const b = makeSource({
    sourceKey: "b",
    sourceUrl: "https://arlis.am/docview.aspx?docid=555",
    fileName: "law.pdf",
    mimeType: "application/pdf",
  });

  const result = matchSources(a, b);
  assertEquals(result.matched, true);
  assertEquals(result.rule, "arlis_id");
  assertEquals(result.matchKey, "arlis:555");
});

Deno.test("matchSources: matches by title+date", () => {
  const a = makeSource({
    sourceKey: "a",
    title: "Some Law Title",
    dateAdopted: "2023-05-01",
  });
  const b = makeSource({
    sourceKey: "b",
    title: "  Some  Law  Title  ",
    dateAdopted: "2023-05-01",
  });

  const result = matchSources(a, b);
  assertEquals(result.matched, true);
  assertEquals(result.rule, "title_date");
});

Deno.test("matchSources: no match when titles differ", () => {
  const a = makeSource({ sourceKey: "a", title: "Law A", dateAdopted: "2023-01-01" });
  const b = makeSource({ sourceKey: "b", title: "Law B", dateAdopted: "2023-01-01" });
  const result = matchSources(a, b);
  assertEquals(result.matched, false);
  assertEquals(result.rule, "none");
});

Deno.test("matchSources: no match when dates differ", () => {
  const a = makeSource({ sourceKey: "a", title: "Same", dateAdopted: "2023-01-01" });
  const b = makeSource({ sourceKey: "b", title: "Same", dateAdopted: "2024-01-01" });
  const result = matchSources(a, b);
  assertEquals(result.matched, false);
});

// ─── mergeSources ───────────────────────────────────────────────────

Deno.test("mergeSources: merges TXT + PDF correctly", async () => {
  const txtChunks = [
    { chunk_index: 0, chunk_type: "article" as const, chunk_text: "Article 1 text", char_start: 0, char_end: 14, label: "Art. 1", locator: null, chunk_hash: "h1", metadata: null },
    { chunk_index: 1, chunk_type: "article" as const, chunk_text: "Article 2 text", char_start: 15, char_end: 29, label: "Art. 2", locator: null, chunk_hash: "h2", metadata: null },
  ];

  const pdfChunks = [
    { chunk_index: 0, chunk_type: "full_text" as const, chunk_text: "PDF content block", char_start: 0, char_end: 17, label: "Block 1", locator: null, chunk_hash: "hp1", metadata: null },
    { chunk_index: 1, chunk_type: "header" as const, chunk_text: "Header text", char_start: 18, char_end: 29, label: null, locator: null, chunk_hash: "hh1", metadata: null },
  ];

  const txt = makeSource({
    sourceKey: "txt-1",
    fileName: "law.txt",
    mimeType: "text/plain",
    title: "Test Law",
    sourceUrl: "https://arlis.am/DocumentView.aspx?docid=100",
    contentText: "Article 1 text Article 2 text",
    chunks: txtChunks,
  });

  const pdf = makeSource({
    sourceKey: "pdf-1",
    fileName: "law.pdf",
    mimeType: "application/pdf",
    title: "Test Law",
    sourceUrl: "https://arlis.am/DocumentView.aspx?docid=100",
    contentText: "PDF content block Header text",
    chunks: pdfChunks,
  });

  const merged = await mergeSources(txt, pdf);

  assertEquals(merged.title, "Test Law");
  assertEquals(merged.textChunks.length, 2);
  assertEquals(merged.pdfChunks.length, 2); // All PDF chunks included
  assertEquals(merged.allChunks.length, 4); // 2 text + 2 pdf
  assertEquals(merged.pdfChunks[0].chunk_index, 2); // Re-indexed
  assertEquals(merged.pdfChunks[0].label, "[PDF] Block 1");
  assertEquals(merged.match.rule, "arlis_id");
  assertEquals(merged.sources.txt.fileName, "law.txt");
  assertEquals(merged.sources.pdf.fileName, "law.pdf");
});

Deno.test("mergeSources: throws on non-matching sources", async () => {
  const a = makeSource({ sourceKey: "a", title: "A" });
  const b = makeSource({ sourceKey: "b", title: "B" });

  try {
    await mergeSources(a, b);
    throw new Error("Should have thrown");
  } catch (e) {
    assertEquals((e as Error).message.includes("do not match"), true);
  }
});

// ─── findMatchingPairs ──────────────────────────────────────────────

Deno.test("findMatchingPairs: finds arlis ID pairs", () => {
  const sources: SourceRecord[] = [
    makeSource({ sourceKey: "1", sourceUrl: "https://arlis.am/DocumentView.aspx?docid=200", fileName: "a.txt" }),
    makeSource({ sourceKey: "2", sourceUrl: "https://arlis.am/docview.aspx?docid=200", fileName: "a.pdf", mimeType: "application/pdf" }),
    makeSource({ sourceKey: "3", sourceUrl: "https://arlis.am/DocumentView.aspx?docid=300", fileName: "b.txt" }),
  ];

  const pairs = findMatchingPairs(sources);
  assertEquals(pairs.size, 1);
  assertEquals(pairs.has("arlis:200"), true);
  assertEquals(pairs.get("arlis:200")!.length, 2);
});

Deno.test("findMatchingPairs: finds title+date pairs", () => {
  const sources: SourceRecord[] = [
    makeSource({ sourceKey: "1", title: "Law X", dateAdopted: "2020-06-15", fileName: "x.txt" }),
    makeSource({ sourceKey: "2", title: "Law X", dateAdopted: "2020-06-15", fileName: "x.pdf", mimeType: "application/pdf" }),
  ];

  const pairs = findMatchingPairs(sources);
  assertEquals(pairs.size, 1);
});

Deno.test("findMatchingPairs: arlis ID takes priority over title+date", () => {
  const sources: SourceRecord[] = [
    makeSource({
      sourceKey: "1",
      title: "Same",
      dateAdopted: "2023-01-01",
      sourceUrl: "https://arlis.am/DocumentView.aspx?docid=999",
      fileName: "a.txt",
    }),
    makeSource({
      sourceKey: "2",
      title: "Same",
      dateAdopted: "2023-01-01",
      sourceUrl: "https://arlis.am/docview.aspx?docid=999",
      fileName: "a.pdf",
      mimeType: "application/pdf",
    }),
  ];

  const pairs = findMatchingPairs(sources);
  assertEquals(pairs.size, 1);
  assertEquals(pairs.has("arlis:999"), true);
});
