import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  extractTables,
  findTableRegions,
  type ExtractedTable,
} from "./table-extractor.ts";

// ─── Pipe-delimited tables ──────────────────────────────────────────

Deno.test("extractTables: detects pipe-delimited table", () => {
  const text = `Some intro text here.

| Name | Age | City |
| Alice | 30 | Yerevan |
| Bob | 25 | Gyumri |

Some outro text.`;

  const tables = extractTables(text);
  assertEquals(tables.length, 1);
  assertEquals(tables[0].quality, "high");
  assertEquals(tables[0].colCount, 3);
  assertEquals(tables[0].rowCount, 3);
  assertEquals(tables[0].markdown.includes("| Name | Age | City |"), true);
  assertEquals(tables[0].markdown.includes("| --- | --- | --- |"), true);
  assertEquals(tables[0].markdown.includes("| Alice | 30 | Yerevan |"), true);
});

// ─── Tab-separated tables ───────────────────────────────────────────

Deno.test("extractTables: detects tab-separated table", () => {
  const text = `Header paragraph.

Item\tQty\tPrice
Apple\t10\t500
Banana\t5\t300

Footer.`;

  const tables = extractTables(text);
  assertEquals(tables.length, 1);
  assertEquals(tables[0].colCount, 3);
  assertEquals(tables[0].rowCount, 3);
  assertEquals(tables[0].markdown.includes("| Item | Qty | Price |"), true);
});

// ─── Space-aligned tables ───────────────────────────────────────────

Deno.test("extractTables: detects space-aligned table with lower quality", () => {
  const text = `Introduction.

Article     Violation     Penalty
178.1       Theft         3 years
311         Bribery       5 years

Conclusion.`;

  const tables = extractTables(text);
  assertEquals(tables.length, 1);
  assertEquals(tables[0].colCount, 3);
  // Space-aligned gets medium or low quality
  assertEquals(["medium", "low"].includes(tables[0].quality), true);
});

// ─── Caption detection ──────────────────────────────────────────────

Deno.test("extractTables: detects Armenian caption", () => {
  const text = `\u0531\u0572\u0575\u0578\u0582\u057d\u0561\u056f 1
| Col1 | Col2 |
| A | B |
| C | D |`;

  const tables = extractTables(text);
  assertEquals(tables.length, 1);
  assertEquals(tables[0].caption !== null, true);
});

Deno.test("extractTables: detects Russian caption", () => {
  const text = `\u0422\u0430\u0431\u043b\u0438\u0446\u0430 2
| X | Y |
| 1 | 2 |
| 3 | 4 |`;

  const tables = extractTables(text);
  assertEquals(tables.length, 1);
  assertEquals(tables[0].caption !== null, true);
});

// ─── No tables ──────────────────────────────────────────────────────

Deno.test("extractTables: returns empty for plain text", () => {
  const text = `This is just a regular paragraph.
It has no tables at all.
Just flowing text content.`;

  const tables = extractTables(text);
  assertEquals(tables.length, 0);
});

// ─── Multiple tables ────────────────────────────────────────────────

Deno.test("extractTables: finds multiple tables", () => {
  const text = `Intro.

| A | B |
| 1 | 2 |
| 3 | 4 |

Middle text paragraph.

| X | Y | Z |
| a | b | c |
| d | e | f |

End.`;

  const tables = extractTables(text);
  assertEquals(tables.length, 2);
  assertEquals(tables[0].colCount, 2);
  assertEquals(tables[1].colCount, 3);
});

// ─── Single row is not a table ──────────────────────────────────────

Deno.test("extractTables: single row is not a table", () => {
  const text = `Some text.
| Only one row |
More text.`;

  const tables = extractTables(text);
  assertEquals(tables.length, 0);
});

// ─── findTableRegions ───────────────────────────────────────────────

Deno.test("findTableRegions: returns correct line ranges", () => {
  const lines = [
    "intro",
    "",
    "| A | B |",
    "| 1 | 2 |",
    "| 3 | 4 |",
    "",
    "outro",
  ];

  const regions = findTableRegions(lines);
  assertEquals(regions.length, 1);
  assertEquals(regions[0].startLine, 2);
  assertEquals(regions[0].endLine, 5);
  assertEquals(regions[0].lineType, "pipe");
});

// ─── Markdown output format ─────────────────────────────────────────

Deno.test("extractTables: markdown has proper separator row", () => {
  const text = `| Head1 | Head2 |
| Val1 | Val2 |
| Val3 | Val4 |`;

  const tables = extractTables(text);
  assertEquals(tables.length, 1);

  const lines = tables[0].markdown.split("\n");
  assertEquals(lines.length, 4); // header + separator + 2 data rows
  assertEquals(lines[1], "| --- | --- |");
});
