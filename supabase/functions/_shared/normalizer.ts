/**
 * Shared normalizer logic — extracted from legal-document-normalizer/index.ts
 * so that both the normalizer endpoint and ingest-document orchestrator
 * can reuse the same code.
 *
 * IMPORTANT: No Armenian glyphs — all Unicode escapes \uXXXX.
 */

import { preprocessText } from "./text-preprocessor.ts";

// ─── ENUMS ──────────────────────────────────────────────────────────
export const DOC_TYPES = [
  "law", "code", "court_decision", "constitutional_court",
  "government_decree", "pm_decision", "regulation",
  "international_treaty", "echr_judgment", "legal_commentary",
  "cassation_ruling", "appeal_ruling", "first_instance_ruling", "other",
] as const;
export type DocType = typeof DOC_TYPES[number];

export const COURT_TYPES = [
  "first_instance", "appeal", "cassation", "constitutional", "echr",
] as const;
export type CourtType = typeof COURT_TYPES[number];

export const BRANCHES = [
  "criminal", "civil", "administrative", "constitutional",
  "labor", "family", "tax", "customs", "electoral",
  "land", "environmental", "international", "echr", "other",
] as const;
export type LegalBranch = typeof BRANCHES[number];

// ─── INTERFACES ─────────────────────────────────────────────────────
export interface NormalizerInput {
  fileName: string;
  mimeType: string;
  rawText: string;
  sourceUrl?: string;
}

export interface CourtMeta {
  court_type: CourtType;
  court_name: string | null;
  case_number: string | null;
  judge_names: string[] | null;
  outcome: string | null;
}

export interface LegalDocument {
  doc_type: DocType;
  jurisdiction: "AM";
  branch: LegalBranch;
  title: string;
  title_alt: string | null;
  content_text: string;
  document_number: string | null;
  date_adopted: string | null;
  date_effective: string | null;
  source_url: string | null;
  source_name: string | null;
  court: CourtMeta | null;
  applied_articles: unknown[] | null;
  key_violations: string[] | null;
  legal_reasoning_summary: string | null;
  decision_map: unknown | null;
  ingestion: {
    pipeline: string;
    ingested_at: string;
    schema_version: "1.0";
    source_hash: string | null;
  };
  is_active: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
}

// ─── REGEX PATTERNS (all Armenian chars as Unicode escapes) ─────────

const ARMENIAN_MONTHS: Record<string, string> = {
  "\u0570\u0578\u0582\u0576\u057e\u0561\u0580": "01",
  "\u0583\u0565\u057f\u0580\u057e\u0561\u0580": "02",
  "\u0574\u0561\u0580\u057f": "03",
  "\u0561\u057a\u0580\u056b\u056c": "04",
  "\u0574\u0561\u0575\u056b\u057d": "05",
  "\u0570\u0578\u0582\u0576\u056b\u057d": "06",
  "\u0570\u0578\u0582\u056c\u056b\u057d": "07",
  "\u0585\u0563\u0578\u057d\u057f\u0578\u057d": "08",
  "\u057d\u0565\u057a\u057f\u0565\u0574\u0562\u0565\u0580": "09",
  "\u0570\u0578\u056f\u057f\u0565\u0574\u0562\u0565\u0580": "10",
  "\u0576\u0578\u0575\u0565\u0574\u0562\u0565\u0580": "11",
  "\u0564\u0565\u056f\u057f\u0565\u0574\u0562\u0565\u0580": "12",
};

const MONTH_ALTS = Object.keys(ARMENIAN_MONTHS).join("|");

const AM_DATE_RE = new RegExp(
  "(\\d{1,2})\\s+(" + MONTH_ALTS + ")\\u056b?\\s+(\\d{4})\\s*(?:\u0569\u057e\u0561\u056f\u0561\u0576\u056b|\u0569\\.?)?",
  "i"
);
const NUMERIC_DATE_RE = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/;
const ISO_DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;

const ACT_NUMBER_RE = /[\u0531-\u058f]{1,4}-\d{1,6}-[\u0531-\u058f]/;
const CASE_NUMBER_RE = /[\u0531-\u0556]{2,4}\/\d{1,5}\/\d{1,4}\/\d{2,4}/;

const CASSATION_RE = /\u057e\u0573\u057c\u0561\u0562\u0565\u056f/i;
const APPEAL_RE = /\u057e\u0565\u0580\u0561\u057a\u0565\u056c\u0561\u056f\u0561\u0576/i;
const CONSTITUTIONAL_RE = /\u057d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576/i;
const ECHR_RE = /\u0544\u053b\u0535\u0534/i;
const COURT_WORD_RE = /\u0564\u0561\u057f\u0561\u0580\u0561\u0576/i;

const CODE_RE = /\u0585\u0580\u0565\u0576\u057d\u0563\u056b\u0580\u0584/i;
const LAW_RE = /\u0585\u0580\u0565\u0576\u0584/i;
const GOVT_RE = /\u056f\u0561\u057c\u0561\u057e\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576/i;
const PM_RE = /\u057e\u0561\u0580\u0579\u0561\u057a\u0565\u057f/i;

const CRIMINAL_RE = /\u0584\u0580\u0565\u0561\u056f\u0561\u0576/i;
const CIVIL_RE = /\u0584\u0561\u0572\u0561\u0584\u0561\u056f\u0561\u0576/i;
const ADMIN_RE = /\u057e\u0561\u0580\u0579\u0561\u056f\u0561\u0576/i;
const LABOR_RE = /\u0561\u0577\u056d\u0561\u057f\u0561\u0576\u0584\u0561\u0575\u056b\u0576/i;
const FAMILY_RE = /\u0568\u0576\u057f\u0561\u0576\u0565\u056f\u0561\u0576/i;
const TAX_RE = /\u0570\u0561\u0580\u056f\u0561\u0575\u056b\u0576/i;

const OUTCOME_GRANTED_RE = /\u0532\u0561\u057e\u0561\u0580\u0561\u0580\u0565\u056c/i;
const OUTCOME_REJECTED_RE = /\u0544\u0565\u0580\u056a\u0565\u056c/i;
const OUTCOME_PARTIAL_RE = /\u0544\u0561\u057d\u0576\u0561\u056f\u056b\u0578\u0580\u0565\u0576|\u0562\u0561\u057e\u0561\u0580\u0561\u0580\u057e\u0565\u056c\s+\u0574\u0561\u057d\u0576\u0561\u056f\u056b/i;
const OUTCOME_REMANDED_RE = /\u054e\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0576\u0565\u056c|\u057e\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u0576\u0565\u056c/i;
const OUTCOME_DISCONTINUED_RE = /\u053f\u0561\u0580\u0573\u0565\u056c|\u056f\u0561\u0580\u0573\u0565\u056c/i;

// ─── HELPERS ────────────────────────────────────────────────────────

function extractFirstDate(text: string): string | null {
  const amMatch = text.match(AM_DATE_RE);
  if (amMatch) {
    const day = amMatch[1].padStart(2, "0");
    const monthKey = amMatch[2];
    const year = amMatch[3];
    const month = ARMENIAN_MONTHS[monthKey];
    if (month) return `${year}-${month}-${day}`;
  }
  const isoMatch = text.match(ISO_DATE_RE);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const numMatch = text.match(NUMERIC_DATE_RE);
  if (numMatch) {
    const day = numMatch[1].padStart(2, "0");
    const month = numMatch[2].padStart(2, "0");
    const year = numMatch[3];
    if (parseInt(month) >= 1 && parseInt(month) <= 12) {
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

function extractActNumber(text: string): string | null {
  const match = text.match(ACT_NUMBER_RE);
  return match ? match[0] : null;
}

function extractCaseNumber(text: string): string | null {
  const match = text.match(CASE_NUMBER_RE);
  return match ? match[0] : null;
}

function detectCourtType(text: string): CourtType | null {
  const header = text.slice(0, 3000);
  if (ECHR_RE.test(header)) return "echr";
  if (CONSTITUTIONAL_RE.test(header)) return "constitutional";
  if (CASSATION_RE.test(header)) return "cassation";
  if (APPEAL_RE.test(header)) return "appeal";
  if (COURT_WORD_RE.test(header)) return "first_instance";
  return null;
}

function detectCourtName(text: string): string | null {
  const header = text.slice(0, 2000);
  const courtNameRe = /([\u0531-\u058f\s]{3,50}\u0564\u0561\u057f\u0561\u0580\u0561\u0576)/i;
  const match = header.match(courtNameRe);
  return match ? match[1].trim() : null;
}

function inferDocType(fileName: string, text: string): DocType {
  const fn = fileName.toLowerCase();
  const header = text.slice(0, 3000).toLowerCase();

  if (ECHR_RE.test(header) || fn.includes("echr") || fn.includes("mied")) return "echr_judgment";
  if (CONSTITUTIONAL_RE.test(header) && COURT_WORD_RE.test(header)) return "constitutional_court";
  if (CASSATION_RE.test(header) || fn.includes("cassation")) return "cassation_ruling";
  if (APPEAL_RE.test(header) || fn.includes("appeal")) return "appeal_ruling";

  const caseNum = extractCaseNumber(text);
  if (caseNum && COURT_WORD_RE.test(header)) return "court_decision";
  if (GOVT_RE.test(header) || fn.includes("government")) return "government_decree";
  if (PM_RE.test(header) || fn.includes("pm_decision")) return "pm_decision";
  if (CODE_RE.test(header) || fn.includes("code") || fn.includes("orensgirq")) return "code";
  if (LAW_RE.test(header) || fn.includes("law") || fn.includes("orenq")) return "law";
  if (COURT_WORD_RE.test(header) && caseNum) return "first_instance_ruling";

  return "other";
}

function inferBranch(text: string, docType: DocType): LegalBranch {
  const header = text.slice(0, 5000);
  if (docType === "echr_judgment") return "echr";
  if (docType === "constitutional_court") return "constitutional";
  if (CRIMINAL_RE.test(header)) return "criminal";
  if (CIVIL_RE.test(header)) return "civil";
  if (ADMIN_RE.test(header)) return "administrative";
  if (LABOR_RE.test(header)) return "labor";
  if (FAMILY_RE.test(header)) return "family";
  if (TAX_RE.test(header)) return "tax";
  return "other";
}

function detectOutcome(text: string): string | null {
  const tail = text.slice(-5000);
  if (OUTCOME_PARTIAL_RE.test(tail)) return "partial";
  if (OUTCOME_GRANTED_RE.test(tail)) return "granted";
  if (OUTCOME_REJECTED_RE.test(tail)) return "rejected";
  if (OUTCOME_REMANDED_RE.test(tail)) return "remanded";
  if (OUTCOME_DISCONTINUED_RE.test(tail)) return "discontinued";
  return null;
}

function extractTitle(text: string, _docType: DocType): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "Untitled";
  const candidateLines = lines.slice(0, 5);
  let title = candidateLines[0];
  if (title.length < 10 && candidateLines.length > 1) {
    title = candidateLines.slice(0, 3).join(" ");
  }
  return title.slice(0, 500);
}

// ─── SHA-256 HASH ───────────────────────────────────────────────────

const HASH_PREFIX_CHARS = 10_000;

/**
 * Compute SHA-256 hex digest of the first N chars of text.
 * Uses Web Crypto API (available in Deno/Edge runtime).
 */
export async function sha256Hex(text: string): Promise<string> {
  const prefix = text.slice(0, HASH_PREFIX_CHARS);
  const data = new TextEncoder().encode(prefix);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── NORMALIZER (now async for SHA-256) ─────────────────────────────

export async function normalize(input: NormalizerInput): Promise<LegalDocument> {
  const { fileName, rawText, sourceUrl } = input;

  // Hash raw text BEFORE preprocessing (for stable dedup)
  const sourceHash = await sha256Hex(rawText);

  // Preprocess: strip PDF/HTML noise while preserving legal structure
  const isHtml = (input.mimeType || "").includes("html");
  const { cleaned: contentText } = preprocessText(rawText, { isHtml });

  const docType = inferDocType(fileName, contentText);
  const branch = inferBranch(contentText, docType);
  const title = extractTitle(contentText, docType);
  const dateAdopted = extractFirstDate(contentText.slice(0, 3000));
  const actNumber = extractActNumber(contentText.slice(0, 3000));

  const isCourtDecision = [
    "court_decision", "cassation_ruling", "appeal_ruling",
    "first_instance_ruling", "constitutional_court", "echr_judgment",
  ].includes(docType);

  let court: CourtMeta | null = null;
  if (isCourtDecision) {
    const courtType = detectCourtType(contentText);
    court = {
      court_type: courtType || "first_instance",
      court_name: detectCourtName(contentText),
      case_number: extractCaseNumber(contentText),
      judge_names: null,
      outcome: detectOutcome(contentText),
    };
  }

  const sourceName = sourceUrl
    ? (sourceUrl.includes("arlis.am")
        ? "arlis.am"
        : sourceUrl.includes("datalex.am")
          ? "datalex.am"
          : null)
    : null;

  return {
    doc_type: docType,
    jurisdiction: "AM",
    branch,
    title,
    title_alt: null,
    content_text: contentText,
    document_number: actNumber,
    date_adopted: dateAdopted,
    date_effective: null,
    source_url: sourceUrl || null,
    source_name: sourceName,
    court,
    applied_articles: null,
    key_violations: null,
    legal_reasoning_summary: null,
    decision_map: null,
    ingestion: {
      pipeline: "legal-document-normalizer",
      ingested_at: new Date().toISOString(),
      schema_version: "1.0",
      source_hash: sourceHash,
    },
    is_active: true,
  };
}

// ─── VALIDATION ─────────────────────────────────────────────────────

function isValidDocType(v: string): v is DocType {
  return (DOC_TYPES as readonly string[]).includes(v);
}
function isValidBranch(v: string): v is LegalBranch {
  return (BRANCHES as readonly string[]).includes(v);
}
function isValidCourtType(v: string): v is CourtType {
  return (COURT_TYPES as readonly string[]).includes(v);
}

export function validate(doc: LegalDocument): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!isValidDocType(doc.doc_type)) {
    errors.push({ field: "doc_type", message: `Invalid doc_type: ${doc.doc_type}` });
  }
  if (doc.jurisdiction !== "AM") {
    errors.push({ field: "jurisdiction", message: "Must be 'AM'" });
  }
  if (!isValidBranch(doc.branch)) {
    errors.push({ field: "branch", message: `Invalid branch: ${doc.branch}` });
  }
  if (!doc.title || doc.title.length === 0) {
    errors.push({ field: "title", message: "Title is required" });
  }
  if (!doc.content_text || doc.content_text.length === 0) {
    errors.push({ field: "content_text", message: "Content text is required" });
  }
  if (doc.date_adopted && !/^\d{4}-\d{2}-\d{2}$/.test(doc.date_adopted)) {
    errors.push({ field: "date_adopted", message: "Must be YYYY-MM-DD" });
  }
  if (doc.date_effective && !/^\d{4}-\d{2}-\d{2}$/.test(doc.date_effective)) {
    errors.push({ field: "date_effective", message: "Must be YYYY-MM-DD" });
  }
  if (doc.court) {
    if (!isValidCourtType(doc.court.court_type)) {
      errors.push({ field: "court.court_type", message: `Invalid: ${doc.court.court_type}` });
    }
  }
  if (doc.ingestion.schema_version !== "1.0") {
    errors.push({ field: "ingestion.schema_version", message: "Must be '1.0'" });
  }
  return errors;
}
