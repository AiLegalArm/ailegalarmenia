/**
 * Tests for legal-document-normalizer
 *
 * Fixtures use Unicode escapes for all Armenian text per project standards.
 * Run: deno test --allow-env supabase/functions/legal-document-normalizer/normalizer.test.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalize, validate } from "./index.ts";

// ─── FIXTURE 1: Criminal Code header excerpt ────────────────────────
const CRIMINAL_CODE_FIXTURE =
  "\u0540\u0531\u0545\u0531\u054d\u054f\u0531\u0546\u053b " +
  "\u0540\u0531\u0546\u0550\u0531\u054a\u0535\u054f\u0548\u0552\u054f\u0545\u0531\u0546 " +
  "\u0554\u0550\u0535\u0531\u053f\u0531\u0546 " +
  "\u0555\u0550\u0535\u0546\u054d\u0533\u053b\u0550\u0554\u0548\u0552\u054d\n\n" +
  "\u0538\u0576\u0564\u0578\u0582\u0576\u057e\u0565\u056c \u0567 2003 \u0569\u057e\u0561\u056f\u0561\u0576\u056b " +
  "\u0561\u057a\u0580\u056b\u056c\u056b 18-\u056b\u0576\n\n" +
  "\u0540\u0555-528-\u0546\n\n" +
  "\u0540\u0578\u0564\u057e\u0561\u056e 1\n" +
  "\u0540\u0561\u0575\u0561\u057d\u057f\u0561\u0576\u056b \u0540\u0561\u0576\u0580\u0561\u057a\u0565\u057f\u0578\u0582\u0569\u0575\u0561\u0576 " +
  "\u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0585\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584\u0568 " +
  "\u057d\u0561\u0570\u0574\u0561\u0576\u0578\u0582\u0574 \u0567 " +
  "\u0561\u0576\u0571\u056b\u0576\u0584\u056b \u0584\u0580\u0565\u0561\u056f\u0561\u0576 " +
  "\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0561\u057f\u057e\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568";

// ─── FIXTURE 2: Cassation decision header excerpt ───────────────────
const CASSATION_FIXTURE =
  "\u0540\u0531\u0545\u0531\u054d\u054f\u0531\u0546\u053b " +
  "\u0540\u0531\u0546\u0550\u0531\u054a\u0535\u054f\u0548\u0552\u054f\u0545\u0531\u0546\n" +
  "\u054e\u0543\u054c\u0531\u0532\u0535\u053f " +
  "\u0534\u0531\u054f\u0531\u0550\u0531\u0546\n\n" +
  "\u054f\u054f/0012/01/24\n\n" +
  "20 \u0570\u0578\u0582\u0576\u056b\u057d\u056b 2024 \u0569\u057e\u0561\u056f\u0561\u0576\u056b\n\n" +
  "\u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0563\u0578\u0580\u056e\u0578\u057e\n\n" +
  "\u054e\u0573\u056b\u057c \u0567 \u056f\u0561\u0575\u0561\u056e\u057e\u0565\u056c\n\n" +
  "\u0544\u0565\u0580\u056a\u0565\u056c \u057e\u0573\u057c\u0561\u056f\u0561\u0576 \u0562\u0578\u0572\u0578\u0584\u0568";

// ─── TEST: Criminal Code parsing ────────────────────────────────────

Deno.test("normalize: Criminal Code TXT -> doc_type=code, branch=criminal", async () => {
  const result = await normalize({
    fileName: "criminal_code_am.txt",
    mimeType: "text/plain",
    rawText: CRIMINAL_CODE_FIXTURE,
    sourceUrl: "https://arlis.am/criminal-code",
  });

  assertEquals(result.doc_type, "code");
  assertEquals(result.jurisdiction, "AM");
  assertEquals(result.branch, "criminal");
  assertEquals(result.source_name, "arlis.am");
  assertEquals(result.source_url, "https://arlis.am/criminal-code");
  assertExists(result.title);
  assertEquals(result.content_text, CRIMINAL_CODE_FIXTURE);
  assertEquals(result.is_active, true);
  assertEquals(result.ingestion.schema_version, "1.0");
  assertEquals(result.ingestion.pipeline, "legal-document-normalizer");

  // SHA-256 hash should be a 64-char hex string
  assertExists(result.ingestion.source_hash);
  assertEquals(result.ingestion.source_hash!.length, 64);
  assertEquals(/^[0-9a-f]{64}$/.test(result.ingestion.source_hash!), true);

  // Act number detection
  assertEquals(result.document_number, "\u0540\u0555-528-\u0546");

  // Court should be null for legislation
  assertEquals(result.court, null);

  // Validation must pass
  const errors = validate(result);
  assertEquals(errors.length, 0);
});

// ─── TEST: Cassation decision parsing ───────────────────────────────

Deno.test("normalize: Cassation decision -> doc_type=cassation_ruling, court metadata", async () => {
  const result = await normalize({
    fileName: "cassation_decision_2024.pdf",
    mimeType: "application/pdf",
    rawText: CASSATION_FIXTURE,
  });

  assertEquals(result.doc_type, "cassation_ruling");
  assertEquals(result.jurisdiction, "AM");
  assertEquals(result.branch, "criminal");

  // Court metadata
  assertExists(result.court);
  assertEquals(result.court!.court_type, "cassation");
  assertEquals(result.court!.case_number, "\u054f\u054f/0012/01/24");
  assertEquals(result.court!.outcome, "rejected");

  // Date extraction
  assertEquals(result.date_adopted, "2024-06-20");

  // No AI-generated fields
  assertEquals(result.applied_articles, null);
  assertEquals(result.key_violations, null);
  assertEquals(result.legal_reasoning_summary, null);
  assertEquals(result.decision_map, null);

  // Validation must pass
  const errors = validate(result);
  assertEquals(errors.length, 0);
});

// ─── TEST: Validation catches bad data ──────────────────────────────

Deno.test("validate: rejects invalid doc_type and empty content", () => {
  const badDoc = {
    doc_type: "invalid_type" as any,
    jurisdiction: "AM" as const,
    branch: "criminal" as any,
    title: "",
    title_alt: null,
    content_text: "",
    document_number: null,
    date_adopted: "not-a-date",
    date_effective: null,
    source_url: null,
    source_name: null,
    court: null,
    applied_articles: null,
    key_violations: null,
    legal_reasoning_summary: null,
    decision_map: null,
    ingestion: {
      pipeline: "test",
      ingested_at: new Date().toISOString(),
      schema_version: "1.0" as const,
      source_hash: null,
    },
    is_active: true,
  };

  const errors = validate(badDoc);
  assertEquals(errors.length >= 3, true);
});

// ─── TEST: Unknown file -> other ────────────────────────────────────

Deno.test("normalize: unknown file type -> doc_type=other", async () => {
  const result = await normalize({
    fileName: "random_document.docx",
    mimeType: "application/docx",
    rawText: "Some random content without Armenian legal markers.",
  });

  assertEquals(result.doc_type, "other");
  assertEquals(result.branch, "other");
  assertEquals(result.court, null);
  assertEquals(result.document_number, null);

  const errors = validate(result);
  assertEquals(errors.length, 0);
});

// ─── TEST: SHA-256 determinism ──────────────────────────────────────

Deno.test("normalize: same input produces same source_hash", async () => {
  const input = {
    fileName: "test.txt",
    mimeType: "text/plain",
    rawText: "Deterministic hash test content",
  };

  const result1 = await normalize(input);
  const result2 = await normalize(input);

  assertEquals(result1.ingestion.source_hash, result2.ingestion.source_hash);
});
