/**
 * Unit tests for cleanupText (Phase 0) in chunker.ts
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { cleanupText } from "./chunker.ts";

Deno.test("cleanupText: removes null bytes", () => {
  const input = "Hello\u0000World\u0000!";
  const { cleaned } = cleanupText(input);
  assertEquals(cleaned, "HelloWorld!");
  assertEquals(cleaned.includes("\u0000"), false);
});

Deno.test("cleanupText: collapses 3+ newlines to 2", () => {
  const input = "First\n\n\n\nSecond\n\n\n\n\nThird";
  const { cleaned } = cleanupText(input);
  assertEquals(cleaned, "First\n\nSecond\n\nThird");
});

Deno.test("cleanupText: preserves double newlines", () => {
  const input = "First\n\nSecond\n\nThird";
  const { cleaned } = cleanupText(input);
  assertEquals(cleaned, "First\n\nSecond\n\nThird");
});

Deno.test("cleanupText: removes repeated header/footer lines (freq >= 3, regular interval)", () => {
  // Simulate a PDF with repeated header every ~3 lines
  const lines: string[] = [];
  for (let i = 0; i < 5; i++) {
    lines.push("Official Gazette No. 42");
    lines.push(`Article content block ${i} with legal text.`);
    lines.push(`More content for section ${i}.`);
  }
  const input = lines.join("\n");
  const { cleaned, removedLines } = cleanupText(input);
  assertEquals(cleaned.includes("Official Gazette No. 42"), false);
  assertEquals(cleaned.includes("Article content block 0"), true);
  assertEquals(removedLines, 5);
});

Deno.test("cleanupText: does NOT remove normal repeating content (irregular interval)", () => {
  // Same line appearing 3 times but at irregular intervals — not a header
  const input = [
    "Some text line A",
    "Some text line A",
    "Some text line A",
    "Different content here",
  ].join("\n");
  // All 3 occurrences are consecutive (interval=1), mean<2, so they should be preserved
  const { cleaned } = cleanupText(input);
  assertEquals(cleaned.includes("Some text line A"), true);
});

Deno.test("cleanupText: removes page markers like '- 42 -'", () => {
  const input = "Legal text\n- 42 -\nMore text\n\u2014 3 \u2014\nEnd";
  const { cleaned, removedLines } = cleanupText(input);
  assertEquals(cleaned, "Legal text\nMore text\nEnd");
  assertEquals(removedLines, 2);
});

Deno.test("cleanupText: collapses horizontal whitespace runs", () => {
  const input = "Word1     Word2\tWord3      Word4";
  const { cleaned } = cleanupText(input);
  assertEquals(cleaned, "Word1 Word2\tWord3 Word4");
});

Deno.test("cleanupText: NFC normalizes text", () => {
  // NFD form: e + combining acute = é
  const nfd = "e\u0301"; // NFD
  const nfc = "\u00e9";  // NFC
  const { cleaned } = cleanupText(nfd);
  assertEquals(cleaned, nfc);
});

Deno.test("cleanupText: empty input returns empty", () => {
  const { cleaned, removedLines } = cleanupText("");
  assertEquals(cleaned, "");
  assertEquals(removedLines, 0);
});

Deno.test("cleanupText: does not modify clean legal text (false positive protection)", () => {
  const input = "\u0540\u0578\u0564\u057e\u0561\u056e 1. Test article text\n\n\u0540\u0578\u0564\u057e\u0561\u056e 2. Second article";
  const { cleaned, removedLines } = cleanupText(input);
  assertEquals(cleaned, input);
  assertEquals(removedLines, 0);
});
