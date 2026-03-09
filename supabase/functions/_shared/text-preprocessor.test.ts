/**
 * Tests for text-preprocessor.ts
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { preprocessText } from "./text-preprocessor.ts";

Deno.test("strips HTML tags and decodes entities", () => {
  const input = "<p>Hello &amp; <b>world</b></p>";
  const { cleaned } = preprocessText(input, { isHtml: true });
  assertEquals(cleaned, "Hello & world");
});

Deno.test("removes page number lines", () => {
  const input = "Some legal text\n  42  \nMore legal text\n- 3 -\nEnd";
  const { cleaned } = preprocessText(input);
  assertEquals(cleaned, "Some legal text\nMore legal text\nEnd");
});

Deno.test("removes repeated header/footer lines", () => {
  const header = "Official Gazette of RA";
  const lines = [];
  for (let i = 0; i < 5; i++) {
    lines.push(header);
    lines.push(`Article content block ${i}`);
  }
  const { cleaned } = preprocessText(lines.join("\n"));
  // Header should be removed, content preserved
  assertEquals(cleaned.includes(header), false);
  assertEquals(cleaned.includes("Article content block 0"), true);
});

Deno.test("removes bare URL lines", () => {
  const input = "Legal text here\nhttps://www.arlis.am/DocumentView.aspx?id=123\nMore text";
  const { cleaned } = preprocessText(input);
  assertEquals(cleaned, "Legal text here\nMore text");
});

Deno.test("collapses excessive whitespace", () => {
  const input = "First paragraph\n\n\n\n\nSecond paragraph";
  const { cleaned } = preprocessText(input);
  assertEquals(cleaned, "First paragraph\n\nSecond paragraph");
});

Deno.test("strips BOM and zero-width chars", () => {
  const input = "\uFEFFHello\u200Bworld";
  const { cleaned } = preprocessText(input);
  assertEquals(cleaned, "Helloworld");
});

Deno.test("preserves legal structure (articles)", () => {
  // Armenian "Hodvac 1." (Article 1.)
  const input = "\u0540\u0578\u0564\u057e\u0561\u056e 1\u0589\n\nSome content\n\n\u0540\u0578\u0564\u057e\u0561\u056e 2\u0589\n\nMore content";
  const { cleaned } = preprocessText(input);
  // Both articles must survive
  assertEquals(cleaned.includes("\u0540\u0578\u0564\u057e\u0561\u056e 1"), true);
  assertEquals(cleaned.includes("\u0540\u0578\u0564\u057e\u0561\u056e 2"), true);
});

Deno.test("empty input returns empty", () => {
  const { cleaned, rulesApplied } = preprocessText("");
  assertEquals(cleaned, "");
  assertEquals(rulesApplied, 0);
});

Deno.test("removes garbled encoding fragments", () => {
  const input = "Legal text\nZuuupp\nMore text";
  const { cleaned } = preprocessText(input);
  assertEquals(cleaned.includes("Zuuupp"), false);
  assertEquals(cleaned.includes("Legal text"), true);
});

Deno.test("does not remove real short words", () => {
  const input = "The law states";
  const { cleaned } = preprocessText(input);
  assertEquals(cleaned, "The law states");
});
