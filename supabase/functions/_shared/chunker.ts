/**
 * Shared Legal Document Chunker — v2-am-ultra
 *
 * Armenian-only structural chunking for Republic of Armenia legal documents.
 * All Russian anchors and patterns have been removed.
 *
 * INVARIANT: Every chunk satisfies:
 *   rawText.slice(chunk.char_start, chunk.char_end) === chunk.chunk_text
 *
 * No .trim() on chunk_text. Offsets are computed from raw text indices only.
 * No split+join recomposition that would cause offset drift.
 * No synthetic chunks (table markdown, etc.) — only raw slices.
 *
 * Hashing: SHA-256 hex digest for all chunk_hash values.
 *
 * Strategies:
 * - Laws / Codes (code_or_law): chunk = one article (\u0540\u0578\u0564\u057e\u0561\u056e);
 *   oversized articles split by \u0544\u0561\u057d, then \u053f\u0565\u057f, then lettered (\u0561-\u0586), then paragraphs
 * - Court decisions (court_decision): chunk = logical section
 *   Markers: \u054a\u0531\u054c\u0536\u054e\u0535\u0551 (facts), \u054e\u0543\u054b\u054c\u0535\u0551/\u0555\u054c\u0548\u0547\u0535\u0551 (ruling)
 *   NEVER merge reasoning + ruling. Overlap only inside reasoning (max 10%).
 * - ECHR judgments: chunk = structural section (Procedure, Facts, Law, Assessment, etc.)
 * - International treaties: chunk = article; oversized articles split by points
 * - Registry tables (registry_table): chunk by row groups, never split a row
 * - Normative acts (normative_act): structural chunking by numbered sections
 *
 * IMPORTANT: No Armenian glyphs — all Unicode escapes \uXXXX.
 */

// ─── VERSION ────────────────────────────────────────────────────────

export const CHUNKER_VERSION = "v3-am-ru";

// ─── PHASE 0: TEXT CLEANUP ─────────────────────────────────────────

export interface CleanupResult {
  /** Text after Phase 0 cleanup — ready for structural chunking */
  cleaned: string;
  /** Number of lines removed by cleanup rules */
  removedLines: number;
}

/**
 * Phase 0 Text Cleanup v2 (AM-only).
 * Applied BEFORE doc-type inference and any char_start/char_end computation
 * so the slice invariant is always satisfied against the *cleaned* text.
 *
 * Steps:
 *  1. NFC normalize
 *  2. Replace null bytes \u0000
 *  3. Replace non-breaking spaces \u00A0 with regular space
 *  4. Normalize dash characters \u2010-\u2014 to '-'
 *  5. Collapse 3+ newlines \u2192 2
 *  6. Remove repeated header/footer lines (freq \u2265 3, regular interval)
 *  7. Remove page markers: /^[-]\s*\d+\s*[-]$/
 *  8. Remove Armenian page markers: /^\s*\u0567\u057b\s*\d+\s*$/gmi
 *  9. Collapse horizontal whitespace runs (3+) \u2192 single space
 */
export function cleanupTextV2(raw: string): CleanupResult {
  if (!raw) return { cleaned: "", removedLines: 0 };

  let text = raw;
  let removedLines = 0;

  // 1. NFC normalize
  text = text.normalize("NFC");

  // 2. Replace null bytes
  text = text.replace(/\u0000/g, "");

  // 3. Replace non-breaking spaces with regular space
  text = text.replace(/\u00A0/g, " ");

  // 4. Normalize dash characters \u2010-\u2014 to '-'
  text = text.replace(/[\u2010-\u2014]/g, "-");

  // 5. Collapse 3+ newlines -> 2
  text = text.replace(/\n{3,}/g, "\n\n");

  // 6. Remove repeated header/footer lines
  {
    const lines = text.split("\n");
    const freq = new Map<string, number[]>();
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.length === 0 || trimmed.length > 120) continue;
      const arr = freq.get(trimmed);
      if (arr) arr.push(i);
      else freq.set(trimmed, [i]);
    }
    const removeSet = new Set<number>();
    for (const [, indices] of freq) {
      if (indices.length < 3) continue;
      const gaps: number[] = [];
      for (let i = 1; i < indices.length; i++) {
        gaps.push(indices[i] - indices[i - 1]);
      }
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (mean < 2) continue;
      const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv < 0.6) {
        for (const idx of indices) removeSet.add(idx);
      }
    }
    if (removeSet.size > 0) {
      const filtered = lines.filter((_, i) => !removeSet.has(i));
      removedLines += lines.length - filtered.length;
      text = filtered.join("\n");
    }
  }

  // 7. Remove page markers: lines like "- 42 -", "-- 3 --"
  {
    const pageLines = text.split("\n");
    const PAGE_MARKER_RE = /^\s*[-]\s*\d+\s*[-]\s*$/;
    const beforeLen = pageLines.length;
    const afterLines = pageLines.filter(l => !PAGE_MARKER_RE.test(l));
    removedLines += beforeLen - afterLines.length;
    text = afterLines.join("\n");
  }

  // 7. Remove Armenian page markers: \u0567\u057b \d+ (էջ = page)
  {
    const pageLines = text.split("\n");
    const AM_PAGE_RE = /^\s*\u0567\u057b\s*\d+\s*$/i;
    const beforeLen = pageLines.length;
    const afterLines = pageLines.filter(l => !AM_PAGE_RE.test(l));
    removedLines += beforeLen - afterLines.length;
    text = afterLines.join("\n");
  }

  // 8. Collapse horizontal whitespace runs (3+) -> single space
  text = text.replace(/[^\S\n]{3,}/g, " ");

  return { cleaned: text, removedLines };
}

/** @deprecated Use cleanupTextV2 instead */
export function cleanupText(raw: string): CleanupResult {
  return cleanupTextV2(raw);
}

// ─── TYPES ──────────────────────────────────────────────────────────

const CHUNK_TYPES = [
  "header", "operative", "resolution", "reasoning", "facts", "dissent",
  "article", "preamble", "reference_list", "full_text", "other",
  // ECHR-specific
  "procedure", "law", "assessment", "conclusion", "just_satisfaction",
  // Court decision extended (8-section structure)
  "arguments", "legal_position",
  "procedural_history",
  "appellant_arguments",
  "respondent_arguments",
  "norm_interpretation",
  // International treaties
  "treaty_article",
  // Registry tables
  "registry_row_group",
  // Normative acts
  "normative_section",
  // Phase 2a: structural sub-units
  "section", "point",
] as const;
export type ChunkType = typeof CHUNK_TYPES[number];

export type InferredDocType =
  | "code_or_law"
  | "treaty"
  | "court_decision"
  | "registry_table"
  | "normative_act"
  | "other";

export interface LegalChunk {
  chunk_index: number;
  chunk_type: ChunkType;
  chunk_text: string;
  char_start: number;
  char_end: number;
  label: string | null;
  locator: ChunkLocator | null;
  chunk_hash: string;
  metadata: ChunkMetadata | null;
  doc_type?: string;
  chunker_version?: string;
  /** Phase 2a: text of the primary anchor that owns this chunk (e.g. "\u0421\u0442\u0430\u0442\u044c\u044f 42") */
  source_anchor?: string;
  /** Phase 2a: number of chars taken as overlap from previous chunk */
  overlap_prev?: number;
  /** Court meta fields — populated for court_decision chunks only */
  case_number?: string;
  court_name?: string;
  decision_date?: string;
}

export interface ChunkLocator {
  article?: string;
  part?: string;
  point?: string;
  section_title?: string;
}

export interface ChunkMetadata {
  document_type?: string;
  document_title?: string;
  article_number?: string;
  section_type?: string;
  court_level?: string;
  case_number?: string;
  court_name?: string;
  date?: string;
}

export interface LegalDocumentInput {
  doc_type: string;
  content_text: string;
  title?: string;
  court_level?: string;
  case_number?: string;
  date?: string;
}

export interface ChunkResult {
  chunks: LegalChunk[];
  strategy: "article" | "sections" | "echr" | "treaty" | "registry" | "normative" | "fixed";
  case_number?: string;
  chunker_version: string;
  warnings?: string[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

// ─── CONSTANTS ──────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4;

// Ultra-legal chunking v2 (AM-only) constants
const TARGET_CHUNK_CHARS = 4500;
const MAX_CHUNK_CHARS = 7200;
const MIN_CHUNK_CHARS = 1400;
const GLOBAL_OVERLAP_CHARS = 900;

// Legacy alias (kept for backward compat in edge cases)
const MIN_CHUNK_SIZE = 100;

const MAX_ARTICLE_CHARS = MAX_CHUNK_CHARS;

// Overlap: 10% for reasoning sections only
const REASONING_OVERLAP_RATIO = 0.10;

// Per-type caps (guardrails)
const CAP_LAW_CHUNKS_PER_FILE = 2500;
const CAP_DECISION_CHUNKS_PER_FILE = 40;
const CAP_ECHR_CHUNKS_PER_FILE = 70;

// ─── REGEX PATTERNS (Unicode-escaped Armenian) ──────────────────────

const ARTICLE_HEADER_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+(\d+(?:[.-]\d+)*)\s*[.\u0589]/g;
const ARTICLE_HEADER_NEWLINE_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\n(\d+(?:[.-]\d+)*)\s*[.\u0589]/g;
const ARTICLE_HEADER_SPLIT_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+[^\n]+\n(\d+(?:[.-]\d+)*)\.\s/g;

const ARTICLE_TITLE_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+\d+(?:[.-]\d+)*\s*[.\u0589]\s*([^\n]+)/;

const PART_LINE_RE = /^(\d+)\s*[.)]\s+/;

// ─── CASE NUMBER PATTERNS ──────────────────────────────────────────
const CASE_NUMBER_PATTERNS: RegExp[] = [
  /\u0563\u0578\u0580\u056e\s+\u0569\u056b\u057e[.:]?\s*([A-Z\u0531-\u0556]{1,5}[\-\/]\d[\d\-\/]+)/i,
  /\b([A-Z\u0531-\u0556]{2,5}[\-\/]\d{1,6}[\-\/]\d{2,4}(?:[\-\/]\d{2,4})?)\b/,
  
  // ECHR application number: "no. 12345/20" or "(no. 12345/20)"
  /\bno\.\s*(\d{3,6}\/\d{2,4})\b/i,
  // ECHR: "nos. 12345/20 and 54321/21" — capture first number
  /\bnos\.\s*(\d{3,6}\/\d{2,4})\s+and\b/i,
  // ECHR: "Application no. 12345/20"
  /\bApplication\s+no\.\s*(\d{3,6}\/\d{2,4})\b/i,
];

export function extractCaseNumber(text: string): string | undefined {
  const header = text.slice(0, 2000);
  for (const pattern of CASE_NUMBER_PATTERNS) {
    const m = header.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

// ─── DATE EXTRACTION ───────────────────────────────────────────────

const DATE_PATTERNS: RegExp[] = [
  /(\d{1,2}[.\/]\d{1,2}[.\/]\d{4})/,
  /(\d{1,2}\s+\u0570\u0578\u0582\u0576\u056b\u057d\u056b\s+\d{4})/i,
  /(\d{1,2}\s+\u0570\u0578\u056f\u057f\u0565\u0574\u0562\u0565\u0580\u056b\s+\d{4})/i,
  /(\d{4}-\d{2}-\d{2})/,
];

function extractDate(text: string): string | undefined {
  const header = text.slice(0, 2000);
  for (const pattern of DATE_PATTERNS) {
    const m = header.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}

// ─── COURT META EXTRACTION ─────────────────────────────────────────

export interface CourtMeta {
  case_number?: string;
  court_name?: string;
  decision_date?: string;
}

// Armenian case number: e.g. \u0535\u053f\u0534/0229/01/16
const COURT_CASE_NUMBER_RE = /([\u0531-\u0556]{1,6}\s*\/\s*\d{2,6}\s*\/\s*\d{1,2}\s*\/\s*\d{2,4})/u;

// Court name patterns
const COURT_NAME_RE = /(\u0540\u0540\s+\u054e\u0573\u057c\u0561\u0562\u0565\u056f\s+\u0564\u0561\u057f\u0561\u0580\u0561\u0576|\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579\s+\u0564\u0561\u057f\u0561\u0580\u0561\u0576|\u0531\u057c\u0561\u057b\u056b\u0576\s+\u0561\u057f\u0575\u0561\u0576\u056b\s+\u0564\u0561\u057f\u0561\u0580\u0561\u0576)/u;

// Decision date
const COURT_DATE_RE = /(\d{2}[.\/]\d{2}[.\/]\d{4}|\d{4}-\d{2}-\d{2})/;

/**
 * Extract structured court metadata from cleaned text.
 * Scans first 3000 chars for case number, court name, and decision date.
 */
export function extractCourtMeta(cleanedText: string): CourtMeta {
  const meta: CourtMeta = {};
  if (!cleanedText) return meta;

  const header = cleanedText.slice(0, 3000);

  // Case number
  const cnMatch = header.match(COURT_CASE_NUMBER_RE);
  if (cnMatch && cnMatch[1]) {
    // Normalize: remove spaces around "/"
    meta.case_number = cnMatch[1].replace(/\s*\/\s*/g, "/");
  }

  // Court name
  const courtMatch = header.match(COURT_NAME_RE);
  if (courtMatch && courtMatch[1]) {
    meta.court_name = courtMatch[1].trim();
  }

  // Decision date
  const dateMatch = header.match(COURT_DATE_RE);
  if (dateMatch && dateMatch[1]) {
    meta.decision_date = dateMatch[1].trim();
  }

  return meta;
}

// ─── SHA-256 HASHING ───────────────────────────────────────────────

/**
 * Async SHA-256 hex digest using Web Crypto API (Deno/Edge compatible).
 * Replaces the old FNV-1a placeholder.
 */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Finalize chunk hashes: compute real SHA-256 for all chunks in a batch.
 * Called once after all chunks are assembled.
 */
async function finalizeHashes(chunks: LegalChunk[]): Promise<void> {
  await Promise.all(chunks.map(async (c) => {
    c.chunk_hash = await sha256Hex(c.chunk_text);
  }));
}

/**
 * Create a chunk from a raw slice of the original text.
 * INVARIANT: chunk_text === rawText.slice(charStart, charEnd)
 * No trimming. The caller must provide exact slice boundaries.
 */
function makeChunk(
  index: number,
  type: ChunkType,
  charStart: number,
  charEnd: number,
  rawText: string,
  label: string | null,
  locator: ChunkLocator | null,
  metadata: ChunkMetadata | null = null,
  docType?: string,
): LegalChunk {
  const text = rawText.slice(charStart, charEnd);
  return {
    chunk_index: index,
    chunk_type: type,
    chunk_text: text,
    char_start: charStart,
    char_end: charEnd,
    label,
    locator,
    chunk_hash: "", // populated by finalizeHashes()
    metadata,
    doc_type: docType,
    chunker_version: CHUNKER_VERSION,
  };
}

// ─── PARENT KEY (single source of truth for merge boundaries) ──────

/**
 * Returns a deterministic key identifying the structural parent of a chunk.
 * Returns null if parent cannot be reliably determined — in which case
 * merge MUST NOT happen.
 */
export function parentKey(chunk: LegalChunk): string | null {
  const docTypeKey = chunk.doc_type || chunk.metadata?.document_type || "_";

  // 1. Locator article takes highest priority
  if (chunk.locator?.article) {
    return `law:${docTypeKey}:article:${chunk.locator.article}`;
  }
  // 2. Metadata article_number
  if (chunk.metadata?.article_number) {
    return `law:${docTypeKey}:article:${chunk.metadata.article_number}`;
  }
  // 3. Metadata section_type (for court decisions / ECHR)
  if (chunk.metadata?.section_type && chunk.metadata.section_type !== "header") {
    return `decision:${docTypeKey}:section:${chunk.metadata.section_type}`;
  }
  // 4. locator.section_title is intentionally NOT used as parentKey
  //    (too high risk of false merges across unrelated sections)
  // 5. Cannot determine — return null (no merge allowed)
  return null;
}

/**
 * Two chunks share the same parent if and only if both have
 * a non-null parentKey AND those keys are identical.
 */
function sameParent(a: LegalChunk, b: LegalChunk): boolean {
  const ka = parentKey(a);
  const kb = parentKey(b);
  if (ka === null || kb === null) return false;
  return ka === kb;
}

// ─── RAW TEXT INDEX SCANNING ────────────────────────────────────────

interface RawParagraph {
  start: number;
  end: number;
}

function findParagraphs(raw: string): RawParagraph[] {
  const paragraphs: RawParagraph[] = [];
  const breakRe = /\n\n+/g;
  let lastEnd = 0;
  let m: RegExpExecArray | null;

  while ((m = breakRe.exec(raw)) !== null) {
    if (m.index > lastEnd) {
      paragraphs.push({ start: lastEnd, end: m.index });
    }
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < raw.length) {
    paragraphs.push({ start: lastEnd, end: raw.length });
  }
  return paragraphs;
}

interface RawLine {
  start: number;
  end: number;
}

function findLines(raw: string): RawLine[] {
  const lines: RawLine[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const nlIdx = raw.indexOf("\n", pos);
    if (nlIdx === -1) {
      lines.push({ start: pos, end: raw.length });
      break;
    }
    lines.push({ start: pos, end: nlIdx });
    pos = nlIdx + 1;
  }
  return lines;
}

// ─── DETERMINISTIC DOC TYPE INFERENCE (from text content) ──────────

// AM article anchors
const ARTICLE_DETECT_AM_RE = /\u0540\u0578\u0564\u057e\u0561\u056e\s+\d/;
// RU article anchors: \u0421\u0442\u0430\u0442\u044c\u044f / \u0421\u0442.
const ARTICLE_DETECT_RU_RE = /(?:\u0421\u0442\u0430\u0442\u044c\u044f|\u0421\u0442\.)\s*\d/;

const TREATY_DETECT_RE = /\u0540\u0561\u0574\u0561\u0571\u0561\u0575\u0576\u0561\u0563\u056b\u0580/i;

// AM court markers
const COURT_DECISION_AM_RE = /\u054a\u0531\u054c\u0536\u054e\u0535\u0551|\u054e\u0543\u054b\u054c\u0535\u0551|\u0555\u054c\u0548\u0547\u0535\u0551/;
// RU court markers: \u0423\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b / \u0420\u0415\u0428\u0418\u041b / \u041f\u041e\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b / \u041c\u041e\u0422\u0418\u0412\u0418\u0420\u041e\u0412\u041e\u0427
const COURT_DECISION_RU_RE = /\u0423\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b|\u0420\u0415\u0428\u0418\u041b|\u041f\u041e\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b|\u041c\u041e\u0422\u0418\u0412\u0418\u0420\u041e\u0412\u041e\u0427/;

/**
 * Infer document type from raw text content (heuristic analysis).
 * Priority: court_decision > code_or_law > treaty > registry > normative > other
 */
export function inferDocTypeFromText(text: string): InferredDocType {
  if (!text || text.length === 0) return "other";

  const sample = text.slice(0, 5000);

  // Court decision takes priority (AM + RU)
  if (COURT_DECISION_AM_RE.test(sample) || COURT_DECISION_RU_RE.test(sample)) {
    return "court_decision";
  }

  // Law / code detection (AM + RU article anchors)
  if (ARTICLE_DETECT_AM_RE.test(sample)) {
    const articleCount = (sample.match(/\u0540\u0578\u0564\u057e\u0561\u056e\s+\d/g) || []).length;
    if (articleCount >= 2) return "code_or_law";
  }
  if (ARTICLE_DETECT_RU_RE.test(sample)) {
    const articleCount = (sample.match(/(?:\u0421\u0442\u0430\u0442\u044c\u044f|\u0421\u0442\.)\s*\d/g) || []).length;
    if (articleCount >= 2) return "code_or_law";
  }

  if (TREATY_DETECT_RE.test(sample)) return "treaty";
  if (isRegistryTable(text)) return "registry_table";

  const hasNumberedSections = /^\s*\d+[.)]\s+/m.test(sample);
  const hasRomanSections = /^[IVX]+\.\s+/m.test(sample);
  if (hasNumberedSections || hasRomanSections) return "normative_act";

  return "other";
}

/** @deprecated Use inferDocTypeFromText instead */
export const inferDocType = inferDocTypeFromText;

function isRegistryTable(text: string): boolean {
  const firstChunk = text.slice(0, 5000);
  let tableLineCount = 0;
  const pipeLineRe = /^\s*\d+\s*[.|)]\s*.+\|.+/gm;
  const tabLineRe = /^\s*\d+\s*[.|)]\s*.+\t.+/gm;

  let m: RegExpExecArray | null;
  while ((m = pipeLineRe.exec(firstChunk)) !== null) tableLineCount++;
  while ((m = tabLineRe.exec(firstChunk)) !== null) tableLineCount++;

  return tableLineCount >= 5;
}

// ─── PHASE 2a: LEGISLATION CHUNKER (Laws & Codes) ──────────────────

// Primary anchors — article-level boundaries
// Armenian: \u0540\u0578\u0564\u057e\u0561\u056e
const PRIMARY_ANCHOR_AM = /^\s*\u0540\u0578\u0564\u057e\u0561\u056e\s+(\d+(?:[.\-]\d+)*)/gm;
// Russian: \u0421\u0442\u0430\u0442\u044c\u044f / \u0421\u0442.
const PRIMARY_ANCHOR_RU = /^\s*(?:\u0421\u0442\u0430\u0442\u044c\u044f|\u0421\u0442\.)\s*(\d+(?:[.\-]\d+)*)/gm;

// Structural anchors — chapter/section
// Armenian: \u0533\u056c\u0578\u0582\u056d / \u0532\u0561\u056a\u056b\u0576
const STRUCTURAL_ANCHOR_AM = /^\s*(?:\u0533\u056c\u0578\u0582\u056d|\u0532\u0561\u056a\u056b\u0576)\s+\d+/gm;
// Russian: \u0413\u043b\u0430\u0432\u0430 / \u0420\u0430\u0437\u0434\u0435\u043b
const STRUCTURAL_ANCHOR_RU = /^\s*(?:\u0413\u043b\u0430\u0432\u0430|\u0420\u0430\u0437\u0434\u0435\u043b)\s+\d+/gm;

// Part anchor
// Armenian: \u0544\u0561\u057d
const PART_ANCHOR_AM = /^\s*\u0544\u0561\u057d\s+(\d+(?:[.\-]\d+)*)/gm;
// Russian: \u0427\u0430\u0441\u0442\u044c
const PART_ANCHOR_RU = /^\s*\u0427\u0430\u0441\u0442\u044c\s+(\d+(?:[.\-]\d+)*)/gm;

// Point anchor
// Armenian: \u053f\u0565\u057f
const POINT_ANCHOR_AM = /^\s*\u053f\u0565\u057f\s+(\d+(?:[.\-]\d+)*)/gm;
// Russian: \u041f\u0443\u043d\u043a\u0442
const POINT_ANCHOR_RU = /^\s*\u041f\u0443\u043d\u043a\u0442\s+(\d+(?:[.\-]\d+)*)/gm;

// Lettered sub-points (Armenian lowercase: \u0561-\u0586)
const LETTERED_ANCHOR_AM = /^\s*(?:\(?[\u0561-\u0586]\)?[).]|[\u0561-\u0586][).])\s+/gmi;
// Russian lettered sub-points: \u0430)-\u044f)
const LETTERED_ANCHOR_RU = /^\s*(?:\(?[\u0430-\u044f]\)?[).]|[\u0430-\u044f][).])\s+/gmi;

// Legacy combined secondary (kept for backward compat)
const SECONDARY_ANCHOR_AM = /^\s*(?:\u0544\u0561\u057d|\u053f\u0565\u057f)\s+\d+/gm;

interface AnchorMatch {
  index: number;
  /** The anchor text */
  anchorText: string;
  /** Extracted number (e.g. "42" or "42.1") */
  number: string;
  /** Which anchor tier produced this match */
  tier: "primary" | "structural" | "secondary" | "lettered";
}

/**
 * Find all matches for a set of anchor regexes in `text`.
 */
function findAnchors(text: string, patterns: RegExp[], tier: AnchorMatch["tier"]): AnchorMatch[] {
  const matches: AnchorMatch[] = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, "gm");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        index: m.index,
        anchorText: m[0].trim(),
        number: m[1] || "",
        tier,
      });
    }
  }
  matches.sort((a, b) => a.index - b.index);
  // Deduplicate close matches (within 5 chars)
  const deduped: AnchorMatch[] = [];
  for (const am of matches) {
    const last = deduped[deduped.length - 1];
    if (!last || am.index - last.index > 5) {
      deduped.push(am);
    }
  }
  return deduped;
}

interface RawSegment {
  start: number;
  end: number;
  anchorText: string;
  number: string;
  tier: AnchorMatch["tier"];
}

/**
 * Split text into segments by anchor positions.
 * Each segment starts at an anchor and extends to the next anchor (or end of text).
 * Text before the first anchor becomes a "preamble" segment with empty anchorText.
 */
function splitByAnchors(text: string, anchors: AnchorMatch[]): RawSegment[] {
  const segments: RawSegment[] = [];
  if (anchors.length === 0) {
    segments.push({ start: 0, end: text.length, anchorText: "", number: "", tier: "primary" });
    return segments;
  }
  // Preamble before first anchor
  if (anchors[0].index > 0) {
    segments.push({ start: 0, end: anchors[0].index, anchorText: "", number: "", tier: "primary" });
  }
  for (let i = 0; i < anchors.length; i++) {
    const end = i + 1 < anchors.length ? anchors[i + 1].index : text.length;
    segments.push({
      start: anchors[i].index,
      end,
      anchorText: anchors[i].anchorText,
      number: anchors[i].number,
      tier: anchors[i].tier,
    });
  }
  return segments;
}

/**
 * Split a single oversized segment at TARGET with GLOBAL_OVERLAP_CHARS overlap.
 * Returns sub-segment boundaries as [start, end, overlap_prev] tuples.
 */
function splitAtTargetWithOverlap(
  rawText: string,
  segStart: number,
  segEnd: number,
): Array<{ start: number; end: number; overlapPrev: number }> {
  const results: Array<{ start: number; end: number; overlapPrev: number }> = [];
  let pos = segStart;
  let isFirst = true;

  while (pos < segEnd) {
    const remaining = segEnd - pos;
    if (remaining <= TARGET_CHUNK_CHARS) {
      results.push({ start: pos, end: segEnd, overlapPrev: isFirst ? 0 : GLOBAL_OVERLAP_CHARS });
      break;
    }

    // Find best break point within TARGET range
    const searchEnd = Math.min(pos + TARGET_CHUNK_CHARS, segEnd);
    const slice = rawText.slice(pos, searchEnd);
    let bp = -1;

    // Try paragraph break
    const dnl = slice.lastIndexOf("\n\n");
    if (dnl > MIN_CHUNK_CHARS) bp = dnl + 2;

    // Try single newline
    if (bp === -1) {
      const snl = slice.lastIndexOf("\n");
      if (snl > MIN_CHUNK_CHARS) bp = snl + 1;
    }

    // Try sentence
    if (bp === -1) {
      const sentRe = /[.!?\u0589]\s/g;
      let lastSent = -1;
      let sm: RegExpExecArray | null;
      while ((sm = sentRe.exec(slice)) !== null) {
        if (sm.index > MIN_CHUNK_CHARS) lastSent = sm.index + sm[0].length;
      }
      if (lastSent > 0) bp = lastSent;
    }

    // Try whitespace
    if (bp === -1) {
      const wsIdx = slice.lastIndexOf(" ", TARGET_CHUNK_CHARS);
      if (wsIdx > MIN_CHUNK_CHARS) bp = wsIdx + 1;
    }

    if (bp <= 0) bp = TARGET_CHUNK_CHARS;

    results.push({ start: pos, end: pos + bp, overlapPrev: isFirst ? 0 : GLOBAL_OVERLAP_CHARS });
    // Next chunk starts overlap_chars before the end of current chunk
    pos = pos + bp - GLOBAL_OVERLAP_CHARS;
    if (pos <= results[results.length - 1].start) {
      // Safety: guarantee forward progress
      pos = results[results.length - 1].end;
    }
    isFirst = false;
  }

  return results;
}

/**
 * Split an oversized article segment using tiered anchor cascade:
 * Part (\u0544\u0561\u057d) → Point (\u053f\u0565\u057f) → Lettered (\u0561-\u0586) → paragraph → fallback overlap split.
 * Each tier only applies to sub-segments still > MAX after the previous tier.
 */
function splitOversizedArticleTiered(
  rawText: string,
  segStart: number,
  segEnd: number,
  segText: string,
): Array<{ start: number; end: number; overlapPrev: number }> {
  type SubSeg = { start: number; end: number; overlapPrev: number };

  // Helper: try to split segments by a set of anchors
  function trySplitByAnchors(
    segs: SubSeg[],
    patterns: RegExp[],
    tier: AnchorMatch["tier"],
  ): SubSeg[] {
    const result: SubSeg[] = [];
    for (const ss of segs) {
      if (ss.end - ss.start <= MAX_CHUNK_CHARS) {
        result.push(ss);
        continue;
      }
      const localText = rawText.slice(ss.start, ss.end);
      const anchors = findAnchors(localText, patterns, tier);
      if (anchors.length > 0) {
        const subSegs = splitByAnchors(localText, anchors);
        for (const sub of subSegs) {
          result.push({
            start: sub.start + ss.start,
            end: sub.end + ss.start,
            overlapPrev: 0,
          });
        }
      } else {
        result.push(ss);
      }
    }
    return result;
  }

  // Helper: split by paragraphs for segments still > MAX
  function trySplitByParagraphs(segs: SubSeg[]): SubSeg[] {
    const result: SubSeg[] = [];
    for (const ss of segs) {
      if (ss.end - ss.start <= MAX_CHUNK_CHARS) {
        result.push(ss);
        continue;
      }
      const localText = rawText.slice(ss.start, ss.end);
      const paragraphs = findParagraphs(localText);
      if (paragraphs.length > 1) {
        let groupStart = ss.start;
        for (const p of paragraphs) {
          const absEnd = p.end + ss.start;
          if (absEnd - groupStart > TARGET_CHUNK_CHARS && groupStart < p.start + ss.start) {
            result.push({ start: groupStart, end: p.start + ss.start, overlapPrev: 0 });
            groupStart = p.start + ss.start;
          }
        }
        if (groupStart < ss.end) {
          result.push({ start: groupStart, end: ss.end, overlapPrev: 0 });
        }
      } else {
        result.push(ss);
      }
    }
    return result;
  }

  // Helper: final fallback for anything still > MAX
  function applyFallback(segs: SubSeg[]): SubSeg[] {
    const result: SubSeg[] = [];
    for (const ss of segs) {
      if (ss.end - ss.start > MAX_CHUNK_CHARS) {
        result.push(...splitAtTargetWithOverlap(rawText, ss.start, ss.end));
      } else {
        result.push(ss);
      }
    }
    return result;
  }

  // Start with the whole segment
  let segments: SubSeg[] = [{ start: segStart, end: segEnd, overlapPrev: 0 }];

  // Tier 1: Part (\u0544\u0561\u057d / \u0427\u0430\u0441\u0442\u044c)
  segments = trySplitByAnchors(segments, [PART_ANCHOR_AM, PART_ANCHOR_RU], "secondary");

  // Tier 2: Point (\u053f\u0565\u057f / \u041f\u0443\u043d\u043a\u0442)
  segments = trySplitByAnchors(segments, [POINT_ANCHOR_AM, POINT_ANCHOR_RU], "secondary");

  // Tier 3: Lettered (\u0561-\u0586 / \u0430-\u044f)
  segments = trySplitByAnchors(segments, [LETTERED_ANCHOR_AM, LETTERED_ANCHOR_RU], "lettered");

  // Tier 4: Paragraph split
  segments = trySplitByParagraphs(segments);

  // Tier 5: Fallback overlap split
  segments = applyFallback(segments);

  return segments;
}

/**
 * Ultra-legal legislation chunker v2 (AM-only).
 *
 * Algorithm:
 * 1. splitByAnchors(primary) \u2192 article-level segments
 * 2. For each segment:
 *    - len \u2264 MAX \u2192 1 chunk
 *    - len > MAX \u2192 tiered cascade: Part \u2192 Point \u2192 Lettered \u2192 paragraph \u2192 fallback
 * 3. Merge undersized chunks (< MIN) with next, but ONLY within same parentKey
 */
function chunkLegislation(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  const primaryAnchors = findAnchors(rawText, [PRIMARY_ANCHOR_AM, PRIMARY_ANCHOR_RU], "primary");

  const docMeta: ChunkMetadata = {
    document_type: docInput.doc_type,
    document_title: docInput.title,
  };

  if (primaryAnchors.length === 0) {
    return chunkNormativeAct(rawText, docInput);
  }

  const primarySegments = splitByAnchors(rawText, primaryAnchors);
  const rawChunks: LegalChunk[] = [];
  let chunkIdx = 0;

  for (const seg of primarySegments) {
    const segLen = seg.end - seg.start;
    const segText = rawText.slice(seg.start, seg.end);

    // Preamble segment (before first article)
    if (!seg.anchorText) {
      if (segText.trim().length > MIN_CHUNK_SIZE) {
        rawChunks.push({
          ...makeChunk(chunkIdx++, "preamble", seg.start, seg.end, rawText, null, null, {
            ...docMeta, section_type: "preamble",
          }, docInput.doc_type),
          source_anchor: "",
          overlap_prev: 0,
        });
      }
      continue;
    }

    const articleNum = seg.number;
    const sourceAnchor = seg.anchorText;
    const locator: ChunkLocator = { article: articleNum, section_title: sourceAnchor };
    const chunkMeta: ChunkMetadata = { ...docMeta, article_number: articleNum, section_type: "article" };

    if (segLen <= MAX_CHUNK_CHARS) {
      // Fits in one chunk
      rawChunks.push({
        ...makeChunk(chunkIdx++, "article", seg.start, seg.end, rawText, sourceAnchor, locator, chunkMeta, docInput.doc_type),
        source_anchor: sourceAnchor,
        overlap_prev: 0,
      });
    } else {
      // Tiered cascade: Part → Point → Lettered → paragraph → fallback
      const subSegments = splitOversizedArticleTiered(rawText, seg.start, seg.end, segText);

      // Emit chunks for all sub-segments
      for (const ss of subSegments) {
        rawChunks.push({
          ...makeChunk(chunkIdx++, "article", ss.start, ss.end, rawText, sourceAnchor, locator, chunkMeta, docInput.doc_type),
          source_anchor: sourceAnchor,
          overlap_prev: ss.overlapPrev,
        });
      }
    }
  }

  // Phase 2a MIN merge: merge undersized chunks ONLY within same parentKey
  const merged: LegalChunk[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const chunk = rawChunks[i];
    const span = chunk.char_end - chunk.char_start;

    if (span < MIN_CHUNK_CHARS && i + 1 < rawChunks.length && sameParent(chunk, rawChunks[i + 1])) {
      // Merge with next chunk
      const next = rawChunks[i + 1];
      const mergedChunk: LegalChunk = {
        ...makeChunk(
          merged.length, chunk.chunk_type, chunk.char_start, next.char_end, rawText,
          chunk.label, chunk.locator, chunk.metadata, chunk.doc_type,
        ),
        source_anchor: chunk.source_anchor,
        overlap_prev: chunk.overlap_prev,
      };
      // Skip next since we consumed it
      rawChunks[i + 1] = mergedChunk;
      continue;
    }

    chunk.chunk_index = merged.length;
    merged.push(chunk);
  }

  return merged;
}

// ─── PHASE 2b: COURT DECISION CHUNKER ──────────────────────────────

// Phase 2b section markers (high-priority, from Chunking Spec v1)
interface Phase2bMarker {
  re: RegExp;
  type: ChunkType;
  label: string;
}

const PHASE2B_MARKERS: Phase2bMarker[] = [
  // ── Armenian markers ──
  { re: /\u054a\u0531\u054c\u0536\u054e\u0535\u0551/i, type: "facts", label: "\u054a\u0531\u054c\u0536\u054e\u0535\u0551" },
  { re: /\u054e\u0543\u054b\u054c\u0535\u0551/i, type: "resolution", label: "\u054e\u0543\u054b\u054c\u0535\u0551" },
  { re: /\u0555\u054c\u0548\u0547\u0535\u0551/i, type: "resolution", label: "\u0555\u054c\u0548\u0547\u0535\u0551" },
  // ── Russian markers ──
  // \u0423\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b = УСТАНОВИЛ
  { re: /\u0423\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b/i, type: "facts", label: "\u0423\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b" },
  // \u0421\u0423\u0414 \u0423\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b = СУД УСТАНОВИЛ
  { re: /\u0421\u0423\u0414\s+\u0423\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b/i, type: "facts", label: "\u0421\u0423\u0414 \u0423\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b" },
  // \u041c\u041e\u0422\u0418\u0412\u0418\u0420\u041e\u0412\u041e\u0427 = МОТИВИРОВОЧ (beginning of мотивировочная часть)
  { re: /\u041c\u041e\u0422\u0418\u0412\u0418\u0420\u041e\u0412\u041e\u0427/i, type: "reasoning", label: "\u041c\u041e\u0422\u0418\u0412\u0418\u0420\u041e\u0412\u041e\u0427\u041d\u0410\u042f \u0427\u0410\u0421\u0422\u042c" },
  // \u0420\u0415\u0428\u0418\u041b = РЕШИЛ
  { re: /\u0420\u0415\u0428\u0418\u041b/i, type: "resolution", label: "\u0420\u0415\u0428\u0418\u041b" },
  // \u041f\u041e\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b = ПОСТАНОВИЛ
  { re: /\u041f\u041e\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b/i, type: "resolution", label: "\u041f\u041e\u0421\u0422\u0410\u041d\u041e\u0412\u0418\u041b" },
  // \u041e\u041f\u0420\u0415\u0414\u0415\u041b\u0418\u041b = ОПРЕДЕЛИЛ
  { re: /\u041e\u041f\u0420\u0415\u0414\u0415\u041b\u0418\u041b/i, type: "resolution", label: "\u041e\u041f\u0420\u0415\u0414\u0415\u041b\u0418\u041b" },
];

// Extended section patterns (lower priority, for 8-section structure)
interface SectionPattern {
  re: RegExp;
  type: ChunkType;
  label: string;
}

const COURT_SECTION_PATTERNS: SectionPattern[] = [
  // ── Armenian patterns ──
  { re: /\u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0561\u056f\u0561\u0576\s+\u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "procedural_history", label: "\u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0561\u056f\u0561\u0576 \u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u0563\u0578\u0580\u056e\u056b\s+\u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "procedural_history", label: "\u0563\u0578\u0580\u056e\u056b \u057a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u0576\u0561\u056d\u0578\u0580\u0564\s+\u057e\u0561\u0580\u0578\u0582\u0575\u0569/i, type: "procedural_history", label: "\u0576\u0561\u056d\u0578\u0580\u0564 \u057e\u0561\u0580\u0578\u0582\u0575\u0569" },
  { re: /\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i, type: "appellant_arguments", label: "\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580" },
  { re: /\u057e\u0573\u057c\u0561\u056f\u0561\u0576\s+\u0562\u0578\u0572\u0578\u0584\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i, type: "appellant_arguments", label: "\u057e\u0573\u057c\u0561\u056f\u0561\u0576 \u0562\u0578\u0572\u0578\u0584\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580" },
  { re: /\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b\s+\u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574/i, type: "appellant_arguments", label: "\u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0572\u056b \u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574" },
  { re: /\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i, type: "respondent_arguments", label: "\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580" },
  { re: /\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b\s+\u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574/i, type: "respondent_arguments", label: "\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0572\u056b \u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574" },
  { re: /\u056f\u0578\u0572\u0574\u0565\u0580\u056b\s+\u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580/i, type: "arguments", label: "\u056f\u0578\u0572\u0574\u0565\u0580\u056b \u0583\u0561\u057d\u057f\u0561\u0580\u056f\u0576\u0565\u0580" },
  { re: /\u0576\u0578\u0580\u0574\u0565\u0580\u056b\s+\u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "norm_interpretation", label: "\u0576\u0578\u0580\u0574\u0565\u0580\u056b \u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576\s+\u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "norm_interpretation", label: "\u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0574\u0565\u056f\u0576\u0561\u0562\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u0576\u0578\u0580\u0574\u0565\u0580\u056b\s+\u057e\u0565\u0580\u056c\u0578\u0582\u056e\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "norm_interpretation", label: "\u0576\u0578\u0580\u0574\u0565\u0580\u056b \u057e\u0565\u0580\u056c\u0578\u0582\u056e\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u0564\u0561\u057f\u0561\u0580\u0561\u0576\u056b\s+\u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576\s+\u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574/i, type: "legal_position", label: "\u0564\u0561\u057f\u0561\u0580\u0561\u0576\u056b \u056b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0564\u056b\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574" },
  { re: /\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576\s+\u0574\u0561\u057d/i, type: "reasoning", label: "\u057a\u0561\u057f\u0573\u0561\u057c\u0561\u056f\u0561\u0576 \u0574\u0561\u057d" },
  { re: /\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576\s+\u0574\u0561\u057d/i, type: "facts", label: "\u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0561\u056f\u0561\u0576 \u0574\u0561\u057d" },
  { re: /\u0583\u0561\u057d\u057f\u0561\u056f\u0561\u0576\s+\u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584/i, type: "facts", label: "\u0583\u0561\u057d\u057f\u0561\u056f\u0561\u0576 \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580" },
  { re: /\u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576/i, type: "resolution", label: "\u057a\u0561\u0570\u0561\u0576\u057b\u0561\u057f\u057e\u0561\u056f\u0561\u0576" },
  { re: /\u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i, type: "resolution", label: "\u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576" },
  { re: /\u0570\u0561\u057f\u0578\u0582\u056f\s+\u056f\u0561\u0580\u056e\u056b\u0584/i, type: "dissent", label: "\u0570\u0561\u057f\u0578\u0582\u056f \u056f\u0561\u0580\u056e\u056b\u0584" },
  { re: /\u0563\u0578\u0580\u056e\u056b\s+\u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584/i, type: "facts", label: "\u0563\u0578\u0580\u056e\u056b \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580" },
  { re: /\u057e\u0573\u056b\u057c\u0565\u0581/i, type: "resolution", label: "\u057e\u0573\u056b\u057c\u0565\u0581" },
];

const REASONING_TYPES: Set<ChunkType> = new Set(["reasoning", "legal_position", "norm_interpretation"]);
const RESOLUTION_TYPES: Set<ChunkType> = new Set(["resolution"]);

/**
 * Phase 2b court decision chunker — Chunking Spec v1.
 *
 * 1. Scan for Phase 2b markers (\u054a\u0531\u054c\u0536\u054e\u0535\u0551, \u054e\u0543\u054b\u054c\u0535\u0551, \u0555\u054c\u0548\u0547\u0535\u0551) + extended AM patterns
 * 2. Split into sections by earliest matches
 * 3. Sections > MAX: split by paragraphs with GLOBAL_OVERLAP_CHARS
 *    reasoning sub-chunks get extra 10% overlap
 * 4. NEVER merge reasoning + ruling
 * 5. source_anchor = marker label
 */
function chunkCourtDecision(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  interface SectionBoundary {
    index: number;
    type: ChunkType;
    label: string;
  }

  // Extract structured court metadata once at start
  const courtMeta = extractCourtMeta(rawText);
  const metaCaseNumber = docInput.case_number || courtMeta.case_number || extractCaseNumber(rawText);
  const metaCourtName = courtMeta.court_name;
  const metaDate = docInput.date || courtMeta.decision_date || extractDate(rawText);
  const anchorPrefix = metaCaseNumber ?? "";

  /** Build source_anchor: prefix · markerOrType */
  function buildAnchor(markerOrType: string): string {
    return anchorPrefix ? `${anchorPrefix} \u00b7 ${markerOrType}` : markerOrType;
  }

  /** Build label: includes case_number, court_name, decision_date, chunk_type */
  function buildLabel(chunkType: string, sectionLabel: string): string {
    const parts: string[] = [];
    if (metaCaseNumber) parts.push(metaCaseNumber);
    if (metaCourtName) parts.push(metaCourtName);
    if (metaDate) parts.push(metaDate);
    parts.push(sectionLabel || chunkType);
    return parts.join(" | ");
  }

  const boundaries: SectionBoundary[] = [];
  const docMeta: ChunkMetadata = {
    document_type: docInput.doc_type,
    document_title: docInput.title,
    court_level: docInput.court_level,
    case_number: metaCaseNumber,
    court_name: metaCourtName,
    date: metaDate,
  };

  /** Attach court meta fields to a chunk */
  function attachCourtMeta(chunk: LegalChunk): LegalChunk {
    chunk.case_number = metaCaseNumber || undefined;
    chunk.court_name = metaCourtName || undefined;
    chunk.decision_date = metaDate || undefined;
    return chunk;
  }

  // Phase 2b markers have higher priority (scanned first)
  for (const marker of PHASE2B_MARKERS) {
    const re = new RegExp(marker.re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText)) !== null) {
      const before = rawText.slice(Math.max(0, m.index - 2), m.index);
      const isLineStart = m.index === 0 || /[\n\r]/.test(before);
      if (isLineStart || before.trim() === "") {
        boundaries.push({ index: m.index, type: marker.type, label: marker.label });
      }
    }
  }

  // Extended patterns (lower priority)
  for (const pattern of COURT_SECTION_PATTERNS) {
    const re = new RegExp(pattern.re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText)) !== null) {
      const before = rawText.slice(Math.max(0, m.index - 2), m.index);
      const isLineStart = m.index === 0 || /[\n\r]/.test(before);
      if (isLineStart || before.trim() === "") {
        boundaries.push({ index: m.index, type: pattern.type, label: pattern.label });
      }
    }
  }

  boundaries.sort((a, b) => a.index - b.index);
  const deduped: SectionBoundary[] = [];
  for (const b of boundaries) {
    const last = deduped[deduped.length - 1];
    if (!last || b.index - last.index > 50) {
      deduped.push(b);
    }
  }

  if (deduped.length === 0) {
    return chunkStructuralFallback(rawText, "full_text", docMeta, docInput.doc_type);
  }

  const rawChunks: LegalChunk[] = [];
  let chunkIdx = 0;

  // Header before first section
  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const headerSlice = rawText.slice(0, deduped[0].index);
    if (headerSlice.trim().length > 0) {
      rawChunks.push({
        ...makeChunk(chunkIdx++, "header", 0, deduped[0].index, rawText, buildLabel("header", "header"), null, {
          ...docMeta, section_type: "header",
        }, docInput.doc_type),
        source_anchor: buildAnchor("header"),
        overlap_prev: 0,
      });
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    let charStart = deduped[i].index;
    const charEnd = i + 1 < deduped.length ? deduped[i + 1].index : rawText.length;
    const sectionType = deduped[i].type;
    const sectionLabel = deduped[i].label;

    // Reasoning overlap: expand char_start backwards into previous section (10%)
    if (REASONING_TYPES.has(sectionType) && !RESOLUTION_TYPES.has(sectionType) && i > 0) {
      const prevStart = deduped[i - 1].index;
      const prevLen = charStart - prevStart;
      const overlapChars = Math.floor(prevLen * REASONING_OVERLAP_RATIO);
      if (overlapChars > MIN_CHUNK_SIZE) {
        charStart = charStart - overlapChars;
      }
    }

    const sectionSlice = rawText.slice(charStart, charEnd);
    if (sectionSlice.trim().length === 0) continue;

    if (sectionSlice.length > MAX_CHUNK_CHARS) {
      // Split oversized section with overlap
      const isReasoning = REASONING_TYPES.has(sectionType);
      const overlapForSection = isReasoning
        ? GLOBAL_OVERLAP_CHARS + Math.floor((charEnd - charStart) * REASONING_OVERLAP_RATIO * 0.5)
        : GLOBAL_OVERLAP_CHARS;

      const subSegments = splitAtTargetWithOverlapCustom(rawText, charStart, charEnd, overlapForSection);
      for (const ss of subSegments) {
        rawChunks.push({
          ...makeChunk(chunkIdx++, sectionType, ss.start, ss.end, rawText, buildLabel(sectionType, sectionLabel),
            { section_title: sectionLabel },
            { ...docMeta, section_type: sectionType },
            docInput.doc_type,
          ),
          source_anchor: buildAnchor(sectionLabel),
          overlap_prev: ss.overlapPrev,
        });
      }
    } else {
      rawChunks.push({
        ...makeChunk(
          chunkIdx++, sectionType, charStart, charEnd, rawText, buildLabel(sectionType, sectionLabel),
          { section_title: sectionLabel },
          { ...docMeta, section_type: sectionType },
          docInput.doc_type,
        ),
        source_anchor: buildAnchor(sectionLabel),
        overlap_prev: 0,
      });
    }
  }

  // Phase 2b MIN merge: NEVER merge reasoning + ruling
  const merged: LegalChunk[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const chunk = rawChunks[i];
    const span = chunk.char_end - chunk.char_start;

    if (span < MIN_CHUNK_CHARS && i + 1 < rawChunks.length) {
      const next = rawChunks[i + 1];
      // NEVER merge across reasoning/ruling boundary
      const isReasoningRulingBoundary =
        (REASONING_TYPES.has(chunk.chunk_type) && RESOLUTION_TYPES.has(next.chunk_type)) ||
        (RESOLUTION_TYPES.has(chunk.chunk_type) && REASONING_TYPES.has(next.chunk_type));

      if (!isReasoningRulingBoundary && sameParent(chunk, next)) {
        const mergedChunk: LegalChunk = {
          ...makeChunk(
            merged.length, chunk.chunk_type, chunk.char_start, next.char_end, rawText,
            chunk.label, chunk.locator, chunk.metadata, chunk.doc_type,
          ),
          source_anchor: chunk.source_anchor,
          overlap_prev: chunk.overlap_prev,
        };
        rawChunks[i + 1] = mergedChunk;
        continue;
      }
    }

    chunk.chunk_index = merged.length;
    merged.push(chunk);
  }

  return merged.map(attachCourtMeta);
}

/**
 * Split with custom overlap amount (for reasoning sections).
 */
function splitAtTargetWithOverlapCustom(
  rawText: string,
  segStart: number,
  segEnd: number,
  overlapChars: number,
): Array<{ start: number; end: number; overlapPrev: number }> {
  const results: Array<{ start: number; end: number; overlapPrev: number }> = [];
  let pos = segStart;
  let isFirst = true;

  while (pos < segEnd) {
    const remaining = segEnd - pos;
    if (remaining <= TARGET_CHUNK_CHARS) {
      results.push({ start: pos, end: segEnd, overlapPrev: isFirst ? 0 : overlapChars });
      break;
    }

    const searchEnd = Math.min(pos + TARGET_CHUNK_CHARS, segEnd);
    const slice = rawText.slice(pos, searchEnd);
    let bp = -1;

    // Try paragraph break
    const dnl = slice.lastIndexOf("\n\n");
    if (dnl > MIN_CHUNK_CHARS) bp = dnl + 2;

    // Try single newline
    if (bp === -1) {
      const snl = slice.lastIndexOf("\n");
      if (snl > MIN_CHUNK_CHARS) bp = snl + 1;
    }

    // Try sentence
    if (bp === -1) {
      const sentRe = /[.!?\u0589]\s/g;
      let lastSent = -1;
      let sm: RegExpExecArray | null;
      while ((sm = sentRe.exec(slice)) !== null) {
        if (sm.index > MIN_CHUNK_CHARS) lastSent = sm.index + sm[0].length;
      }
      if (lastSent > 0) bp = lastSent;
    }

    // Try whitespace
    if (bp === -1) {
      const wsIdx = slice.lastIndexOf(" ", TARGET_CHUNK_CHARS);
      if (wsIdx > MIN_CHUNK_CHARS) bp = wsIdx + 1;
    }

    if (bp <= 0) bp = TARGET_CHUNK_CHARS;

    results.push({ start: pos, end: pos + bp, overlapPrev: isFirst ? 0 : overlapChars });
    pos = pos + bp - overlapChars;
    if (pos <= results[results.length - 1].start) {
      pos = results[results.length - 1].end;
    }
    isFirst = false;
  }

  return results;
}

function splitSectionByParagraphsRaw(
  rawText: string,
  sectionStart: number,
  sectionEnd: number,
  sectionType: ChunkType,
  sectionLabel: string,
  startIdx: number,
  docMeta: ChunkMetadata,
  docType?: string,
): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  const sectionSlice = rawText.slice(sectionStart, sectionEnd);

  const breakRe = /\n\n+/g;
  const breakPositions: number[] = [0];
  let m: RegExpExecArray | null;
  while ((m = breakRe.exec(sectionSlice)) !== null) {
    breakPositions.push(m.index + m[0].length);
  }

  let idx = startIdx;
  let partNum = 1;
  let groupStart = 0;

  for (let i = 1; i < breakPositions.length; i++) {
    const currentGroupLen = breakPositions[i] - groupStart;
    if (currentGroupLen > TARGET_CHUNK_CHARS && groupStart < breakPositions[i] - 1) {
      const absStart = sectionStart + groupStart;
      const absEnd = sectionStart + breakPositions[i];
      const sliceCheck = rawText.slice(absStart, absEnd);
      if (sliceCheck.trim().length > 0) {
        const label = partNum > 1 ? `${sectionLabel} (${partNum})` : sectionLabel;
        chunks.push(makeChunk(idx++, sectionType, absStart, absEnd, rawText, label,
          { section_title: sectionLabel },
          { ...docMeta, section_type: sectionType },
          docType,
        ));
        partNum++;
      }
      groupStart = breakPositions[i];
    }
  }

  if (groupStart < sectionSlice.length) {
    const absStart = sectionStart + groupStart;
    const absEnd = sectionEnd;
    const sliceCheck = rawText.slice(absStart, absEnd);
    if (sliceCheck.trim().length > 0) {
      const label = partNum > 1 ? `${sectionLabel} (${partNum})` : sectionLabel;
      chunks.push(makeChunk(idx++, sectionType, absStart, absEnd, rawText, label,
        { section_title: sectionLabel },
        { ...docMeta, section_type: sectionType },
        docType,
      ));
    }
  }

  return chunks;
}

// ─── ECHR JUDGMENT CHUNKER ─────────────────────────────────────────

interface EchrSectionPattern {
  re: RegExp;
  type: ChunkType;
  label: string;
}

const ECHR_SECTION_PATTERNS: EchrSectionPattern[] = [
  { re: /^(?:I\.\s*)?PROCEDURE/im, type: "procedure", label: "PROCEDURE" },
  { re: /^(?:II\.\s*)?THE\s+FACTS/im, type: "facts", label: "THE FACTS" },
  { re: /^(?:II\.\s*)?RELEVANT\s+DOMESTIC\s+LAW/im, type: "law", label: "RELEVANT DOMESTIC LAW" },
  { re: /^(?:III\.\s*)?THE\s+LAW/im, type: "law", label: "THE LAW" },
  { re: /^(?:A\.\s*)?THE\s+GOVERNMENT['S\u2019]?\s+PRELIMINARY\s+OBJECTION/im, type: "arguments", label: "GOVERNMENT PRELIMINARY OBJECTION" },
  { re: /^(?:B\.\s*)?MERITS/im, type: "assessment", label: "MERITS" },
  { re: /ASSESSMENT\s+OF\s+THE\s+COURT/im, type: "assessment", label: "ASSESSMENT OF THE COURT" },
  { re: /THE\s+COURT['S\u2019]?\s+ASSESSMENT/im, type: "assessment", label: "THE COURT'S ASSESSMENT" },
  { re: /^(?:IV\.\s*)?ALLEGED\s+VIOLATION/im, type: "assessment", label: "ALLEGED VIOLATION" },
  { re: /^(?:V\.\s*)?APPLICATION\s+OF\s+ARTICLE\s+41/im, type: "just_satisfaction", label: "APPLICATION OF ARTICLE 41" },
  { re: /JUST\s+SATISFACTION/im, type: "just_satisfaction", label: "JUST SATISFACTION" },
  { re: /FOR\s+THESE\s+REASONS/im, type: "conclusion", label: "FOR THESE REASONS" },
  { re: /PARTLY\s+DISSENTING\s+OPINION/im, type: "dissent", label: "PARTLY DISSENTING OPINION" },
  { re: /DISSENTING\s+OPINION/im, type: "dissent", label: "DISSENTING OPINION" },
  { re: /CONCURRING\s+OPINION/im, type: "dissent", label: "CONCURRING OPINION" },
];

function chunkEchrJudgment(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: "echr_judgment",
    document_title: docInput.title,
    court_level: "echr",
    case_number: docInput.case_number || extractCaseNumber(rawText),
    date: docInput.date || extractDate(rawText),
  };

  interface EchrBoundary {
    index: number;
    type: ChunkType;
    label: string;
  }

  const boundaries: EchrBoundary[] = [];

  for (const pattern of ECHR_SECTION_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags.includes("m") ? "gim" : "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawText)) !== null) {
      boundaries.push({ index: m.index, type: pattern.type, label: pattern.label });
    }
  }

  boundaries.sort((a, b) => a.index - b.index);
  const deduped: EchrBoundary[] = [];
  for (const b of boundaries) {
    const last = deduped[deduped.length - 1];
    if (!last || b.index - last.index > 50) {
      deduped.push(b);
    }
  }

  if (deduped.length === 0) {
    return chunkStructuralFallback(rawText, "full_text", docMeta, "echr_judgment");
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const headerSlice = rawText.slice(0, deduped[0].index);
    if (headerSlice.trim().length > 0) {
      chunks.push(makeChunk(chunkIdx++, "header", 0, deduped[0].index, rawText, "ECHR Header", null, {
        ...docMeta, section_type: "header",
      }, "echr_judgment"));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const charStart = deduped[i].index;
    const charEnd = i + 1 < deduped.length ? deduped[i + 1].index : rawText.length;
    const sectionSlice = rawText.slice(charStart, charEnd);

    if (sectionSlice.trim().length === 0) continue;

    if (sectionSlice.length > TARGET_CHUNK_CHARS) {
      const subChunks = splitSectionByParagraphsRaw(
        rawText, charStart, charEnd, deduped[i].type, deduped[i].label,
        chunkIdx, docMeta, "echr_judgment",
      );
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      chunks.push(makeChunk(
        chunkIdx++, deduped[i].type, charStart, charEnd, rawText,
        deduped[i].label,
        { section_title: deduped[i].label },
        { ...docMeta, section_type: deduped[i].type },
        "echr_judgment",
      ));
    }
  }

  return chunks;
}

// ─── TREATY CHUNKER ────────────────────────────────────────────────

// Legacy helpers used by treaty chunker
interface ArticleMatch {
  index: number;
  number: string;
  fullMatch: string;
}

function extractArticleTitle(articleText: string): string | null {
  const m = articleText.match(ARTICLE_TITLE_RE);
  return m ? m[1].trim() : null;
}

function splitArticleByParts(
  rawText: string,
  articleStart: number,
  articleEnd: number,
  articleNum: string,
  startIdx: number,
  docMeta: ChunkMetadata,
  docType?: string,
): LegalChunk[] {
  const articleSlice = rawText.slice(articleStart, articleEnd);
  const lines = findLines(articleSlice);
  const partBoundaries: { lineIdx: number; partNum: string; rawOffset: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = articleSlice.slice(lines[i].start, lines[i].end);
    const m = lineText.match(PART_LINE_RE);
    if (m) {
      partBoundaries.push({ lineIdx: i, partNum: m[1], rawOffset: lines[i].start });
    }
  }

  if (partBoundaries.length <= 1) {
    const locator: ChunkLocator = {
      article: articleNum,
      section_title: "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum,
    };
    return [makeChunk(
      startIdx, "article", articleStart, articleEnd, rawText,
      "\u0540\u0578\u0564\u057e\u0561\u056e " + articleNum, locator,
      { ...docMeta, article_number: articleNum, section_type: "article" },
      docType,
    )];
  }

  const chunks: LegalChunk[] = [];
  let idx = startIdx;

  let groupStartOffset = 0;
  let currentPartStart = partBoundaries[0].partNum;
  let currentPartEnd = currentPartStart;

  for (let i = 0; i < partBoundaries.length; i++) {
    const partStart = partBoundaries[i].rawOffset;
    const partEnd = i + 1 < partBoundaries.length
      ? partBoundaries[i + 1].rawOffset
      : articleSlice.length;

    const groupEnd = partEnd;
    const groupLen = groupEnd - groupStartOffset;

    const currentGroupLen = partStart - groupStartOffset;
    if (currentGroupLen > 0 && groupLen > TARGET_CHUNK_CHARS) {
      const absStart = articleStart + groupStartOffset;
      const absEnd = articleStart + partStart;
      const partLabel = currentPartStart === currentPartEnd
        ? `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d ${currentPartStart}`
        : `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d\u0565\u0580 ${currentPartStart}-${currentPartEnd}`;
      const locator: ChunkLocator = {
        article: articleNum,
        part: currentPartStart === currentPartEnd ? currentPartStart : `${currentPartStart}-${currentPartEnd}`,
      };
      chunks.push(makeChunk(idx++, "article", absStart, absEnd, rawText, partLabel, locator, {
        ...docMeta, article_number: articleNum, section_type: "article",
      }, docType));

      groupStartOffset = partStart;
      currentPartStart = partBoundaries[i].partNum;
      currentPartEnd = currentPartStart;
    } else {
      currentPartEnd = partBoundaries[i].partNum;
    }
  }

  if (groupStartOffset < articleSlice.length) {
    const absStart = articleStart + groupStartOffset;
    const absEnd = articleEnd;
    const sliceText = rawText.slice(absStart, absEnd);
    if (sliceText.trim().length > 0) {
      const partLabel = currentPartStart === currentPartEnd
        ? `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d ${currentPartStart}`
        : `\u0540\u0578\u0564\u057e\u0561\u056e ${articleNum}, \u0574\u0561\u057d\u0565\u0580 ${currentPartStart}-${currentPartEnd}`;
      const locator: ChunkLocator = {
        article: articleNum,
        part: currentPartStart === currentPartEnd ? currentPartStart : `${currentPartStart}-${currentPartEnd}`,
      };
      chunks.push(makeChunk(idx++, "article", absStart, absEnd, rawText, partLabel, locator, {
        ...docMeta, article_number: articleNum, section_type: "article",
      }, docType));
    }
  }

  return chunks;
}

const TREATY_ARTICLE_RE = /(?:Article|ARTICLE|\u0540\u0578\u0564\u057e\u0561\u056e)\s+(\d+(?:[.-]\d+)*)/g;

function chunkTreaty(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: "treaty",
    document_title: docInput.title,
    date: docInput.date || extractDate(rawText),
  };

  const articleMatches: ArticleMatch[] = [];
  const re = new RegExp(TREATY_ARTICLE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawText)) !== null) {
    articleMatches.push({ index: m.index, number: m[1], fullMatch: m[0] });
  }

  articleMatches.sort((a, b) => a.index - b.index);
  const deduped: ArticleMatch[] = [];
  for (const am of articleMatches) {
    const last = deduped[deduped.length - 1];
    if (!last || am.index - last.index > 10) {
      deduped.push(am);
    }
  }

  if (deduped.length === 0) {
    return chunkStructuralFallback(rawText, "treaty_article", docMeta, "treaty");
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  if (deduped[0].index > MIN_CHUNK_SIZE) {
    const preambleSlice = rawText.slice(0, deduped[0].index);
    if (preambleSlice.trim().length > 0) {
      chunks.push(makeChunk(chunkIdx++, "preamble", 0, deduped[0].index, rawText, null, null, {
        ...docMeta, section_type: "preamble",
      }, "treaty"));
    }
  }

  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].index;
    const end = i + 1 < deduped.length ? deduped[i + 1].index : rawText.length;
    const articleSlice = rawText.slice(start, end);
    const articleNum = deduped[i].number;

    if (articleSlice.trim().length === 0) continue;

    if (articleSlice.length > TARGET_CHUNK_CHARS) {
      const subChunks = splitArticleByParts(rawText, start, end, articleNum, chunkIdx, docMeta, "treaty");
      for (const sc of subChunks) {
        sc.chunk_type = "treaty_article";
      }
      chunks.push(...subChunks);
      chunkIdx += subChunks.length;
    } else {
      const locator: ChunkLocator = {
        article: articleNum,
        section_title: "Article " + articleNum,
      };
      chunks.push(makeChunk(
        chunkIdx++, "treaty_article", start, end, rawText,
        "Article " + articleNum, locator,
        { ...docMeta, article_number: articleNum, section_type: "treaty_article" },
        "treaty",
      ));
    }
  }

  return chunks;
}

// ─── REGISTRY TABLE CHUNKER ───────────────────────────────────────

function chunkRegistryTable(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: "registry_table",
    document_title: docInput.title,
    date: docInput.date || extractDate(rawText),
  };

  const lines = findLines(rawText);
  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  let headerEndLineIdx = 0;
  const numberedRowRe = /^\s*\d+\s*[.|)]/;
  for (let i = 0; i < lines.length; i++) {
    const lineText = rawText.slice(lines[i].start, lines[i].end);
    if (numberedRowRe.test(lineText)) {
      headerEndLineIdx = i;
      break;
    }
  }

  if (headerEndLineIdx > 0) {
    const headerEnd = lines[headerEndLineIdx].start;
    const headerSlice = rawText.slice(0, headerEnd);
    if (headerSlice.trim().length > MIN_CHUNK_SIZE) {
      chunks.push(makeChunk(chunkIdx++, "header", 0, headerEnd, rawText, "Registry Header", null, {
        ...docMeta, section_type: "header",
      }, "registry_table"));
    }
  }

  interface RowBound { start: number; end: number }
  const rows: RowBound[] = [];
  let currentRowStart = headerEndLineIdx < lines.length ? lines[headerEndLineIdx].start : rawText.length;

  for (let i = headerEndLineIdx + 1; i < lines.length; i++) {
    const lineText = rawText.slice(lines[i].start, lines[i].end);
    if (numberedRowRe.test(lineText)) {
      if (rawText.slice(currentRowStart, lines[i].start).trim().length > 0) {
        rows.push({ start: currentRowStart, end: lines[i].start });
      }
      currentRowStart = lines[i].start;
    }
  }
  if (currentRowStart < rawText.length && rawText.slice(currentRowStart, rawText.length).trim().length > 0) {
    rows.push({ start: currentRowStart, end: rawText.length });
  }

  let groupStart = rows.length > 0 ? rows[0].start : rawText.length;

  for (let i = 0; i < rows.length; i++) {
    const groupLen = rows[i].end - groupStart;
    if (groupLen > TARGET_CHUNK_CHARS && rows[i].start > groupStart) {
      chunks.push(makeChunk(chunkIdx++, "registry_row_group", groupStart, rows[i].start, rawText,
        `Row group ${chunkIdx}`, null, { ...docMeta, section_type: "registry_row_group" },
        "registry_table",
      ));
      groupStart = rows[i].start;
    }
  }

  if (rows.length > 0 && groupStart < rawText.length) {
    const finalSlice = rawText.slice(groupStart, rawText.length);
    if (finalSlice.trim().length > 0) {
      chunks.push(makeChunk(chunkIdx++, "registry_row_group", groupStart, rawText.length, rawText,
        `Row group ${chunkIdx}`, null, { ...docMeta, section_type: "registry_row_group" },
        "registry_table",
      ));
    }
  }

  return chunks;
}

// ─── NORMATIVE ACT CHUNKER ────────────────────────────────────────

function chunkNormativeAct(rawText: string, docInput: LegalDocumentInput): LegalChunk[] {
  const docMeta: ChunkMetadata = {
    document_type: docInput.doc_type || "normative_act",
    document_title: docInput.title,
    date: docInput.date || extractDate(rawText),
  };

  const lines = findLines(rawText);
  const sectionBoundaries: { lineIdx: number; label: string; charStart: number }[] = [];

  const sectionHeaderRe = /^(?:[IVX]+\.\s+|(?:\u0533\u056c\u0578\u0582\u056d|\u0532\u0561\u056a\u056b\u0576)\s+\d+)/i;
  const numberedSectionRe = /^\d+\.\s+[A-Z\u0531-\u0556]/;

  for (let i = 0; i < lines.length; i++) {
    const lineText = rawText.slice(lines[i].start, lines[i].end);
    const trimmedLine = lineText.trim();
    if (sectionHeaderRe.test(trimmedLine)) {
      sectionBoundaries.push({ lineIdx: i, label: trimmedLine.slice(0, 80), charStart: lines[i].start });
    } else if (numberedSectionRe.test(trimmedLine) && trimmedLine.length < 200) {
      sectionBoundaries.push({ lineIdx: i, label: trimmedLine.slice(0, 80), charStart: lines[i].start });
    }
  }

  if (sectionBoundaries.length === 0) {
    return chunkStructuralFallback(rawText, "normative_section", docMeta, docInput.doc_type);
  }

  const chunks: LegalChunk[] = [];
  let chunkIdx = 0;

  if (sectionBoundaries[0].charStart > 0) {
    const preambleSlice = rawText.slice(0, sectionBoundaries[0].charStart);
    if (preambleSlice.trim().length > MIN_CHUNK_SIZE) {
      chunks.push(makeChunk(chunkIdx++, "preamble", 0, sectionBoundaries[0].charStart, rawText, null, null, {
        ...docMeta, section_type: "preamble",
      }, docInput.doc_type));
    }
  }

  for (let i = 0; i < sectionBoundaries.length; i++) {
    const charStart = sectionBoundaries[i].charStart;
    const charEnd = i + 1 < sectionBoundaries.length
      ? sectionBoundaries[i + 1].charStart
      : rawText.length;
    const sectionSlice = rawText.slice(charStart, charEnd);

    if (sectionSlice.trim().length === 0) continue;

    if (sectionSlice.length > TARGET_CHUNK_CHARS) {
      const subChunks = splitSectionByParagraphsRaw(
        rawText, charStart, charEnd, "normative_section", sectionBoundaries[i].label,
        chunkIdx, docMeta, docInput.doc_type,
      );
      for (const sc of subChunks) chunks.push(sc);
      chunkIdx += subChunks.length;
    } else {
      chunks.push(makeChunk(
        chunkIdx++, "normative_section", charStart, charEnd, rawText,
        sectionBoundaries[i].label,
        { section_title: sectionBoundaries[i].label },
        { ...docMeta, section_type: "normative_section" },
        docInput.doc_type,
      ));
    }
  }

  return chunks;
}

// ─── STRUCTURAL FALLBACK (paragraph-aware, replaces fixed-window) ──

function chunkStructuralFallback(
  rawText: string,
  defaultType: ChunkType,
  docMeta?: ChunkMetadata,
  docType?: string,
): LegalChunk[] {
  const chunks: LegalChunk[] = [];
  const paragraphs = findParagraphs(rawText);
  let idx = 0;
  let groupStart = paragraphs.length > 0 ? paragraphs[0].start : 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const groupLen = paragraphs[i].end - groupStart;

    if (groupLen > TARGET_CHUNK_CHARS && paragraphs[i].start > groupStart) {
      const sliceCheck = rawText.slice(groupStart, paragraphs[i].start);
      if (sliceCheck.trim().length > 0) {
        chunks.push(makeChunk(idx++, defaultType, groupStart, paragraphs[i].start, rawText, null, null, docMeta || null, docType));
      }
      groupStart = paragraphs[i].start;
    }
  }

  const finalEnd = paragraphs.length > 0 ? paragraphs[paragraphs.length - 1].end : rawText.length;
  if (groupStart < finalEnd) {
    const sliceCheck = rawText.slice(groupStart, finalEnd);
    if (sliceCheck.trim().length > 0) {
      chunks.push(makeChunk(idx++, defaultType, groupStart, finalEnd, rawText, null, null, docMeta || null, docType));
    }
  }

  return chunks;
}

// ─── SAFE-BREAK SPLITTING (hard cap enforcement) ──────────────────

/**
 * Split text that exceeds MAX_CHUNK_CHARS at the safest available break.
 * Breakpoint priority: double newline > single newline > sentence > whitespace.
 * Delimiters are included in the LEFT chunk to avoid ugly leading delimiters.
 * bp is always > 0 to guarantee forward progress.
 */
function splitAtSafeBreak(
  rawText: string,
  start: number,
  end: number,
  chunkType: ChunkType,
  startIdx: number,
  label: string | null,
  locator: ChunkLocator | null,
  meta: ChunkMetadata | null,
  docType?: string,
): LegalChunk[] {
  const span = end - start;
  if (span <= MAX_CHUNK_CHARS) {
    return [makeChunk(startIdx, chunkType, start, end, rawText, label, locator, meta, docType)];
  }

  const chunks: LegalChunk[] = [];
  let pos = start;
  let idx = startIdx;

  while (pos < end) {
    const remaining = end - pos;
    if (remaining <= MAX_CHUNK_CHARS) {
      chunks.push(makeChunk(idx++, chunkType, pos, end, rawText, label, locator, meta, docType));
      break;
    }

    const searchEnd = Math.min(pos + MAX_CHUNK_CHARS, end);
    const slice = rawText.slice(pos, searchEnd);

    let bp = -1;

    // 1. Try double newline — include delimiter in left chunk
    const dnl = slice.lastIndexOf("\n\n");
    if (dnl > MIN_CHUNK_CHARS) {
      // Find end of delimiter (could be \n\n\n...)
      let delimEnd = dnl + 2;
      while (delimEnd < slice.length && slice[delimEnd] === "\n") delimEnd++;
      bp = delimEnd;
    }

    // 2. Try single newline
    if (bp === -1) {
      const snl = slice.lastIndexOf("\n");
      if (snl > MIN_CHUNK_CHARS) {
        bp = snl + 1; // include \n in left chunk
      }
    }

    // 3. Try sentence boundary
    if (bp === -1) {
      const sentRe = /[.!?\u0589]\s/g;
      let lastSent = -1;
      let sm: RegExpExecArray | null;
      while ((sm = sentRe.exec(slice)) !== null) {
        if (sm.index > MIN_CHUNK_CHARS && sm.index + sm[0].length <= MAX_CHUNK_CHARS) {
          lastSent = sm.index + sm[0].length;
        }
      }
      if (lastSent > MIN_CHUNK_CHARS) bp = lastSent;
    }

    // 4. Try whitespace
    if (bp === -1) {
      const wsIdx = slice.lastIndexOf(" ", MAX_CHUNK_CHARS);
      if (wsIdx > MIN_CHUNK_CHARS) bp = wsIdx + 1;
    }

    // 5. Absolute fallback — always > 0
    if (bp <= 0) bp = MAX_CHUNK_CHARS;

    chunks.push(makeChunk(idx++, chunkType, pos, pos + bp, rawText, label, locator, meta, docType));
    pos += bp;
  }

  return chunks;
}

// ─── MIN MERGE POLICY ─────────────────────────────────────────────

/**
 * Merge undersized chunks (<MIN_CHUNK_CHARS) with neighbors within same parent.
 * Uses parentKey() for strict boundary detection.
 * Never merge across different parents. Never exceed MAX_CHUNK_CHARS.
 * Merged chunk preserves identity (type/label/locator/metadata) from the
 * chunk with the earliest char_start.
 */
function mergeUndersizedChunks(chunks: LegalChunk[], rawText: string): LegalChunk[] {
  if (chunks.length <= 1) return chunks;

  const result: LegalChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const span = chunk.char_end - chunk.char_start;

    if (span >= MIN_CHUNK_CHARS) {
      result.push(chunk);
      continue;
    }

    // Try merge with previous
    if (result.length > 0) {
      const prev = result[result.length - 1];
      if (
        sameParent(prev, chunk) &&
        (prev.char_end - prev.char_start) + span <= MAX_CHUNK_CHARS
      ) {
        // Merge: extend previous chunk to cover this one.
        // prev has earlier char_start, so we keep prev's identity.
        const merged = makeChunk(
          prev.chunk_index, prev.chunk_type, prev.char_start, chunk.char_end, rawText,
          prev.label, prev.locator, prev.metadata, prev.doc_type,
        );
        result[result.length - 1] = merged;
        continue;
      }
    }

    // Try merge with next
    if (i + 1 < chunks.length) {
      const next = chunks[i + 1];
      if (
        sameParent(chunk, next) &&
        span + (next.char_end - next.char_start) <= MAX_CHUNK_CHARS
      ) {
        // Merge: create combined chunk. Current chunk has earlier start,
        // so keep current chunk's identity.
        const merged = makeChunk(
          chunk.chunk_index, chunk.chunk_type, chunk.char_start, next.char_end, rawText,
          chunk.label, chunk.locator, chunk.metadata, chunk.doc_type,
        );
        result.push(merged);
        i++; // skip next
        continue;
      }
    }

    // Cannot merge — keep small chunk (parentKey is null or size constraint)
    result.push(chunk);
  }

  // Re-index
  for (let i = 0; i < result.length; i++) {
    result[i].chunk_index = i;
  }

  return result;
}

// ─── PER-TYPE CAP ENFORCEMENT ─────────────────────────────────────

/**
 * Coarsen chunks by merging adjacent same-parent chunks until under cap.
 * Returns warnings array if cap cannot be reached.
 */
function enforceChunkCap(
  chunks: LegalChunk[],
  cap: number,
  rawText: string,
  warnings: string[],
): LegalChunk[] {
  if (chunks.length <= cap) return chunks;

  let result = [...chunks];
  let lastLen = result.length + 1;

  while (result.length > cap && result.length < lastLen) {
    lastLen = result.length;
    for (let i = result.length - 2; i >= 0; i--) {
      const a = result[i];
      const b = result[i + 1];
      if (sameParent(a, b)) {
        const mergedSpan = b.char_end - a.char_start;
        if (mergedSpan <= MAX_CHUNK_CHARS) {
          const m = makeChunk(
            a.chunk_index, a.chunk_type, a.char_start, b.char_end, rawText,
            a.label, a.locator, a.metadata, a.doc_type,
          );
          result.splice(i, 2, m);
          break;
        }
      }
    }
  }

  if (result.length > cap) {
    warnings.push(
      `cap_exceeded: wanted=${cap}, actual=${result.length}, reason=cannot_merge_without_exceeding_MAX_or_missing_parentKey`
    );
  }

  // Re-index
  for (let i = 0; i < result.length; i++) {
    result[i].chunk_index = i;
  }
  return result;
}

// ─── HARD CAP ENFORCEMENT (ensure no chunk > MAX by span) ─────────

/**
 * Detect oversize by span (char_end - char_start), not string length.
 * Split oversize chunks using splitAtSafeBreak, preserving metadata.
 */
function enforceHardCap(chunks: LegalChunk[], rawText: string): LegalChunk[] {
  const result: LegalChunk[] = [];
  let idx = 0;
  for (const chunk of chunks) {
    const span = chunk.char_end - chunk.char_start;
    if (span > MAX_CHUNK_CHARS) {
      const split = splitAtSafeBreak(
        rawText, chunk.char_start, chunk.char_end, chunk.chunk_type,
        idx, chunk.label, chunk.locator, chunk.metadata, chunk.doc_type,
      );
      for (const s of split) {
        s.chunk_index = idx++;
        result.push(s);
      }
    } else {
      chunk.chunk_index = idx++;
      result.push(chunk);
    }
  }
  return result;
}

// ─── POST-PROCESS PIPELINE ────────────────────────────────────────

function postProcessChunks(
  chunks: LegalChunk[],
  rawText: string,
  cap: number,
  warnings?: string[],
): LegalChunk[] {
  const w = warnings || [];
  let result = enforceHardCap(chunks, rawText);
  result = mergeUndersizedChunks(result, rawText);
  result = enforceChunkCap(result, cap, rawText, w);
  return result;
}

// ─── VALIDATE CHUNKS ──────────────────────────────────────────────

/**
 * Validates chunk coverage and integrity against original text.
 * STRICT: raw.slice(char_start, char_end) === chunk_text for ALL chunk types.
 * NO exemptions. NO tolerance.
 */
export function validateChunks(originalText: string, chunks: LegalChunk[]): ValidationResult {
  const errors: string[] = [];

  if (chunks.length === 0) {
    if (originalText.trim().length > 0) {
      errors.push("No chunks produced for non-empty text");
    }
    return { ok: errors.length === 0, errors };
  }

  const sorted = [...chunks].sort((a, b) => a.char_start - b.char_start);

  // STRICT OFFSET CHECK: raw.slice(char_start, char_end) === chunk_text
  for (const chunk of sorted) {
    const expectedText = originalText.slice(chunk.char_start, chunk.char_end);
    if (expectedText !== chunk.chunk_text) {
      const diffPos = findFirstDiffPos(expectedText, chunk.chunk_text);
      errors.push(
        `Chunk ${chunk.chunk_index} (${chunk.chunk_type}): slice mismatch at pos ${diffPos}. ` +
        `Expected len=${expectedText.length}, got len=${chunk.chunk_text.length}. ` +
        `Slice[${diffPos}..${diffPos + 20}]="${expectedText.slice(diffPos, diffPos + 20)}" vs ` +
        `Chunk[${diffPos}..${diffPos + 20}]="${chunk.chunk_text.slice(diffPos, diffPos + 20)}"`
      );
    }
  }

  // Check for large gaps (>100 chars of non-whitespace)
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].char_end;
    const gapEnd = sorted[i + 1].char_start;
    if (gapEnd > gapStart) {
      const gapText = originalText.slice(gapStart, gapEnd);
      if (gapText.trim().length > 100) {
        errors.push(
          `Gap of ${gapText.trim().length} non-whitespace chars between chunk ${sorted[i].chunk_index} and ${sorted[i + 1].chunk_index} (chars ${gapStart}-${gapEnd})`,
        );
      }
    }
  }

  // Check for overlap between non-reasoning chunks
  for (let i = 0; i < sorted.length - 1; i++) {
    const overlapAmount = sorted[i].char_end - sorted[i + 1].char_start;
    if (overlapAmount > 0) {
      const isReasoningOverlap = REASONING_TYPES.has(sorted[i + 1].chunk_type);
      // Phase 2a: allow overlap on chunks with explicit overlap_prev
      const hasExplicitOverlap = (sorted[i + 1].overlap_prev || 0) > 0;
      if (!isReasoningOverlap && !hasExplicitOverlap && overlapAmount > 10) {
        errors.push(
          `Unexpected overlap of ${overlapAmount} chars between chunk ${sorted[i].chunk_index} (${sorted[i].chunk_type}) and ${sorted[i + 1].chunk_index} (${sorted[i + 1].chunk_type})`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Find position of first character difference between two strings */
function findFirstDiffPos(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return len;
}

// ─── DOC TYPE ROUTING ─────────────────────────────────────────────

export async function chunkByDocType(input: LegalDocumentInput, docType: InferredDocType): Promise<ChunkResult> {
  const text = input.content_text;
  if (!text || text.length === 0) {
    return { chunks: [], strategy: "fixed", chunker_version: CHUNKER_VERSION };
  }

  let chunks: LegalChunk[];
  let strategy: ChunkResult["strategy"];
  let case_number: string | undefined;
  const warnings: string[] = [];

  switch (docType) {
    case "code_or_law":
      chunks = chunkLegislation(text, input);
      strategy = chunks.some(c => c.chunk_type === "article") ? "article" : "normative";
      chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
      break;

    case "court_decision":
      chunks = chunkCourtDecision(text, input);
      strategy = chunks.some(c =>
        ["reasoning", "facts", "resolution", "dissent", "arguments", "legal_position",
         "procedural_history", "appellant_arguments", "respondent_arguments", "norm_interpretation",
        ].includes(c.chunk_type)
      ) ? "sections" : "normative";
      case_number = extractCaseNumber(text);
      chunks = postProcessChunks(chunks, text, CAP_DECISION_CHUNKS_PER_FILE, warnings);
      break;

    case "treaty":
      chunks = chunkTreaty(text, input);
      strategy = chunks.some(c => c.chunk_type === "treaty_article") ? "treaty" : "normative";
      chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
      break;

    case "registry_table":
      chunks = chunkRegistryTable(text, input);
      strategy = "registry";
      chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
      break;

    case "normative_act":
      chunks = chunkNormativeAct(text, input);
      strategy = "normative";
      chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
      break;

    default:
      chunks = chunkStructuralFallback(text, "full_text", undefined, input.doc_type);
      strategy = "fixed";
      chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
      break;
  }

  await finalizeHashes(chunks);
  return { chunks, strategy, case_number, chunker_version: CHUNKER_VERSION, warnings: warnings.length > 0 ? warnings : undefined };
}

// ─── MAIN CHUNKER ──────────────────────────────────────────────────

const COURT_DOC_TYPES = new Set([
  "court_decision", "cassation_ruling", "appeal_ruling",
  "first_instance_ruling", "constitutional_court",
]);

const ECHR_DOC_TYPES = new Set([
  "echr_judgment", "echr",
]);

const LEGISLATION_DOC_TYPES = new Set([
  "law", "code", "regulation",
]);

const TREATY_DOC_TYPES = new Set([
  "international_treaty", "treaty", "agreement", "convention", "protocol",
]);

export async function chunkDocument(document: LegalDocumentInput): Promise<ChunkResult> {
  const rawInput = document.content_text;
  if (!rawInput || rawInput.length === 0) {
    return { chunks: [], strategy: "fixed", chunker_version: CHUNKER_VERSION };
  }

  // Phase 0: text cleanup v2 BEFORE doc-type inference and char_start/char_end computation
  const { cleaned } = cleanupTextV2(rawInput);
  const text = cleaned;
  if (!text || text.length === 0) {
    return { chunks: [], strategy: "fixed", chunker_version: CHUNKER_VERSION };
  }

  let chunks: LegalChunk[];
  let strategy: ChunkResult["strategy"];
  let case_number: string | undefined;
  const warnings: string[] = [];

  if (ECHR_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkEchrJudgment(text, document);
    const hasSections = chunks.some(c =>
      ["procedure", "facts", "law", "assessment", "conclusion", "just_satisfaction"].includes(c.chunk_type)
    );
    strategy = hasSections ? "echr" : "normative";
    case_number = chunks[0]?.metadata?.case_number || undefined;
    chunks = postProcessChunks(chunks, text, CAP_ECHR_CHUNKS_PER_FILE, warnings);
  } else if (TREATY_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkTreaty(text, document);
    strategy = chunks.some(c => c.chunk_type === "treaty_article") ? "treaty" : "normative";
    chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
  } else if (LEGISLATION_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkLegislation(text, document);
    strategy = chunks.some(c => c.chunk_type === "article") ? "article" : "normative";
    chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
  } else if (COURT_DOC_TYPES.has(document.doc_type)) {
    chunks = chunkCourtDecision(text, document);
    const hasSections = chunks.some(c =>
      ["reasoning", "facts", "resolution", "dissent", "arguments", "legal_position",
       "procedural_history", "appellant_arguments", "respondent_arguments", "norm_interpretation",
      ].includes(c.chunk_type)
    );
    strategy = hasSections ? "sections" : "normative";
    case_number = extractCaseNumber(text);
    chunks = postProcessChunks(chunks, text, CAP_DECISION_CHUNKS_PER_FILE, warnings);
  } else {
    const inferred = inferDocTypeFromText(text);
    if (inferred !== "other") {
      return await chunkByDocType(document, inferred);
    }
    chunks = chunkNormativeAct(text, document);
    strategy = "normative";
    chunks = postProcessChunks(chunks, text, CAP_LAW_CHUNKS_PER_FILE, warnings);
  }

  await finalizeHashes(chunks);
  return { chunks, strategy, case_number, chunker_version: CHUNKER_VERSION, warnings: warnings.length > 0 ? warnings : undefined };
}
