// =============================================================================
// PII Redactor \u2014 Test Suite
// =============================================================================

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { redactPII, redactForLog, redactAIOutput, redactObject } from "./pii-redactor.ts";

// ---------------------------------------------------------------------------
// Armenian names (Unicode escapes per project policy)
// ---------------------------------------------------------------------------

Deno.test("redacts Armenian full name (2 words)", () => {
  // \u0531\u0576\u056B \u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576
  const input = "User: \u0531\u0576\u056B \u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576 filed a case";
  const result = redactPII(input);
  assertEquals(result.includes("[NAME]"), true);
  assertEquals(result.includes("\u0531\u0576\u056B"), false);
});

Deno.test("redacts Armenian full name (3 words)", () => {
  // \u0531\u0576\u056B \u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576 \u054D\u0561\u0580\u0563\u057D\u056B
  const input = "\u0531\u0576\u056B \u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576 \u054D\u0561\u0580\u0563\u057D\u056B submitted documents";
  const result = redactPII(input);
  assertEquals(result.includes("[NAME]"), true);
  assertEquals(result.includes("\u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576"), false);
});

// ---------------------------------------------------------------------------
// Latin names
// ---------------------------------------------------------------------------

Deno.test("redacts Latin full name", () => {
  const input = "Client John Smith requested analysis";
  const result = redactPII(input);
  assertEquals(result.includes("[NAME]"), true);
  assertEquals(result.includes("John Smith"), false);
});

Deno.test("preserves legal terms that look like names", () => {
  const input = "Supreme Court issued ruling";
  const result = redactPII(input);
  assertEquals(result.includes("Supreme Court"), true);
  assertEquals(result.includes("[NAME]"), false);
});

Deno.test("preserves Constitutional Court", () => {
  const input = "Constitutional Court decision";
  const result = redactPII(input);
  assertEquals(result.includes("Constitutional Court"), true);
});

// ---------------------------------------------------------------------------
// Cyrillic names
// ---------------------------------------------------------------------------

Deno.test("redacts Cyrillic full name", () => {
  const input = "\u0418\u0432\u0430\u043D \u041F\u0435\u0442\u0440\u043E\u0432 \u043F\u043E\u0434\u0430\u043B \u0436\u0430\u043B\u043E\u0431\u0443";
  const result = redactPII(input);
  assertEquals(result.includes("[NAME]"), true);
  assertEquals(result.includes("\u0418\u0432\u0430\u043D"), false);
});

Deno.test("redacts Cyrillic full name with patronymic", () => {
  const input = "\u0418\u0432\u0430\u043D \u041F\u0435\u0442\u0440\u043E\u0432\u0438\u0447 \u0421\u0438\u0434\u043E\u0440\u043E\u0432 filed";
  const result = redactPII(input);
  assertEquals(result.includes("[NAME]"), true);
});

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

Deno.test("redacts email address", () => {
  const input = "Contact: user@example.com for details";
  const result = redactPII(input);
  assertEquals(result, "Contact: [EMAIL] for details");
});

Deno.test("redacts Armenian-domain email", () => {
  const input = "Email: ani.petrosyan@court.am sent";
  const result = redactPII(input);
  assertEquals(result.includes("[EMAIL]"), true);
  assertEquals(result.includes("ani.petrosyan"), false);
});

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

Deno.test("redacts Armenian phone +374", () => {
  const input = "Call +374 91 123456";
  const result = redactPII(input);
  assertEquals(result.includes("[PHONE]"), true);
  assertEquals(result.includes("123456"), false);
});

Deno.test("redacts local phone format", () => {
  const input = "Phone: 091-12-34-56";
  const result = redactPII(input);
  assertEquals(result.includes("[PHONE]"), true);
});

// ---------------------------------------------------------------------------
// Passport numbers
// ---------------------------------------------------------------------------

Deno.test("redacts Armenian passport AB1234567", () => {
  const input = "Passport: AB1234567 issued";
  const result = redactPII(input);
  assertEquals(result.includes("[PASSPORT]"), true);
  assertEquals(result.includes("AB1234567"), false);
});

Deno.test("redacts Armenian passport AM format", () => {
  const input = "Doc AM9876543";
  const result = redactPII(input);
  assertEquals(result.includes("[PASSPORT]"), true);
});

// ---------------------------------------------------------------------------
// Dates of birth
// ---------------------------------------------------------------------------

Deno.test("redacts date DD.MM.YYYY", () => {
  const input = "Born 15.03.1985 in Yerevan";
  const result = redactPII(input);
  assertEquals(result.includes("[DOB]"), true);
  assertEquals(result.includes("15.03.1985"), false);
});

Deno.test("redacts date DD/MM/YYYY", () => {
  const input = "DOB: 01/12/1990";
  const result = redactPII(input);
  assertEquals(result.includes("[DOB]"), true);
});

// ---------------------------------------------------------------------------
// Armenian addresses
// ---------------------------------------------------------------------------

Deno.test("redacts Armenian address with keyword", () => {
  // \u0570\u0561\u057D\u0581\u0565 = address
  const input = "\u0570\u0561\u057D\u0581\u0565: \u0535\u0580\u0587\u0561\u0576, \u0544\u0561\u0577\u057F\u0578\u0581\u056B \u057A\u0578\u0572\u0578\u057F\u0561 45";
  const result = redactPII(input);
  assertEquals(result.includes("[ADDRESS]"), true);
});

// ---------------------------------------------------------------------------
// Selective redaction
// ---------------------------------------------------------------------------

Deno.test("skips names when names=false", () => {
  const input = "John Smith at user@test.com";
  const result = redactPII(input, { names: false });
  assertEquals(result.includes("John Smith"), true);
  assertEquals(result.includes("[EMAIL]"), true);
});

Deno.test("skips emails when emails=false", () => {
  const input = "Email: user@test.com";
  const result = redactPII(input, { emails: false });
  assertEquals(result.includes("user@test.com"), true);
});

// ---------------------------------------------------------------------------
// redactForLog
// ---------------------------------------------------------------------------

Deno.test("redactForLog truncates long text", () => {
  const long = "A".repeat(1000);
  const result = redactForLog(long, 100);
  assertEquals(result.length < 120, true);
  assertEquals(result.endsWith("...[truncated]"), true);
});

Deno.test("redactForLog redacts and truncates", () => {
  const input = "User John Smith at user@test.com " + "x".repeat(600);
  const result = redactForLog(input, 200);
  assertEquals(result.includes("John Smith"), false);
  assertEquals(result.includes("[EMAIL]"), true);
  assertEquals(result.endsWith("...[truncated]"), true);
});

// ---------------------------------------------------------------------------
// redactAIOutput
// ---------------------------------------------------------------------------

Deno.test("redactAIOutput redacts all categories", () => {
  const input = "Name: \u0531\u0576\u056B \u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576, Phone: +374 91 123456, Email: test@example.com";
  const result = redactAIOutput(input);
  assertEquals(result.includes("\u0531\u0576\u056B"), false);
  assertEquals(result.includes("123456"), false);
  assertEquals(result.includes("test@example.com"), false);
});

// ---------------------------------------------------------------------------
// redactObject
// ---------------------------------------------------------------------------

Deno.test("redactObject strips PII from string values", () => {
  const obj = {
    name: "John Smith",
    count: 42,
    nested: { email: "user@test.com" },
  };
  const result = redactObject(obj);
  assertEquals((result.name as string).includes("[NAME]"), true);
  assertEquals(result.count, 42);
  assertEquals(((result.nested as Record<string, unknown>).email as string).includes("[EMAIL]"), true);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

Deno.test("handles empty string", () => {
  assertEquals(redactPII(""), "");
});

Deno.test("handles string with no PII", () => {
  const input = "Article 301 of the Criminal Code applies here.";
  assertEquals(redactPII(input), input);
});

Deno.test("mixed Armenian and Latin PII", () => {
  const input = "Claimant: \u0531\u0576\u056B \u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576, represented by John Smith";
  const result = redactPII(input);
  assertEquals(result.includes("\u0531\u0576\u056B"), false);
  assertEquals(result.includes("John Smith"), false);
  assertEquals(result.split("[NAME]").length >= 3, true); // at least 2 replacements
});
