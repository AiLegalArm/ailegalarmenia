/**
 * _shared/build-embedding-text.ts
 *
 * Unified embedding text builder for all legal document types.
 * Produces a single structured string optimised for vector search.
 *
 * Supports: knowledge_base, legal_practice_kb, legal_documents, chunks.
 */

// ── PII redaction (lightweight, deterministic) ──────────────────────────────

const PII_PATTERNS: Array<[RegExp, string]> = [
  // Armenian phone numbers +374…
  [/\+374[\s\-]?\d{2}[\s\-]?\d{2}[\s\-]?\d{2}[\s\-]?\d{2}/g, "[REDACTED_PHONE]"],
  // Generic international phones
  [/\+\d{1,3}[\s\-]?\(?\d{2,4}\)?[\s\-]?\d{3,4}[\s\-]?\d{2,4}/g, "[REDACTED_PHONE]"],
  // Emails
  [/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]"],
  // Armenian passport series AB/AM followed by digits
  [/\b(AB|AM)\s?\d{7,}\b/gi, "[REDACTED_ID]"],
  // Generic addresses with zip codes (Armenian 4-digit)
  [/\b\d{4}\s*,?\s*[\u0531-\u058F\u0561-\u0587]{2,}/g, "[REDACTED_ADDR]"],
];

// Legal terms whitelist — never redact these
const LEGAL_TERM_WHITELIST = [
  "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0564\u0561\u057F\u0561\u0580\u0561\u0576", // Cassation Court
  "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576", // Constitutional Court
  "\u0540\u0561\u0576\u0580\u0561\u057A\u0565\u057F\u0578\u0582\u0569\u0575\u0561\u0576", // Republic
];

function redactPII(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PII_PATTERNS) {
    result = result.replace(pattern, (match) => {
      // Skip if match is inside a legal term
      for (const term of LEGAL_TERM_WHITELIST) {
        if (text.includes(term) && match.length < 6) return match;
      }
      return replacement;
    });
  }
  return result;
}

// ── Normalisation ───────────────────────────────────────────────────────────

function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Try to cut at a sentence boundary
  const cut = text.lastIndexOf(".", maxChars - 50);
  return text.substring(0, cut > maxChars * 0.6 ? cut + 1 : maxChars) + "\n[...]";
}

// ── Language detection (heuristic) ──────────────────────────────────────────

function detectLang(text: string): string {
  const sample = text.substring(0, 2000);
  const armenian = (sample.match(/[\u0531-\u058F\u0561-\u0587]/g) || []).length;
  const cyrillic = (sample.match(/[\u0400-\u04FF]/g) || []).length;
  if (armenian > cyrillic && armenian > 30) return "hy";
  if (cyrillic > armenian && cyrillic > 30) return "ru";
  return "en";
}

// ── Doc type inference ──────────────────────────────────────────────────────

type DocType = "law" | "case" | "contract" | "other";

function inferDocType(doc: EmbeddingDoc): DocType {
  const dt = (doc.doc_type || doc.category || "").toLowerCase();
  if (
    dt.includes("law") || dt.includes("code") || dt.includes("_code") ||
    dt.includes("constitution") || dt.includes("treaty") || dt.includes("normative") ||
    dt.includes("criminal_code") || dt.includes("civil_code") || dt.includes("labor_code")
  ) return "law";
  if (
    dt.includes("decision") || dt.includes("court") || dt.includes("case") ||
    dt.includes("cassation") || dt.includes("appeal") || dt.includes("echr") ||
    dt.includes("first_instance") || dt.includes("constitutional")
  ) return "case";
  if (dt.includes("contract") || dt.includes("agreement")) return "contract";
  return "other";
}

// ── Extract structured fields ───────────────────────────────────────────────

function extractCitation(doc: EmbeddingDoc): string {
  const parts: string[] = [];
  if (doc.case_number_anonymized) parts.push(doc.case_number_anonymized);
  if (doc.document_number) parts.push(doc.document_number);
  if (doc.article_number) parts.push(`Art. ${doc.article_number}`);
  if (doc.echr_case_id) parts.push(`ECHR ${doc.echr_case_id}`);
  return parts.join(" | ") || "";
}

function extractCourtOrBody(doc: EmbeddingDoc): string {
  return doc.court_name || doc.court_type || doc.source_name || "";
}

function extractDate(doc: EmbeddingDoc): string {
  return doc.decision_date || doc.date_adopted || doc.date_effective || doc.version_date || "";
}

function extractTopics(doc: EmbeddingDoc): string {
  const topics: string[] = [];
  if (doc.keywords?.length) topics.push(...doc.keywords);
  if (doc.practice_category) topics.push(doc.practice_category);
  if (doc.key_violations?.length) topics.push(...doc.key_violations);
  if (doc.violation_type) topics.push(doc.violation_type);
  return topics.slice(0, 15).join(", ");
}

function extractNormsCited(doc: EmbeddingDoc): string {
  const norms: string[] = [];

  // applied_articles: [{act, articles: [{article, part}]}]
  if (Array.isArray(doc.applied_articles)) {
    for (const entry of doc.applied_articles as Array<{ act?: string; articles?: Array<{ article?: string; part?: string }> }>) {
      const act = entry.act || "";
      const arts = (entry.articles || [])
        .map((a) => a.part ? `${a.article}(${a.part})` : a.article)
        .filter(Boolean);
      if (act && arts.length) norms.push(`${act}: ${arts.join(", ")}`);
      else if (act) norms.push(act);
    }
  }

  // interpreted_norms
  if (Array.isArray(doc.interpreted_norms)) {
    for (const n of doc.interpreted_norms) {
      if (typeof n === "string") norms.push(n);
      else if (n && typeof n === "object" && "norm" in n) norms.push(String(n.norm));
    }
  }

  // echr_article
  if (doc.echr_article?.length) {
    norms.push(`ECHR Art. ${doc.echr_article.join(", ")}`);
  }

  return norms.slice(0, 20).join("; ");
}

function extractHoldings(doc: EmbeddingDoc): string {
  const holdings: string[] = [];

  if (doc.ratio_decidendi) holdings.push(doc.ratio_decidendi);
  if (doc.legal_principle) holdings.push(doc.legal_principle);
  if (doc.echr_principle_formula) holdings.push(doc.echr_principle_formula);

  // key_paragraphs
  if (Array.isArray(doc.key_paragraphs)) {
    for (const kp of doc.key_paragraphs.slice(0, 7)) {
      if (typeof kp === "string") holdings.push(kp);
      else if (kp && typeof kp === "object" && "text" in kp) holdings.push(String(kp.text));
    }
  }

  return holdings.slice(0, 10).map((h, i) => `- ${normaliseWhitespace(h).substring(0, 300)}`).join("\n");
}

function extractDispositive(doc: EmbeddingDoc): string {
  const parts: string[] = [];
  if (doc.outcome) parts.push(doc.outcome);
  // decision_map might have ruling
  if (doc.decision_map && typeof doc.decision_map === "object") {
    const dm = doc.decision_map as Record<string, unknown>;
    if (dm.ruling && typeof dm.ruling === "string") parts.push(dm.ruling);
    if (dm.final_ruling && typeof dm.final_ruling === "string") parts.push(dm.final_ruling);
  }
  return parts.join(" | ").substring(0, 500);
}

// ── Body text construction by doc type ──────────────────────────────────────

const MAX_BODY_CHARS = 3000; // leaves ~1000 chars for structured header fields within 4000 total

function buildBodyText(doc: EmbeddingDoc, docType: DocType): string {
  const raw = doc.content_text || "";
  const reasoning = doc.legal_reasoning_summary || "";

  let structured = "";

  if (docType === "case") {
    // Facts / Positions / Reasoning first, then remainder
    const sections: string[] = [];
    if (doc.facts_hy) sections.push(`[FACTS]\n${doc.facts_hy}`);
    if (reasoning) sections.push(`[REASONING]\n${reasoning}`);
    if (doc.judgment_hy) sections.push(`[JUDGMENT]\n${doc.judgment_hy}`);
    if (doc.procedural_aspect) sections.push(`[PROCEDURE]\n${doc.procedural_aspect}`);
    structured = sections.join("\n\n");
  } else if (docType === "law") {
    // Subject / definitions / key articles first
    if (doc.description) structured = `[SUBJECT]\n${doc.description}\n\n`;
    if (reasoning) structured += `[KEY_PROVISIONS]\n${reasoning}\n\n`;
  } else if (docType === "contract") {
    if (doc.description) structured = `[SUBJECT]\n${doc.description}\n\n`;
    if (doc.application_scope) structured += `[SCOPE]\n${doc.application_scope}\n\n`;
    if (doc.limitations_of_application) structured += `[LIMITATIONS]\n${doc.limitations_of_application}\n\n`;
  }

  // Combine: structured sections + raw body (truncated)
  const combined = structured
    ? `${structured}\n\n[BODY]\n${raw}`
    : raw;

  return truncate(normaliseWhitespace(combined), MAX_BODY_CHARS);
}

// ── Jurisdiction ────────────────────────────────────────────────────────────

function inferJurisdiction(doc: EmbeddingDoc): string {
  if (doc.jurisdiction) return doc.jurisdiction;
  const ct = (doc.court_type || "").toLowerCase();
  if (ct === "echr") return "ECHR";
  return "AM";
}

// ── Public interface ────────────────────────────────────────────────────────

/**
 * A superset of fields from knowledge_base, legal_practice_kb, legal_documents.
 * Pass whichever fields are available; missing fields are safely skipped.
 */
export interface EmbeddingDoc {
  // Common
  title?: string;
  content_text?: string;
  category?: string;
  doc_type?: string;
  description?: string;

  // Identifiers
  article_number?: string;
  document_number?: string;
  case_number_anonymized?: string;
  echr_case_id?: string;

  // Court / source
  court_type?: string;
  court_name?: string;
  source_name?: string;
  jurisdiction?: string;

  // Dates
  decision_date?: string;
  date_adopted?: string;
  date_effective?: string;
  version_date?: string;

  // Categorisation
  practice_category?: string;
  keywords?: string[];
  key_violations?: string[];
  violation_type?: string;
  echr_article?: string[];

  // Structured legal data
  applied_articles?: unknown;
  interpreted_norms?: unknown;
  decision_map?: unknown;
  key_paragraphs?: unknown;

  // Holdings / reasoning
  ratio_decidendi?: string;
  legal_principle?: string;
  echr_principle_formula?: string;
  echr_test_applied?: string;
  legal_reasoning_summary?: string;
  outcome?: string;

  // Sections (Armenian translations)
  facts_hy?: string;
  judgment_hy?: string;
  procedural_aspect?: string;
  application_scope?: string;
  limitations_of_application?: string;

  // Chunk-specific
  chunk_text?: string;
  chunk_type?: string;
}

/**
 * Build a single embedding-ready string for any legal document.
 *
 * @param doc  Document fields (superset — pass what you have)
 * @returns    Structured text ≤ ~12k chars, PII-redacted
 */
export function buildEmbeddingText(doc: EmbeddingDoc): string {
  const docType = inferDocType(doc);
  const lang = detectLang(doc.title || doc.content_text || "");
  const jurisdiction = inferJurisdiction(doc);

  const sections: string[] = [
    `DOC_TYPE: ${docType}`,
    `JURISDICTION: ${jurisdiction}`,
    `LANG: ${lang}`,
    `TITLE: ${normaliseWhitespace(doc.title || "")}`,
  ];

  const citation = extractCitation(doc);
  if (citation) sections.push(`CITATION: ${citation}`);

  const court = extractCourtOrBody(doc);
  if (court) sections.push(`COURT_OR_BODY: ${court}`);

  const date = extractDate(doc);
  if (date) sections.push(`DATE: ${date}`);

  const topics = extractTopics(doc);
  if (topics) sections.push(`TOPICS: ${topics}`);

  const norms = extractNormsCited(doc);
  if (norms) sections.push(`NORMS_CITED: ${norms}`);

  const holdings = extractHoldings(doc);
  if (holdings) sections.push(`HOLDINGS:\n${holdings}`);

  const dispositive = extractDispositive(doc);
  if (dispositive) sections.push(`DISPOSITIVE: ${dispositive}`);

  // Body text
  const body = buildBodyText(doc, docType);
  sections.push(`TEXT:\n${body}`);

  const raw = sections.join("\n");
  return redactPII(raw);
}

/**
 * Build embedding text for a chunk (smaller unit).
 * Prepends chunk metadata prefix, then the chunk text.
 */
export function buildChunkEmbeddingText(
  chunk: { chunk_text: string; chunk_type?: string; label?: string },
  parentTitle?: string,
): string {
  const parts: string[] = [];
  if (chunk.chunk_type) parts.push(`[${chunk.chunk_type}]`);
  if (chunk.label) parts.push(`(${chunk.label})`);
  if (parentTitle) parts.push(`// ${parentTitle}`);
  parts.push(normaliseWhitespace(chunk.chunk_text));

  const raw = parts.join(" ");
  return redactPII(truncate(raw, 4000));
}
