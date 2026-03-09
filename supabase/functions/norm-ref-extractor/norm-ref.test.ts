/**
 * Tests for norm-ref-extractor
 *
 * All Armenian text represented as Unicode escapes per project standards.
 * Run: deno test --allow-env supabase/functions/norm-ref-extractor/norm-ref.test.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractNormRefs, type NormRef } from "./index.ts";

// ─── TEST 1: Basic article reference ────────────────────────────────
// "\u0570\u0578\u0564\u057e\u0561\u056e 391" = "hodvac 391" (Article 391)
Deno.test("extracts basic article reference", () => {
  const text = "\u0570\u0578\u0564\u057e\u0561\u056e 391";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].article, "391");
  assertEquals(refs[0].part, null);
  assertEquals(refs[0].point, null);
  assertEquals(refs[0].act_number, null);
});

// ─── TEST 2: Article with part ──────────────────────────────────────
// "\u0570\u0578\u0564\u057e\u0561\u056e 55 \u0574\u0561\u057d 1" = "hodvac 55 mas 1" (Article 55, part 1)
Deno.test("extracts article with part", () => {
  const text = "\u0570\u0578\u0564\u057e\u0561\u056e 55 \u0574\u0561\u057d 1";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].article, "55");
  assertEquals(refs[0].part, "1");
  assertEquals(refs[0].point, null);
});

// ─── TEST 3: Article with part and point ────────────────────────────
// "\u0570\u0578\u0564\u057e\u0561\u056e 391 \u0574\u0561\u057d 2 \u056f\u0565\u057f 3"
// = "hodvac 391 mas 2 ket 3" (Article 391, part 2, point 3)
Deno.test("extracts article with part and point", () => {
  const text = "\u0570\u0578\u0564\u057e\u0561\u056e 391 \u0574\u0561\u057d 2 \u056f\u0565\u057f 3";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].article, "391");
  assertEquals(refs[0].part, "2");
  assertEquals(refs[0].point, "3");
});

// ─── TEST 4: Genitive form ──────────────────────────────────────────
// "\u0570\u0578\u0564\u057e\u0561\u056e\u056b 104" = "hodvaci 104" (of Article 104)
Deno.test("extracts genitive article form", () => {
  const text = "\u0570\u0578\u0564\u057e\u0561\u056e\u056b 104";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].article, "104");
});

// ─── TEST 5: Uppercase article ──────────────────────────────────────
// "\u0540\u0578\u0564\u057e\u0561\u056e 23" = "Hodvac 23" (uppercase)
Deno.test("extracts uppercase article", () => {
  const text = "\u0540\u0578\u0564\u057e\u0561\u056e 23";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].article, "23");
});

// ─── TEST 6: Abbreviated form ───────────────────────────────────────
// "\u0570\u0578\u0564\u057e. 88" = "hodv. 88" (abbreviated)
Deno.test("extracts abbreviated article form", () => {
  const text = "\u0570\u0578\u0564\u057e. 88";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].article, "88");
});

// ─── TEST 7: Multiple references ────────────────────────────────────
// Two articles in one sentence
Deno.test("extracts multiple references from text", () => {
  const text =
    "\u0570\u0578\u0564\u057e\u0561\u056e 391 \u0574\u0561\u057d 1 " +
    "\u0587 " + // \u0587 = "\u0587" (and)
    "\u0570\u0578\u0564\u057e\u0561\u056e 104 \u0574\u0561\u057d 2 \u056f\u0565\u057f 1";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 2);
  // Sorted by article number
  assertEquals(refs[0].article, "104");
  assertEquals(refs[0].part, "2");
  assertEquals(refs[0].point, "1");
  assertEquals(refs[1].article, "391");
  assertEquals(refs[1].part, "1");
  assertEquals(refs[1].point, null);
});

// ─── TEST 8: Act number proximity ───────────────────────────────────
// Act number "\u0540\u0555-528-\u0546" appears before article
Deno.test("detects act number from proximity", () => {
  const text =
    "\u0540\u0555-528-\u0546 " +
    "\u0570\u0578\u0564\u057e\u0561\u056e 391 \u0574\u0561\u057d 1";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].act_number, "\u0540\u0555-528-\u0546");
  assertEquals(refs[0].article, "391");
  assertEquals(refs[0].part, "1");
});

// ─── TEST 9: No act number when distant ─────────────────────────────
Deno.test("act_number is null when no act number nearby", () => {
  const text =
    "Some preamble text without act numbers.\n\n" +
    "\u0570\u0578\u0564\u057e\u0561\u056e 55";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].act_number, null);
});

// ─── TEST 10: Empty text ────────────────────────────────────────────
Deno.test("returns empty for empty text", () => {
  assertEquals(extractNormRefs("").length, 0);
  assertEquals(extractNormRefs("   ").length, 0);
});

// ─── TEST 11: Deduplication ─────────────────────────────────────────
Deno.test("deduplicates identical references", () => {
  const text =
    "\u0570\u0578\u0564\u057e\u0561\u056e 391 " +
    "\u0587 " +
    "\u0570\u0578\u0564\u057e\u0561\u056e\u056b 391"; // same article twice
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].article, "391");
});

// ─── TEST 12: Decimal article number ────────────────────────────────
// Some codes have articles like 391.1
Deno.test("extracts decimal article numbers", () => {
  const text = "\u0570\u0578\u0564\u057e\u0561\u056e 391.1 \u0574\u0561\u057d 3";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 1);
  assertEquals(refs[0].article, "391.1");
  assertEquals(refs[0].part, "3");
});

// ─── TEST 13: Realistic court decision excerpt ──────────────────────
Deno.test("extracts from realistic court decision text", () => {
  // Simulates: "Based on Article 391 part 1 of the RA Criminal Code (\u0540\u0555-528-\u0546),
  // and Article 104 part 2 point 1, the court finds..."
  const text =
    "\u0540\u0555-528-\u0546 " +
    "\u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0585\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584\u056b " +
    "\u0570\u0578\u0564\u057e\u0561\u056e 391 \u0574\u0561\u057d 1 " +
    "\u0587 " +
    "\u0570\u0578\u0564\u057e\u0561\u056e 104 \u0574\u0561\u057d 2 \u056f\u0565\u057f 1";

  const refs = extractNormRefs(text);
  assertEquals(refs.length, 2);

  // Both should have the act number
  assertEquals(refs[0].act_number, "\u0540\u0555-528-\u0546");
  assertEquals(refs[0].article, "104");
  assertEquals(refs[0].part, "2");
  assertEquals(refs[0].point, "1");

  assertEquals(refs[1].act_number, "\u0540\u0555-528-\u0546");
  assertEquals(refs[1].article, "391");
  assertEquals(refs[1].part, "1");
  assertEquals(refs[1].point, null);
});

// ─── TEST 14: No Armenian text -> no refs ───────────────────────────
Deno.test("returns empty for non-Armenian text", () => {
  const text = "Article 391 part 1 of the Criminal Code";
  const refs = extractNormRefs(text);
  assertEquals(refs.length, 0);
});

// ─── TEST 15: Deterministic output ──────────────────────────────────
Deno.test("output is deterministic across multiple calls", () => {
  const text =
    "\u0570\u0578\u0564\u057e\u0561\u056e 104 \u0574\u0561\u057d 2 " +
    "\u0587 " +
    "\u0570\u0578\u0564\u057e\u0561\u056e 391 \u0574\u0561\u057d 1 \u056f\u0565\u057f 3";
  const r1 = JSON.stringify(extractNormRefs(text));
  const r2 = JSON.stringify(extractNormRefs(text));
  const r3 = JSON.stringify(extractNormRefs(text));
  assertEquals(r1, r2);
  assertEquals(r2, r3);
});
