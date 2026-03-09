/**
 * Multi-source document merger.
 *
 * Matches TXT and PDF versions of the same Arlis document, then merges:
 *   - TXT  \u2192 primary text chunks
 *   - PDF  \u2192 all chunks (no special table handling)
 *   - Both sources recorded in metadata
 *
 * Matching rules (deterministic, no guessing):
 *   Rule 1 \u2014 Arlis URL/ID: extract numeric ID from arlis.am URLs
 *   Rule 2 \u2014 Strict title + date_adopted (fallback when no URL)
 *
 * IMPORTANT: No Armenian glyphs \u2014 all Unicode escapes \uXXXX.
 */

import { sha256Hex, type LegalChunk } from "./ingestion-service.ts";

// ─── TYPES ──────────────────────────────────────────────────────────

export interface SourceRecord {
  /** Unique key for this source within the merge set */
  sourceKey: string;
  /** Original file name */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** Source URL (arlis.am or other) */
  sourceUrl?: string;
  /** Normalized title from the document */
  title: string;
  /** Date adopted (ISO string YYYY-MM-DD or null) */
  dateAdopted?: string | null;
  /** Full text content */
  contentText: string;
  /** Chunks already produced by chunkDoc */
  chunks: LegalChunk[];
}

export interface MatchResult {
  matched: boolean;
  /** Which rule matched */
  rule: "arlis_id" | "title_date" | "none";
  /** The matching key used */
  matchKey: string | null;
  /** Fields that were compared */
  fieldsUsed: string[];
}

export interface MergedDocument {
  /** Primary text (from TXT source) */
  primaryText: string;
  /** Title from TXT source */
  title: string;
  /** All chunks from TXT source */
  textChunks: LegalChunk[];
  /** Chunks from PDF source (re-indexed) */
  pdfChunks: LegalChunk[];
  /** Combined chunk list in final order */
  allChunks: LegalChunk[];
  /** Both sources for metadata */
  sources: {
    txt: { fileName: string; sourceUrl?: string; hash: string };
    pdf: { fileName: string; sourceUrl?: string; hash: string };
  };
  /** Match details for transparency */
  match: MatchResult;
}

// ─── ARLIS ID EXTRACTION ────────────────────────────────────────────

const ARLIS_URL_RE = /arlis\.am\/(?:DocumentView|docview)\.aspx\?.*?docid=(\d+)/i;
const ARLIS_ID_RE = /arlis[_-]?id[_=:.-]?\s*(\d+)/i;

/**
 * Extract a numeric Arlis document ID from a URL or text.
 * Returns null if not found.
 */
export function extractArlisId(sourceUrl?: string, fileName?: string): string | null {
  if (sourceUrl) {
    const m = ARLIS_URL_RE.exec(sourceUrl);
    if (m) return m[1];
  }
  if (fileName) {
    const m = ARLIS_ID_RE.exec(fileName);
    if (m) return m[1];
  }
  return null;
}

// ─── MATCHING ───────────────────────────────────────────────────────

/**
 * Normalize title for comparison: lowercase, collapse whitespace,
 * strip punctuation except digits and Armenian/Latin letters.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[^\w\u0531-\u058f\u0561-\u0587\s\d]/g, "")
    .trim();
}

/**
 * Deterministic match between two source records.
 * Returns match result with the exact rule and fields used.
 */
export function matchSources(a: SourceRecord, b: SourceRecord): MatchResult {
  // Rule 1: Arlis ID match
  const idA = extractArlisId(a.sourceUrl, a.fileName);
  const idB = extractArlisId(b.sourceUrl, b.fileName);

  if (idA && idB && idA === idB) {
    return {
      matched: true,
      rule: "arlis_id",
      matchKey: `arlis:${idA}`,
      fieldsUsed: [
        `a.sourceUrl=${a.sourceUrl || "null"}`,
        `b.sourceUrl=${b.sourceUrl || "null"}`,
        `extracted_id_a=${idA}`,
        `extracted_id_b=${idB}`,
      ],
    };
  }

  // Rule 2: Strict title + date_adopted
  const titleA = normalizeTitle(a.title);
  const titleB = normalizeTitle(b.title);
  const dateA = a.dateAdopted || "";
  const dateB = b.dateAdopted || "";

  if (
    titleA.length > 0 &&
    titleA === titleB &&
    dateA.length > 0 &&
    dateA === dateB
  ) {
    return {
      matched: true,
      rule: "title_date",
      matchKey: `title_date:${titleA}|${dateA}`,
      fieldsUsed: [
        `a.title="${a.title}"`,
        `b.title="${b.title}"`,
        `normalized="${titleA}"`,
        `a.dateAdopted=${dateA}`,
        `b.dateAdopted=${dateB}`,
      ],
    };
  }

  return {
    matched: false,
    rule: "none",
    matchKey: null,
    fieldsUsed: [
      `arlis_id_a=${idA || "null"}`,
      `arlis_id_b=${idB || "null"}`,
      `title_a_norm="${titleA}"`,
      `title_b_norm="${titleB}"`,
      `date_a=${dateA || "null"}`,
      `date_b=${dateB || "null"}`,
    ],
  };
}

// ─── MERGING ────────────────────────────────────────────────────────

/**
 * Identify which source is TXT and which is PDF.
 * Returns [txt, pdf] or null if both are same type.
 */
function classifySources(
  a: SourceRecord,
  b: SourceRecord
): [SourceRecord, SourceRecord] | null {
  const aIsPdf =
    a.mimeType === "application/pdf" ||
    a.fileName.toLowerCase().endsWith(".pdf");
  const bIsPdf =
    b.mimeType === "application/pdf" ||
    b.fileName.toLowerCase().endsWith(".pdf");

  if (aIsPdf && !bIsPdf) return [b, a]; // b=txt, a=pdf → [txt, pdf]
  if (bIsPdf && !aIsPdf) return [a, b]; // a=txt, b=pdf → [txt, pdf]

  return null; // Both same type — cannot merge
}

/**
 * Merge two matched source records into a single merged document.
 * TXT provides primary text; PDF chunks are appended (re-indexed).
 * All chunks are treated uniformly — no special table handling.
 *
 * @throws Error if sources don't match or can't be classified
 */
export async function mergeSources(
  a: SourceRecord,
  b: SourceRecord
): Promise<MergedDocument> {
  const matchResult = matchSources(a, b);

  if (!matchResult.matched) {
    throw new Error(
      `Sources do not match. Rule: ${matchResult.rule}. ` +
        `Fields: ${matchResult.fieldsUsed.join("; ")}`
    );
  }

  const classified = classifySources(a, b);
  if (!classified) {
    throw new Error(
      "Cannot merge: both sources are the same type " +
        `(${a.mimeType}, ${b.mimeType}). Need one TXT and one PDF.`
    );
  }

  const [txtSource, pdfSource] = classified;

  // Re-index PDF chunks to continue after text chunks
  const textChunkCount = txtSource.chunks.length;
  const reindexedPdf: LegalChunk[] = pdfSource.chunks.map((c, i) => ({
    ...c,
    chunk_index: textChunkCount + i,
    label: c.label ? `[PDF] ${c.label}` : "[PDF]",
  }));

  const allChunks = [...txtSource.chunks, ...reindexedPdf];

  const txtHash = await sha256Hex(txtSource.contentText);
  const pdfHash = await sha256Hex(pdfSource.contentText);

  return {
    primaryText: txtSource.contentText,
    title: txtSource.title,
    textChunks: txtSource.chunks,
    pdfChunks: reindexedPdf,
    allChunks,
    sources: {
      txt: {
        fileName: txtSource.fileName,
        sourceUrl: txtSource.sourceUrl,
        hash: txtHash,
      },
      pdf: {
        fileName: pdfSource.fileName,
        sourceUrl: pdfSource.sourceUrl,
        hash: pdfHash,
      },
    },
    match: matchResult,
  };
}

// ─── BATCH MATCHER ──────────────────────────────────────────────────

export interface MatchCandidate {
  source: SourceRecord;
  arlisId: string | null;
  titleNorm: string;
  dateAdopted: string;
}

/**
 * Given a list of source records, find all matching pairs.
 * Returns pairs grouped by match key.
 * Does NOT merge — just identifies matches for the caller to decide.
 */
export function findMatchingPairs(
  sources: SourceRecord[]
): Map<string, SourceRecord[]> {
  const byArlisId = new Map<string, SourceRecord[]>();
  const byTitleDate = new Map<string, SourceRecord[]>();

  for (const s of sources) {
    const arlisId = extractArlisId(s.sourceUrl, s.fileName);
    if (arlisId) {
      const key = `arlis:${arlisId}`;
      if (!byArlisId.has(key)) byArlisId.set(key, []);
      byArlisId.get(key)!.push(s);
    }

    const titleNorm = normalizeTitle(s.title);
    const date = s.dateAdopted || "";
    if (titleNorm && date) {
      const key = `title_date:${titleNorm}|${date}`;
      if (!byTitleDate.has(key)) byTitleDate.set(key, []);
      byTitleDate.get(key)!.push(s);
    }
  }

  // Combine: arlis ID matches take priority
  const result = new Map<string, SourceRecord[]>();
  const consumed = new Set<string>();

  for (const [key, group] of byArlisId) {
    if (group.length >= 2) {
      result.set(key, group);
      for (const s of group) consumed.add(s.sourceKey);
    }
  }

  for (const [key, group] of byTitleDate) {
    const unconsumed = group.filter((s) => !consumed.has(s.sourceKey));
    if (unconsumed.length >= 2) {
      result.set(key, unconsumed);
    }
  }

  return result;
}
