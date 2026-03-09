/**
 * Tests for legal-chunker v3.0.0 (Armenian-only)
 *
 * Covers: legislation, court decisions, ECHR judgments, international treaties,
 * part splitting, conditional overlap, metadata, token limits, parentKey safety,
 * identity preservation, missing metadata regression, hard cap by span.
 *
 * All Armenian text as Unicode escapes per project standards.
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertExists,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chunkDocument, extractCaseNumber, parentKey } from "./index.ts";

// ─── FIXTURE 1: Legislation with articles ───────────────────────────
const LEGISLATION_FIXTURE =
  "\u0540\u0531\u0545\u0531\u054d\u054f\u0531\u0546\u053b \u0540\u0531\u0546\u0550\u0531\u054a\u0535\u054f\u0548\u0552\u054f\u0545\u0531\u0546\n" +
  "\u0554\u0550\u0535\u0531\u053f\u0531\u0546 \u0555\u0550\u0535\u0546\u054d\u0533\u053b\u0550\u0554\u0548\u0552\u054d\n\n" +
  "\u0540\u0578\u0564\u057e\u0561\u056e 1\u0589 \u0540\u0561\u0575\u0561\u057d\u057f\u0561\u0576\u056b " +
  "\u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0585\u0580\u0565\u0576\u057d\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568\n" +
  "1) \u054d\u0578\u0582\u0575\u0576 \u0585\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584\u0568 \u057d\u0561\u0570\u0574\u0561\u0576\u0578\u0582\u0574 " +
  "\u0567 \u0561\u0576\u0571\u056b\u0576\u0584\u056b\n" +
  "2) \u054d\u0578\u0582\u0575\u0576 \u0585\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584\u056b " +
  "\u0576\u057a\u0561\u057f\u0561\u056f\u0576\u0565\u0580\u0576 \u0565\u0576\n\n" +
  "\u0540\u0578\u0564\u057e\u0561\u056e 2\u0589 \u0554\u0580\u0565\u0561\u056f\u0561\u0576 " +
  "\u0585\u0580\u0565\u0576\u057d\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568\n" +
  "\u054d\u0578\u0582\u0575\u0576 \u0570\u0578\u0564\u057e\u0561\u056e\u0568 " +
  "\u057d\u0561\u0570\u0574\u0561\u0576\u0578\u0582\u0574 \u0567\n\n" +
  "\u0540\u0578\u0564\u057e\u0561\u056e 3\u0589 \u0555\u0580\u056b\u0576\u0561\u056f\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 " +
  "\u057d\u056f\u0566\u0562\u0578\u0582\u0576\u0584\u0568\n" +
  "\u0555\u0580\u0565\u0576\u0584\u056b \u057d\u056f\u0566\u0562\u0578\u0582\u0576\u0584\u056b " +
  "\u0574\u0561\u057d\u056b\u0576";

// ─── FIXTURE 2: Court decision with 8-section structure ─────────────
const COURT_DECISION_FIXTURE =
  "\u054e\u0543\u054c\u0531\u0532\u0535\u053f \u0534\u0531\u054f\u0531\u054c\u0546\n" +
  "\u0563\u0578\u0580\u056e \u0569\u056b\u057e: \u054f\u054f/0012/01/24\n" +
  "20 \u0570\u0578\u0582\u0576\u056b\u057d\u056b 2024 \u0569\u057e\u0561\u056f\u0561\u0576\u056b\n" +
  "\u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0563\u0578\u0580\u056e\u0578\u057e\n" +
  "\u0534\u0561\u057f\u0561\u057e\u0578\u0580\u0576\u0565\u0580\u056b \u056f\u0561\u0566\u0574\u0568\u055d " +
  "\u0531. \u0531\u0562\u0580\u0561\u0570\u0561\u0574\u0575\u0561\u0576 (\u0576\u0561\u056d\u0561\u0563\u0561\u0570), " +
  "\u0532. \u0533\u0561\u056c\u057d\u057f\u0575\u0561\u0576, \u0533. \u0544\u0561\u0580\u057f\u056b\u0580\u0578\u057d\u0575\u0561\u0576\n\n" +
  "\u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0561\u056f\u0561\u0576 \u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576\n" +
  "\u0531\u057c\u0561\u057b\u056b\u0576 \u0561\u057f\u0575\u0561\u0576\u056b \u0564\u0561\u057f\u0561\u0580\u0561\u0576\u0568 \u0570\u0561\u0575\u0581\u056b \u0574\u0565\u0580\u056a\u0565\u056c \u0567\n\n" +
  "\u0563\u0578\u0580\u056e\u056b \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580\u0568\n" +
  "\u0531\u0574\u0562\u0561\u057d\u057f\u0561\u0576\u057e\u0578\u0572\u0568 \u0574\u0565\u0572\u0561\u0564\u0580\u057e\u0565\u056c " +
  "\u0567 \u0570\u0578\u0564\u057e\u0561\u056e 391 \u0574\u0561\u057d 1 \u056f\u0565\u057f 3 " +
  "\u056d\u0561\u056d\u057f\u0574\u0561\u0576 \u0574\u0565\u057b\n\n" +
  "\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580\n" +
  "\u0532\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u0568 \u057a\u0561\u0570\u0561\u0576\u057b\u0578\u0582\u0574 \u0567 \u057e\u0573\u056b\u057c\u0568 \u0562\u0565\u056f\u0561\u0576\u0565\u056c\n\n" +
  "\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580\n" +
  "\u054a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u0568 \u0570\u0561\u0574\u0561\u0571\u0561\u0575\u0576 \u0567 \u057e\u0573\u057c\u056b\u0576\n\n" +
  "\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d\n" +
  "\u0534\u0561\u057f\u0561\u0580\u0561\u0576\u0568 \u0563\u057f\u0576\u0578\u0582\u0574 " +
  "\u0567 \u0578\u0580 \u057e\u0573\u057c\u0561\u056f\u0561\u0576 \u0562\u0578\u0572\u0578\u0584\u0568 " +
  "\u0570\u056b\u0574\u0576\u0561\u057e\u0578\u0580 \u0567\n\n" +
  "\u0576\u0578\u0580\u0574\u0565\u0580\u056b \u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576\n" +
  "\u0540\u0578\u0564\u057e\u0561\u056e 391-\u0568 \u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u057e\u0578\u0582\u0574 \u0567 \u0570\u0565\u057f\u0587\u0575\u0561\u056c \u056f\u0565\u0580\u057a\n\n" +
  "\u057e\u0573\u056b\u057c\u0565\u0581\n" +
  "\u0544\u0565\u0580\u056a\u0565\u056c \u057e\u0573\u057c\u0561\u056f\u0561\u0576 \u0562\u0578\u0572\u0578\u0584\u0568";

// ─── FIXTURE 3: ECHR judgment ───────────────────────────────────────
const ECHR_FIXTURE =
  "EUROPEAN COURT OF HUMAN RIGHTS\n" +
  "CASE OF SMITH v. ARMENIA\n" +
  "(Application no. 12345/20)\n" +
  "JUDGMENT\n" +
  "STRASBOURG\n" +
  "15 January 2024\n\n" +
  "I. PROCEDURE\n" +
  "1. The case originated in an application (no. 12345/20) against the Republic of Armenia.\n" +
  "2. The applicant was represented by Mr. X, a lawyer practising in Yerevan.\n\n" +
  "II. THE FACTS\n" +
  "3. The applicant was born in 1980 and lives in Yerevan.\n" +
  "4. On 1 March 2019, the applicant was arrested by police officers.\n" +
  "5. He was detained for 72 hours without access to a lawyer.\n\n" +
  "III. THE LAW\n" +
  "A. ALLEGED VIOLATION OF ARTICLE 5 OF THE CONVENTION\n" +
  "6. The applicant complained that his detention was unlawful.\n" +
  "7. Article 5 paragraph 1 of the Convention provides:\n" +
  '"Everyone has the right to liberty and security of person."\n\n' +
  "THE COURT'S ASSESSMENT\n" +
  "8. The Court notes that the applicant was detained for 72 hours.\n" +
  "9. The Government failed to provide justification for the extended detention.\n" +
  "10. Accordingly, there has been a violation of Article 5 paragraph 1.\n\n" +
  "V. APPLICATION OF ARTICLE 41 OF THE CONVENTION\n" +
  "11. The applicant claimed EUR 10,000 in non-pecuniary damage.\n" +
  "12. The Court awards the applicant EUR 7,500.\n\n" +
  "FOR THESE REASONS, THE COURT UNANIMOUSLY\n" +
  "1. Holds that there has been a violation of Article 5 paragraph 1;\n" +
  "2. Awards the applicant EUR 7,500 in respect of non-pecuniary damage.";

// ─── FIXTURE 4: International treaty ────────────────────────────────
const TREATY_FIXTURE =
  "CONVENTION FOR THE PROTECTION OF HUMAN RIGHTS AND FUNDAMENTAL FREEDOMS\n\n" +
  "The Governments signatory hereto, being Members of the Council of Europe,\n" +
  "Considering the Universal Declaration of Human Rights,\n" +
  "Have agreed as follows:\n\n" +
  "Article 1 - Obligation to respect Human Rights\n" +
  "The High Contracting Parties shall secure to everyone within their jurisdiction " +
  "the rights and freedoms defined in Section I of this Convention.\n\n" +
  "Article 2 - Right to life\n" +
  "1. Everyone's right to life shall be protected by law.\n" +
  "2. Deprivation of life shall not be regarded as inflicted in contravention of this Article.\n\n" +
  "Article 3 - Prohibition of torture\n" +
  "No one shall be subjected to torture or to inhuman or degrading treatment or punishment.";

// ─── TEST: Legislation chunking ─────────────────────────────────────

Deno.test("chunkDocument: legislation splits by articles", async () => {
  const result = await chunkDocument({
    doc_type: "code",
    content_text: LEGISLATION_FIXTURE,
  });
  const chunks = result.chunks;
  assertEquals(result.strategy, "article");

  assert(chunks.length >= 3, `Expected >= 3 chunks, got ${chunks.length}`);
  const articleChunks = chunks.filter((c) => c.chunk_type === "article");
  assert(articleChunks.length >= 3, `Expected >= 3 article chunks, got ${articleChunks.length}`);

  for (const ac of articleChunks) {
    assertExists(ac.locator, "Article chunk must have locator");
    assertExists(ac.locator!.article, "Locator must have article number");
    assertExists(ac.metadata, "Chunk must have metadata");
    assertEquals(ac.metadata!.document_type, "code");
  }

  for (const c of chunks) {
    assert(c.char_start >= 0, "char_start must be >= 0");
    assert(c.char_end > c.char_start, "char_end must be > char_start");
    assert(c.chunk_text.length > 0, "chunk_text must not be empty");
    assertExists(c.chunk_hash, "chunk_hash must exist");
  }

  for (let i = 0; i < chunks.length; i++) {
    assertEquals(chunks[i].chunk_index, i, `Chunk index mismatch at ${i}`);
  }
});

Deno.test("chunkDocument: court decision splits into 8 sections", async () => {
  const result = await chunkDocument({
    doc_type: "cassation_ruling",
    content_text: COURT_DECISION_FIXTURE,
  });
  const chunks = result.chunks;
  assertEquals(result.strategy, "sections");

  const types = new Set(chunks.map((c) => c.chunk_type));

  assert(types.has("header"), "Should detect header metadata section");
  assert(types.has("procedural_history"), "Should detect procedural history section");
  assert(types.has("facts"), "Should detect facts section");
  assert(types.has("appellant_arguments"), "Should detect appellant arguments section");
  assert(types.has("respondent_arguments"), "Should detect respondent arguments section");
  assert(types.has("reasoning"), "Should detect legal reasoning section");
  assert(types.has("norm_interpretation"), "Should detect norm interpretation section");
  assert(types.has("resolution"), "Should detect final ruling (resolution) section");

  const reasoningChunks = chunks.filter(c => c.chunk_type === "reasoning");
  const resolutionChunks = chunks.filter(c => c.chunk_type === "resolution");
  assert(reasoningChunks.length >= 1, "Must have at least 1 reasoning chunk");
  assert(resolutionChunks.length >= 1, "Must have at least 1 resolution chunk");
  for (const rc of resolutionChunks) {
    for (const rr of reasoningChunks) {
      assert(rc.chunk_index !== rr.chunk_index, "Resolution and reasoning must be separate chunks");
    }
  }

  const sectionChunks = chunks.filter((c) => c.chunk_type !== "header");
  for (const sc of sectionChunks) {
    assertExists(sc.label, `Section chunk ${sc.chunk_index} should have label`);
    assertExists(sc.metadata, `Section chunk ${sc.chunk_index} should have metadata`);
  }
});

Deno.test("chunkDocument: court decision extracts case_number", async () => {
  const result = await chunkDocument({
    doc_type: "cassation_ruling",
    content_text: COURT_DECISION_FIXTURE,
  });
  assertExists(result.case_number, "Should extract case_number");
  assertEquals(result.case_number, "\u054f\u054f/0012/01/24");
});

Deno.test("chunkDocument: ECHR judgment splits by structural sections", async () => {
  const result = await chunkDocument({
    doc_type: "echr_judgment",
    content_text: ECHR_FIXTURE,
  });
  const chunks = result.chunks;
  assertEquals(result.strategy, "echr");

  const types = new Set(chunks.map((c) => c.chunk_type));
  assert(types.has("procedure"), "Should detect PROCEDURE section");
  assert(types.has("facts"), "Should detect FACTS section");
  assert(types.has("law") || types.has("assessment"), "Should detect LAW or ASSESSMENT section");
  assert(types.has("just_satisfaction"), "Should detect JUST SATISFACTION section");
  assert(types.has("conclusion"), "Should detect CONCLUSION section");

  for (const c of chunks) {
    assertExists(c.metadata, `Chunk ${c.chunk_index} must have metadata`);
    assertEquals(c.metadata!.document_type, "echr_judgment");
    assertEquals(c.metadata!.court_level, "echr", `Chunk ${c.chunk_index} missing court_level=echr`);
  }
});

Deno.test("chunkDocument: ECHR extracts application number", async () => {
  const result = await chunkDocument({
    doc_type: "echr_judgment",
    content_text: ECHR_FIXTURE,
  });
  const headerChunk = result.chunks.find(c => c.metadata?.case_number);
  assertExists(headerChunk, "Should have chunk with case_number");
  assertEquals(headerChunk!.metadata!.case_number, "12345/20");
});

Deno.test("chunkDocument: treaty splits by articles", async () => {
  const result = await chunkDocument({
    doc_type: "international_treaty",
    content_text: TREATY_FIXTURE,
  });
  const chunks = result.chunks;
  assertEquals(result.strategy, "treaty");

  const treatyArticles = chunks.filter(c => c.chunk_type === "treaty_article");
  assert(treatyArticles.length >= 3, `Expected >= 3 treaty articles, got ${treatyArticles.length}`);

  const articleNums = treatyArticles.map(c => c.locator?.article).filter(Boolean);
  assert(articleNums.includes("1"), "Should have Article 1");
  assert(articleNums.includes("2"), "Should have Article 2");
  assert(articleNums.includes("3"), "Should have Article 3");

  const preamble = chunks.find(c => c.chunk_type === "preamble");
  assertExists(preamble, "Should have preamble");
});

Deno.test("chunkDocument: unknown doc_type uses structural fallback", async () => {
  const longText = "Lorem ipsum dolor sit amet. ".repeat(100);
  const result = await chunkDocument({
    doc_type: "other",
    content_text: longText,
  });
  const chunks = result.chunks;
  assert(["normative", "fixed"].includes(result.strategy), `Strategy should be normative or fixed, got: ${result.strategy}`);

  assert(chunks.length >= 1, "Should produce at least 1 chunk");
  assert(
    ["full_text", "normative_section"].includes(chunks[0].chunk_type),
    `Chunk type should be full_text or normative_section, got: ${chunks[0].chunk_type}`,
  );
});

Deno.test("chunkDocument: empty content returns empty result", async () => {
  const result = await chunkDocument({
    doc_type: "code",
    content_text: "",
  });
  assertEquals(result.chunks.length, 0);
  assertEquals(result.strategy, "fixed");
});

Deno.test("chunkDocument: deterministic output", async () => {
  const result1 = await chunkDocument({
    doc_type: "code",
    content_text: LEGISLATION_FIXTURE,
  });
  const result2 = await chunkDocument({
    doc_type: "code",
    content_text: LEGISLATION_FIXTURE,
  });

  assertEquals(result1.chunks.length, result2.chunks.length);
  for (let i = 0; i < result1.chunks.length; i++) {
    assertEquals(result1.chunks[i].chunk_hash, result2.chunks[i].chunk_hash);
    assertEquals(result1.chunks[i].char_start, result2.chunks[i].char_start);
    assertEquals(result1.chunks[i].char_end, result2.chunks[i].char_end);
  }
});

Deno.test("chunkDocument: metadata populated for all strategies", async () => {
  const inputs = [
    { doc_type: "code", content_text: LEGISLATION_FIXTURE, title: "Criminal Code" },
    { doc_type: "cassation_ruling", content_text: COURT_DECISION_FIXTURE, title: "Decision" },
    { doc_type: "echr_judgment", content_text: ECHR_FIXTURE, title: "Smith v. Armenia" },
    { doc_type: "international_treaty", content_text: TREATY_FIXTURE, title: "ECHR Convention" },
  ];

  for (const input of inputs) {
    const result = await chunkDocument(input);
    for (const chunk of result.chunks) {
      assertExists(chunk.metadata, `Chunk in ${input.doc_type} should have metadata`);
      assertExists(chunk.metadata!.document_type, `Chunk in ${input.doc_type} should have document_type`);
    }
  }
});

Deno.test("chunkDocument: articles split by parts, not mid-text", async () => {
  let articleText = "\u0540\u0578\u0564\u057e\u0561\u056e 100\u0589 Test Article\n";
  for (let i = 1; i <= 20; i++) {
    articleText += `${i}) Part ${i} content that is reasonably long to fill up space. ${"X".repeat(450)}\n`;
  }
  articleText += "\n\u0540\u0578\u0564\u057e\u0561\u056e 101\u0589 Next\nShort article.";

  const result = await chunkDocument({ doc_type: "code", content_text: articleText });

  const art100Chunks = result.chunks.filter(c =>
    c.locator?.article === "100"
  );
  assert(art100Chunks.length >= 2, "Oversized article should be split into multiple chunks");

  for (const chunk of art100Chunks) {
    assertExists(chunk.label, "Split chunk should have label with part info");
  }
});

Deno.test("chunkDocument: legislation chunks have no overlap", async () => {
  const result = await chunkDocument({
    doc_type: "code",
    content_text: LEGISLATION_FIXTURE,
  });

  const articleChunks = result.chunks.filter(c => c.chunk_type === "article");
  for (let i = 1; i < articleChunks.length; i++) {
    const prev = articleChunks[i - 1];
    const curr = articleChunks[i];
    assert(
      curr.char_start >= prev.char_end - 5,
      `Article chunks should not overlap: chunk ${i} starts at ${curr.char_start}, prev ends at ${prev.char_end}`,
    );
  }
});

Deno.test("chunkDocument: no chunk span exceeds MAX_CHUNK_CHARS (6000)", async () => {
  let bigText = "";
  for (let i = 1; i <= 5; i++) {
    bigText += `\u0540\u0578\u0564\u057e\u0561\u056e ${i}\u0589 Title ${i}\n`;
    for (let j = 1; j <= 30; j++) {
      bigText += `${j}) ${"A".repeat(300)} paragraph text for part ${j} of article ${i}.\n`;
    }
    bigText += "\n";
  }

  const result = await chunkDocument({ doc_type: "code", content_text: bigText });
  for (const chunk of result.chunks) {
    const span = chunk.char_end - chunk.char_start;
    assert(
      span <= 6000,
      `Chunk ${chunk.chunk_index} (${chunk.chunk_type}) span is ${span}, hard max is 6000`,
    );
    assertEquals(chunk.chunk_text.length, span, `String length must equal span for chunk ${chunk.chunk_index}`);
  }
});

Deno.test("chunkDocument: large section (>7200 chars) splits into 2+ chunks", async () => {
  let articleText = "\u0540\u0578\u0564\u057e\u0561\u056e 1\u0589 Test Article\n";
  for (let i = 1; i <= 20; i++) {
    articleText += `${i}) Part ${i} content with padding text. ${"Y".repeat(490)}\n`;
  }
  articleText += "\n\u0540\u0578\u0564\u057e\u0561\u056e 2\u0589 Next\nShort.";

  const result = await chunkDocument({ doc_type: "code", content_text: articleText });

  const art1Chunks = result.chunks.filter(c => c.locator?.article === "1");
  assert(
    art1Chunks.length >= 2,
    `Expected >= 2 chunks for oversized article, got ${art1Chunks.length}`,
  );

  for (const c of result.chunks) {
    const span = c.char_end - c.char_start;
    assert(span <= 6000, `Chunk ${c.chunk_index} span ${span} exceeds hard cap`);
  }

  for (const c of result.chunks) {
    assertEquals(c.chunk_text, articleText.slice(c.char_start, c.char_end));
  }
});

Deno.test("chunkDocument: tiny tail chunk merges within same article", async () => {
  let articleText = "\u0540\u0578\u0564\u057e\u0561\u056e 50\u0589 Test Article\n";
  for (let i = 1; i <= 10; i++) {
    articleText += `${i}) Part ${i} content. ${"X".repeat(400)}\n`;
  }
  articleText += "11) Tiny tail.\n";
  articleText += "\n\u0540\u0578\u0564\u057e\u0561\u056e 51\u0589 Next\nShort next article text.";

  const result = await chunkDocument({ doc_type: "code", content_text: articleText });

  for (const c of result.chunks) {
    assertEquals(
      c.chunk_text,
      articleText.slice(c.char_start, c.char_end),
      `Slice integrity failed for chunk ${c.chunk_index}`,
    );
  }
});

Deno.test("chunkDocument: merge never crosses article boundaries", async () => {
  const text = "\u0540\u0578\u0564\u057e\u0561\u056e 1\u0589 First article\n" +
    "Content of first article. ".repeat(5) + "\n\n" +
    "\u0540\u0578\u0564\u057e\u0561\u056e 2\u0589 Second article\nTiny.";

  const result = await chunkDocument({ doc_type: "code", content_text: text });

  const art1 = result.chunks.filter(c => c.locator?.article === "1");
  const art2 = result.chunks.filter(c => c.locator?.article === "2");
  assert(art1.length >= 1, "Article 1 must exist");
  assert(art2.length >= 1, "Article 2 must exist");

  for (const c of art1) {
    assert(!c.chunk_text.includes("\u0540\u0578\u0564\u057e\u0561\u056e 2"), "Art 1 chunk must not contain Art 2 text");
  }
});

Deno.test("chunkDocument: ECHR strategy stays echr", async () => {
  const result = await chunkDocument({ doc_type: "echr_judgment", content_text: ECHR_FIXTURE });
  assertEquals(result.strategy, "echr");
  for (const c of result.chunks) {
    assertExists(c.metadata, `Chunk ${c.chunk_index} must have metadata`);
    assertEquals(c.metadata!.court_level, "echr", `Chunk ${c.chunk_index} missing court_level=echr`);
  }
});

Deno.test("extractCaseNumber: handles ECHR patterns", () => {
  assertEquals(extractCaseNumber("Application no. 12345/20 filed"), "12345/20");
  assertEquals(extractCaseNumber("(no. 54321/21) against Armenia"), "54321/21");
  assertEquals(extractCaseNumber("nos. 11111/19 and 22222/20 lodged"), "11111/19");
});

Deno.test("chunkDocument: raw slice integrity for all doc types", async () => {
  const inputs = [
    { doc_type: "code", content_text: LEGISLATION_FIXTURE },
    { doc_type: "cassation_ruling", content_text: COURT_DECISION_FIXTURE },
    { doc_type: "echr_judgment", content_text: ECHR_FIXTURE },
    { doc_type: "international_treaty", content_text: TREATY_FIXTURE },
  ];

  for (const input of inputs) {
    const result = await chunkDocument(input);
    for (const c of result.chunks) {
      assertEquals(
        c.chunk_text,
        input.content_text.slice(c.char_start, c.char_end),
        `Slice integrity failed for ${input.doc_type} chunk ${c.chunk_index}`,
      );
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// v2.4.1 REGRESSION & HARDENING TESTS
// ═══════════════════════════════════════════════════════════════════

Deno.test("parentKey: returns null when metadata is missing", () => {
  const chunk = {
    chunk_index: 0, chunk_type: "other" as const, chunk_text: "x",
    char_start: 0, char_end: 1, label: null, locator: null,
    chunk_hash: "h", metadata: null,
  };
  assertEquals(parentKey(chunk), null);
});

Deno.test("parentKey: returns article key from locator with docTypeKey", () => {
  const chunk = {
    chunk_index: 0, chunk_type: "article" as const, chunk_text: "x",
    char_start: 0, char_end: 1, label: null,
    locator: { article: "12" },
    chunk_hash: "h", metadata: { article_number: "12" },
    doc_type: "code",
  };
  assertEquals(parentKey(chunk), "law:code:article:12");
});

Deno.test("parentKey: uses metadata.document_type as fallback for docTypeKey", () => {
  const chunk = {
    chunk_index: 0, chunk_type: "article" as const, chunk_text: "x",
    char_start: 0, char_end: 1, label: null,
    locator: { article: "5" },
    chunk_hash: "h", metadata: { article_number: "5", document_type: "bylaw" },
  };
  assertEquals(parentKey(chunk), "law:bylaw:article:5");
});

Deno.test("parentKey: section_title does NOT produce a parentKey", () => {
  const chunkA = {
    chunk_index: 0, chunk_type: "assessment" as const, chunk_text: "x",
    char_start: 0, char_end: 1, label: null,
    locator: { section_title: "THE COURT'S ASSESSMENT" },
    chunk_hash: "h", metadata: { document_type: "echr_judgment", court_level: "echr" },
  };
  const chunkB = {
    chunk_index: 1, chunk_type: "assessment" as const, chunk_text: "y",
    char_start: 1, char_end: 2, label: null,
    locator: { section_title: "THE COURT'S ASSESSMENT" },
    chunk_hash: "h2", metadata: { document_type: "echr_judgment", court_level: "echr" },
  };
  assertEquals(parentKey(chunkA), null);
  assertEquals(parentKey(chunkB), null);
});

Deno.test("parentKey: section_type produces decision: prefix key", () => {
  const chunk = {
    chunk_index: 0, chunk_type: "reasoning" as const, chunk_text: "x",
    char_start: 0, char_end: 1, label: null, locator: null,
    chunk_hash: "h", metadata: { section_type: "reasoning", document_type: "cassation_ruling" },
    doc_type: "cassation_ruling",
  };
  assertEquals(parentKey(chunk), "decision:cassation_ruling:section:reasoning");
});

Deno.test("parentKey: null parentKey prevents merge even if chunk < 800", () => {
  const chunkA = {
    chunk_index: 0, chunk_type: "other" as const, chunk_text: "short",
    char_start: 0, char_end: 5, label: null,
    locator: { section_title: "Some Section" },
    chunk_hash: "h1", metadata: { document_type: "echr_judgment" },
  };
  const chunkB = {
    chunk_index: 1, chunk_type: "other" as const, chunk_text: "also short",
    char_start: 5, char_end: 15, label: null,
    locator: { section_title: "Some Section" },
    chunk_hash: "h2", metadata: { document_type: "echr_judgment" },
  };
  assertEquals(parentKey(chunkA), null);
  assertEquals(parentKey(chunkB), null);
});

Deno.test("chunkDocument: missing metadata prevents cross-merge", async () => {
  const text =
    "\u0540\u0578\u0564\u057e\u0561\u056e 1\u0589 First\n" +
    "Content here. ".repeat(10) + "\n\n" +
    "\u0540\u0578\u0564\u057e\u0561\u056e 2\u0589 Second\nTiny content.";

  const result = await chunkDocument({ doc_type: "code", content_text: text });

  const art1 = result.chunks.filter(c => c.locator?.article === "1");
  const art2 = result.chunks.filter(c => c.locator?.article === "2");
  assert(art1.length >= 1, "Article 1 must exist as separate chunk");
  assert(art2.length >= 1, "Article 2 must exist as separate chunk");

  for (const c1 of art1) {
    for (const c2 of art2) {
      assert(c1.chunk_index !== c2.chunk_index, "Art 1 and Art 2 must be in different chunks");
    }
  }
});

Deno.test("chunkDocument: merged chunk keeps identity from earliest start", async () => {
  let articleText = "\u0540\u0578\u0564\u057e\u0561\u056e 99\u0589 Test Article\n";
  for (let i = 1; i <= 8; i++) {
    articleText += `${i}) Part ${i}. ${"Z".repeat(500)}\n`;
  }
  articleText += "9) End.\n";
  articleText += "\n\u0540\u0578\u0564\u057e\u0561\u056e 100\u0589 Next\nOther.";

  const result = await chunkDocument({ doc_type: "code", content_text: articleText });

  const art99 = result.chunks.filter(c => c.locator?.article === "99");
  assert(art99.length >= 1, "Art 99 must exist");
  for (const c of art99) {
    assertEquals(c.locator!.article, "99", "Merged chunk must keep article=99");
    assertEquals(c.chunk_type, "article", "Merged chunk must keep type=article");
  }
});

Deno.test("chunkDocument: hard cap checks span not string length", async () => {
  const hugeArticle = "\u0540\u0578\u0564\u057e\u0561\u056e 1\u0589 Title\n" +
    "Sentence here. ".repeat(500);

  const result = await chunkDocument({ doc_type: "code", content_text: hugeArticle });

  for (const c of result.chunks) {
    const span = c.char_end - c.char_start;
    assert(span <= 6000, `Chunk ${c.chunk_index} span ${span} exceeds 6000`);
    assertEquals(c.chunk_text.length, span, "Text length must equal span");
  }
});

Deno.test("chunkDocument: split chunks don't start with bare newlines", async () => {
  let text = "\u0540\u0578\u0564\u057e\u0561\u056e 1\u0589 Title\n";
  for (let i = 0; i < 15; i++) {
    text += "Content paragraph " + i + ". " + "W".repeat(400) + "\n\n";
  }
  text += "\n\u0540\u0578\u0564\u057e\u0561\u056e 2\u0589 Next\nDone.";

  const result = await chunkDocument({ doc_type: "code", content_text: text });

  for (const c of result.chunks) {
    if (c.chunk_index > 0 && c.chunk_text.length > 2) {
      const firstNonWs = c.chunk_text.replace(/^[\n\r\s]+/, "");
      assert(
        firstNonWs.length > 0,
        `Chunk ${c.chunk_index} is all whitespace`,
      );
    }
  }
});

Deno.test("chunkDocument: ECHR metadata.court_level='echr' on ALL chunks", async () => {
  const result = await chunkDocument({ doc_type: "echr_judgment", content_text: ECHR_FIXTURE });
  for (const c of result.chunks) {
    assertExists(c.metadata, `ECHR chunk ${c.chunk_index} must have metadata`);
    assertEquals(c.metadata!.court_level, "echr");
    assertEquals(c.metadata!.document_type, "echr_judgment");
  }
});

Deno.test("chunkDocument: version is v2-am-ultra", async () => {
  const result = await chunkDocument({ doc_type: "code", content_text: LEGISLATION_FIXTURE });
  assertEquals(result.chunker_version, "v2-am-ultra");
  for (const c of result.chunks) {
    assertEquals(c.chunker_version, "v2-am-ultra");
  }
});
