/**
 * Text preprocessor for PDF/HTML ingested legal documents.
 * Deterministic transformations — no ML, no external deps.
 *
 * Rules applied (in order):
 *  1. Strip HTML tags (if HTML input)
 *  2. Decode common HTML entities
 *  3. Remove repeated headers/footers (page-level duplicates)
 *  4. Remove repeated URLs / navigation links
 *  5. Collapse excessive whitespace (preserve paragraph breaks)
 *  6. Remove page number lines
 *  7. Strip BOM and zero-width chars
 *  8. Trim leading/trailing whitespace per line
 *
 * IMPORTANT: No Armenian glyphs — all Unicode escapes \uXXXX.
 */

export interface PreprocessResult {
  /** Cleaned text ready for chunking */
  cleaned: string;
  /** Number of rules that modified the text */
  rulesApplied: number;
  /** Char count delta (original - cleaned) */
  charsRemoved: number;
}

// ─── HTML TAG STRIPPER ──────────────────────────────────────────────

const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;
const STYLE_SCRIPT_RE = /<(style|script)[^>]*>[\s\S]*?<\/\1>/gi;

function stripHtml(text: string): string {
  let result = text;
  result = result.replace(STYLE_SCRIPT_RE, " ");
  result = result.replace(HTML_COMMENT_RE, " ");
  result = result.replace(HTML_TAG_RE, " ");
  return result;
}

// ─── HTML ENTITY DECODER ────────────────────────────────────────────

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "\u2013",
  "&mdash;": "\u2014",
  "&laquo;": "\u00ab",
  "&raquo;": "\u00bb",
};

const NAMED_ENTITY_RE = /&(amp|lt|gt|quot|apos|nbsp|ndash|mdash|laquo|raquo);/gi;
const NUMERIC_ENTITY_RE = /&#(\d+);/g;
const HEX_ENTITY_RE = /&#x([0-9a-fA-F]+);/g;

function decodeEntities(text: string): string {
  let result = text.replace(NAMED_ENTITY_RE, (match) => {
    return ENTITY_MAP[match.toLowerCase()] || match;
  });
  result = result.replace(NUMERIC_ENTITY_RE, (_m, code) =>
    String.fromCharCode(parseInt(code, 10))
  );
  result = result.replace(HEX_ENTITY_RE, (_m, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return result;
}

// ─── BOM & ZERO-WIDTH CHARS ────────────────────────────────────────

const INVISIBLE_CHARS_RE = /[\uFEFF\u200B\u200C\u200D\u2060\uFFFE]/g;

function stripInvisible(text: string): string {
  return text.replace(INVISIBLE_CHARS_RE, "");
}

// ─── PAGE NUMBERS ──────────────────────────────────────────────────

// Lines that are just a number (page numbers from PDF extraction)
const PAGE_NUMBER_LINE_RE = /^\s*-?\s*\d{1,4}\s*-?\s*$/;
// "Page X of Y" patterns (Armenian, Russian, English)
const PAGE_OF_RE = /^\s*(?:page|p\.|str\.|стр\.?|\u0537\u057b)\s*\d+\s*(?:of|\/|\u056b\u0566|из)?\s*\d*\s*$/i;

function removePageNumbers(lines: string[]): string[] {
  return lines.filter((line) => {
    if (PAGE_NUMBER_LINE_RE.test(line)) return false;
    if (PAGE_OF_RE.test(line)) return false;
    return true;
  });
}

// ─── REPEATED HEADER/FOOTER DETECTION ──────────────────────────────

/**
 * Detects lines that repeat 3+ times across the document,
 * typically PDF page headers/footers. Only removes short lines (<120 chars)
 * to avoid stripping repeated legal text.
 */
function removeRepeatedHeaderFooters(lines: string[]): string[] {
  const lineCounts = new Map<string, number>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.length > 120) continue;
    lineCounts.set(trimmed, (lineCounts.get(trimmed) || 0) + 1);
  }

  const repeatedLines = new Set<string>();
  for (const [text, count] of lineCounts) {
    // Must appear 3+ times and be short (header/footer-like)
    if (count >= 3 && text.length < 120) {
      repeatedLines.add(text);
    }
  }

  if (repeatedLines.size === 0) return lines;

  return lines.filter((line) => !repeatedLines.has(line.trim()));
}

// ─── URL / NAVIGATION NOISE ────────────────────────────────────────

// Lines that are just a URL or navigation breadcrumbs
const BARE_URL_LINE_RE = /^\s*https?:\/\/\S+\s*$/;
// Common navigation patterns from web-scraped PDFs
const NAV_LINE_RE =
  /^\s*(?:Home|Main|\u0533\u056c\u056d\u0561\u057e\u0578\u0580|\u0413\u043b\u0430\u0432\u043d\u0430\u044f)\s*[>|»\u203a]\s*/i;
// Repeated URL fragments (e.g., "www.arlis.am" appearing on every page)
const ARLIS_NOISE_RE = /^\s*(?:www\.)?arlis\.am\s*$/i;

function removeUrlNoise(lines: string[]): string[] {
  return lines.filter((line) => {
    if (BARE_URL_LINE_RE.test(line)) return false;
    if (NAV_LINE_RE.test(line)) return false;
    if (ARLIS_NOISE_RE.test(line)) return false;
    return true;
  });
}

// ─── WHITESPACE NORMALIZATION ──────────────────────────────────────

/**
 * Collapse runs of 3+ blank lines into 2 (preserving paragraph breaks).
 * Collapse horizontal whitespace (tabs, multiple spaces) into single space.
 * Trim each line.
 */
function normalizeWhitespace(text: string): string {
  // Horizontal: tabs and multi-spaces to single space (per line)
  let result = text.replace(/[^\S\n]+/g, " ");

  // Trim each line
  result = result
    .split("\n")
    .map((l) => l.trim())
    .join("\n");

  // Vertical: collapse 3+ newlines into 2 (one blank line = paragraph break)
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

// ─── CORRUPT ENCODING FRAGMENTS ────────────────────────────────────

/**
 * Remove lines that are clearly garbled encoding artifacts from PDFs
 * (e.g., "Zuuupp", "puugu" — sequences with no Armenian/Cyrillic/Latin words).
 * Only removes lines where >60% chars are repeated or meaningless patterns.
 */
const GARBLED_LINE_RE = /^[A-Za-z]{3,}$/;

function isGarbled(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 4 || trimmed.length > 30) return false;
  if (!GARBLED_LINE_RE.test(trimmed)) return false;

  // Check if it's a real word — real words have varied characters
  const uniqueChars = new Set(trimmed.toLowerCase()).size;
  const ratio = uniqueChars / trimmed.length;
  // "Zuuupp" → 4/6 = 0.67 — borderline; "the" → 3/3 = 1.0
  // Only flag very low diversity AND no Armenian/Cyrillic
  if (ratio < 0.4) return true;

  return false;
}

function removeGarbled(lines: string[]): string[] {
  return lines.filter((line) => !isGarbled(line));
}

// ─── MAIN PREPROCESSOR ────────────────────────────────────────────

export function preprocessText(
  rawText: string,
  opts?: { isHtml?: boolean }
): PreprocessResult {
  const originalLen = rawText.length;
  let text = rawText;
  let rulesApplied = 0;

  // 1. Strip invisible chars
  const afterInvisible = stripInvisible(text);
  if (afterInvisible !== text) rulesApplied++;
  text = afterInvisible;

  // 2. HTML handling
  if (opts?.isHtml || /<\/?[a-zA-Z]/.test(text.slice(0, 2000))) {
    const afterHtml = stripHtml(text);
    if (afterHtml !== text) rulesApplied++;
    text = afterHtml;

    const afterEntities = decodeEntities(text);
    if (afterEntities !== text) rulesApplied++;
    text = afterEntities;
  }

  // 3-7. Line-level cleaning
  let lines = text.split("\n");

  const len1 = lines.length;
  lines = removePageNumbers(lines);
  if (lines.length !== len1) rulesApplied++;

  const len2 = lines.length;
  lines = removeRepeatedHeaderFooters(lines);
  if (lines.length !== len2) rulesApplied++;

  const len3 = lines.length;
  lines = removeUrlNoise(lines);
  if (lines.length !== len3) rulesApplied++;

  const len4 = lines.length;
  lines = removeGarbled(lines);
  if (lines.length !== len4) rulesApplied++;

  text = lines.join("\n");

  // 8. Whitespace normalization
  const afterWs = normalizeWhitespace(text);
  if (afterWs !== text) rulesApplied++;
  text = afterWs;

  return {
    cleaned: text,
    rulesApplied,
    charsRemoved: originalLen - text.length,
  };
}
