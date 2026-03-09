/**
 * Tests for cleanupTextV2
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { cleanupTextV2 } from "./chunker.ts";

Deno.test("NFC normalizes combining sequences", () => {
  // e + combining acute = \u00e9
  const input = "e\u0301";
  const { cleaned } = cleanupTextV2(input);
  assertEquals(cleaned, "\u00e9");
});

Deno.test("replaces null bytes", () => {
  const input = "hello\u0000world";
  const { cleaned } = cleanupTextV2(input);
  assertEquals(cleaned, "helloworld");
});

Deno.test("replaces non-breaking spaces with regular space", () => {
  const input = "word\u00A0another\u00A0end";
  const { cleaned } = cleanupTextV2(input);
  assertEquals(cleaned, "word another end");
});

Deno.test("normalizes dash characters \\u2010-\\u2014 to '-'", () => {
  // \u2010 hyphen, \u2011 non-breaking hyphen, \u2012 figure dash, \u2013 en dash, \u2014 em dash
  const input = "a\u2010b\u2011c\u2012d\u2013e\u2014f";
  const { cleaned } = cleanupTextV2(input);
  assertEquals(cleaned, "a-b-c-d-e-f");
});

Deno.test("collapses 3+ newlines to 2", () => {
  const input = "first\n\n\n\nsecond\n\n\n\n\nthird";
  const { cleaned } = cleanupTextV2(input);
  assertEquals(cleaned, "first\n\nsecond\n\nthird");
});

Deno.test("removes page markers like '- 42 -'", () => {
  const input = "text before\n- 42 -\ntext after";
  const { cleaned, removedLines } = cleanupTextV2(input);
  assertEquals(cleaned, "text before\ntext after");
  assertEquals(removedLines, 1);
});

Deno.test("removes Armenian page markers '\u0567\u057b 5'", () => {
  const input = "content\n  \u0567\u057b 5  \nmore content";
  const { cleaned, removedLines } = cleanupTextV2(input);
  assertEquals(cleaned, "content\nmore content");
  assertEquals(removedLines, 1);
});

Deno.test("collapses horizontal whitespace 3+ to single space", () => {
  const input = "word     word2\tthing";
  const { cleaned } = cleanupTextV2(input);
  assertEquals(cleaned, "word word2\tthing");
});

Deno.test("empty input returns empty", () => {
  const { cleaned, removedLines } = cleanupTextV2("");
  assertEquals(cleaned, "");
  assertEquals(removedLines, 0);
});

Deno.test("all rules combined", () => {
  const input = "Hello\u0000\u00A0world\u2013here\n\n\n\n\n- 3 -\n  \u0567\u057b 10  \n  lots   of   space  ";
  const { cleaned, removedLines } = cleanupTextV2(input);
  // null removed, nbsp->space, en-dash->'-', 5 newlines->2, page markers removed, whitespace collapsed
  assertEquals(cleaned.includes("\u0000"), false);
  assertEquals(cleaned.includes("\u00A0"), false);
  assertEquals(cleaned.includes("\u2013"), false);
  assertEquals(cleaned.includes("- 3 -"), false);
  assertEquals(cleaned.includes("\u0567\u057b 10"), false);
  assertEquals(removedLines, 2);
});
