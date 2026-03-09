import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Inline the functions for testing (same logic as in index.ts)
interface NormalizeResult {
  text: string;
  invalidEscapeFound: boolean;
}

function normalizeUnicodeEscapes(input: string): NormalizeResult {
  let invalidEscapeFound = false;

  let result = input.replace(
    /\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})/g,
    (_match, hex1: string, hex2: string) => {
      const cp1 = parseInt(hex1, 16);
      const cp2 = parseInt(hex2, 16);
      const codePoint = ((cp1 - 0xD800) * 0x400) + (cp2 - 0xDC00) + 0x10000;
      return String.fromCodePoint(codePoint);
    }
  );

  result = result.replace(
    /\\u([0-9a-fA-F]{4})/g,
    (_match, hex: string) => {
      const cp = parseInt(hex, 16);
      if (cp === 0) { invalidEscapeFound = true; return ""; }
      if (cp >= 0xD800 && cp <= 0xDFFF) { invalidEscapeFound = true; return _match; }
      return String.fromCharCode(cp);
    }
  );

  if (/\\u(?![0-9a-fA-F]{4})/.test(result)) {
    invalidEscapeFound = true;
  }

  return { text: result, invalidEscapeFound };
}

function sanitizeString(s: unknown): string {
  if (typeof s !== "string") return String(s ?? "");
  const { text } = normalizeUnicodeEscapes(s);
  return text
    .replace(/\x00/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

// --- Tests ---

Deno.test("normalizes Russian escaped text to real Cyrillic", () => {
  const input = "\\u044d\\u043b\\u0435\\u043c";
  const { text } = normalizeUnicodeEscapes(input);
  assertEquals(text, String.fromCharCode(0x044d, 0x043b, 0x0435, 0x043c));
});

Deno.test("normalizes surrogate pair emoji", () => {
  const input = "\\uD83D\\uDE00";
  const { text } = normalizeUnicodeEscapes(input);
  assertEquals(text, String.fromCodePoint(0x1F600));
});

Deno.test("handles invalid escape gracefully", () => {
  const input = "test \\u12G4 and \\u123 end";
  const { invalidEscapeFound } = normalizeUnicodeEscapes(input);
  assertEquals(invalidEscapeFound, true);
});

Deno.test("does not modify normal text", () => {
  const input = "Hello world\nNew line\ttab";
  const { text } = normalizeUnicodeEscapes(input);
  assertEquals(text, input);
});

Deno.test("strips literal \\u0000 escape", () => {
  const input = "before\\u0000after";
  const { text, invalidEscapeFound } = normalizeUnicodeEscapes(input);
  assertEquals(text, "beforeafter");
  assertEquals(invalidEscapeFound, true);
});

Deno.test("sanitizeString strips real NUL bytes", () => {
  assertEquals(sanitizeString("abc\x00def"), "abcdef");
});

Deno.test("sanitizeString strips lone surrogates", () => {
  const withSurrogate = "abc" + String.fromCharCode(0xD800) + "def";
  assertEquals(sanitizeString(withSurrogate), "abcdef");
});

Deno.test("sanitizeString strips control chars but keeps tabs/newlines", () => {
  const input = "line1\nline2\ttab\x01\x02\x1F";
  assertEquals(sanitizeString(input), "line1\nline2\ttab");
});

Deno.test("normalizes Armenian text", () => {
  const input = "\\u0540\\u0578\\u0564\\u057E\\u0561\\u056E";
  const { text } = normalizeUnicodeEscapes(input);
  assertEquals(text, String.fromCharCode(0x0540, 0x0578, 0x0564, 0x057E, 0x0561, 0x056E));
});
