/**
 * Tests for inferDocTypeFromText — court decision markers (RU + AM)
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { inferDocTypeFromText } from "./chunker.ts";

// ─── RU court markers ──────────────────────────────────────────────

Deno.test("inferDocType: RU '\u0423\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b' -> court_decision", () => {
  const text = "Some preamble text\n\u0421\u0423\u0414 \u0423\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b:\nfacts here";
  assertEquals(inferDocTypeFromText(text), "court_decision");
});

Deno.test("inferDocType: RU '\u0420\u0415\u0428\u0418\u041b' -> court_decision", () => {
  const text = "Header\n\u041c\u041e\u0422\u0418\u0412\u0418\u0420\u041e\u0412\u041e\u0427\u041d\u0410\u042f \u0427\u0410\u0421\u0422\u042c\nreasoning\n\u0420\u0415\u0428\u0418\u041b:\nresolution";
  assertEquals(inferDocTypeFromText(text), "court_decision");
});

Deno.test("inferDocType: RU '\u041f\u041e\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b' -> court_decision", () => {
  const text = "Appellate court\n\u041f\u041e\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b:\noutcome";
  assertEquals(inferDocTypeFromText(text), "court_decision");
});

// ─── AM court markers ──────────────────────────────────────────────

Deno.test("inferDocType: AM '\u054a\u0531\u054c\u0536\u054e\u0535\u0551' -> court_decision", () => {
  const text = "Header text\n\u054a\u0531\u054c\u0536\u054e\u0535\u0551\nfacts";
  assertEquals(inferDocTypeFromText(text), "court_decision");
});

Deno.test("inferDocType: AM '\u054e\u0543\u054b\u054c\u0535\u0551' -> court_decision", () => {
  const text = "Court text\n\u054e\u0543\u054b\u054c\u0535\u0551\nresolution";
  assertEquals(inferDocTypeFromText(text), "court_decision");
});

Deno.test("inferDocType: AM '\u0555\u054c\u0548\u0547\u0535\u0551' -> court_decision", () => {
  const text = "Decision text\n\u0555\u054c\u0548\u0547\u0535\u0551\nruling";
  assertEquals(inferDocTypeFromText(text), "court_decision");
});

// ─── Priority: court > law ─────────────────────────────────────────

Deno.test("inferDocType: court markers take priority over article markers", () => {
  const text = "\u0540\u0578\u0564\u057e\u0561\u056e 1. Foo\n\u0540\u0578\u0564\u057e\u0561\u056e 2. Bar\n\u0555\u054c\u0548\u0547\u0548\u0552\u0544\nruling";
  assertEquals(inferDocTypeFromText(text), "court_decision");
});

// ─── Law detection (unchanged) ─────────────────────────────────────

Deno.test("inferDocType: AM articles -> code_or_law", () => {
  const text = "\u0540\u0578\u0564\u057e\u0561\u056e 1. First\n\u0540\u0578\u0564\u057e\u0561\u056e 2. Second\n\u0540\u0578\u0564\u057e\u0561\u056e 3. Third";
  assertEquals(inferDocTypeFromText(text), "code_or_law");
});

Deno.test("inferDocType: RU '\u0421\u0442\u0430\u0442\u044c\u044f' articles -> code_or_law", () => {
  const text = "\u0421\u0442\u0430\u0442\u044c\u044f 1. First\n\u0421\u0442\u0430\u0442\u044c\u044f 2. Second\n\u0421\u0442\u0430\u0442\u044c\u044f 3. Third";
  assertEquals(inferDocTypeFromText(text), "code_or_law");
});

// ─── Fallback ──────────────────────────────────────────────────────

Deno.test("inferDocType: plain text -> other", () => {
  assertEquals(inferDocTypeFromText("Just some random text."), "other");
});

Deno.test("inferDocType: empty -> other", () => {
  assertEquals(inferDocTypeFromText(""), "other");
});
