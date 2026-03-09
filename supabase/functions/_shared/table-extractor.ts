/**
 * Table detector and markdown converter for text extracted from PDFs.
 *
 * Heuristic-based: detects tabular patterns in OCR/text output
 * and converts them to Markdown table format.
 *
 * No new dependencies. Works on raw text lines.
 *
 * IMPORTANT: No Armenian glyphs \u2014 all Unicode escapes \uXXXX.
 */

// ─── TYPES ──────────────────────────────────────────────────────────

export interface ExtractedTable {
  /** 0-based index of the table in the document */
  tableIndex: number;
  /** Character offset where the table starts in the source text */
  charStart: number;
  /** Character offset where the table ends */
  charEnd: number;
  /** Markdown-formatted table */
  markdown: string;
  /** Raw text of the table region */
  rawText: string;
  /** Quality assessment */
  quality: "high" | "medium" | "low";
  /** Number of rows detected */
  rowCount: number;
  /** Number of columns detected */
  colCount: number;
  /** Optional label/caption found near the table */
  caption: string | null;
}

// ─── DETECTION PATTERNS ─────────────────────────────────────────────

/**
 * Pattern 1: Pipe-delimited tables (already markdown-like)
 * Example: | Col1 | Col2 | Col3 |
 */
const PIPE_TABLE_RE = /^[ \t]*\|.+\|[ \t]*$/;

/**
 * Pattern 2: Tab-separated values (common in OCR output)
 * At least 2 tabs on a line
 */
const TAB_SEP_RE = /\t.*\t/;

/**
 * Pattern 3: Consistent multi-space alignment (OCR tables)
 * 3+ spaces used as column separator, at least 2 columns
 */
const SPACE_ALIGNED_RE = /\S+\s{3,}\S+\s{3,}\S+/;

/**
 * Pattern 4: Table caption markers (Armenian and Russian)
 * \u0531\u0572\u0575\u0578\u0582\u057d\u0561\u056f = \u0531\u0572\u0575\u0578\u0582\u057d\u0561\u056f (Table)
 * \u0422\u0430\u0431\u043b\u0438\u0446\u0430 = \u0422\u0430\u0431\u043b\u0438\u0446\u0430 (Table)
 */
const TABLE_CAPTION_RE =
  /^[ \t]*(?:\u0531\u0572\u0575\u0578\u0582\u057d\u0561\u056f|\u0422\u0430\u0431\u043b\u0438\u0446\u0430|Table)\s*[#\u2116.]?\s*\d*/i;

// ─── LINE CLASSIFIER ────────────────────────────────────────────────

type LineType = "pipe" | "tab" | "space_aligned" | "text" | "empty" | "caption";

function classifyLine(line: string): LineType {
  if (line.trim().length === 0) return "empty";
  if (TABLE_CAPTION_RE.test(line)) return "caption";
  if (PIPE_TABLE_RE.test(line)) return "pipe";
  if (TAB_SEP_RE.test(line)) return "tab";
  if (SPACE_ALIGNED_RE.test(line)) return "space_aligned";
  return "text";
}

// ─── TABLE REGION FINDER ────────────────────────────────────────────

interface TableRegion {
  startLine: number;
  endLine: number; // exclusive
  lineType: "pipe" | "tab" | "space_aligned";
  caption: string | null;
}

const MIN_TABLE_ROWS = 2;

/**
 * Scan lines to find contiguous table regions.
 * A region is 2+ consecutive lines of the same tabular type.
 */
export function findTableRegions(lines: string[]): TableRegion[] {
  const regions: TableRegion[] = [];
  let i = 0;

  while (i < lines.length) {
    const lt = classifyLine(lines[i]);

    // Check for caption preceding a table
    let caption: string | null = null;
    let tableStart = i;
    if (lt === "caption") {
      caption = lines[i].trim();
      i++;
      tableStart = i;
      if (i >= lines.length) break;
    }

    const currentType = classifyLine(lines[i]);
    if (currentType !== "pipe" && currentType !== "tab" && currentType !== "space_aligned") {
      if (lt !== "caption") i++;
      continue;
    }

    // Find contiguous run of same type (allow 1 empty line gap)
    let j = i + 1;
    let gapCount = 0;
    while (j < lines.length) {
      const jType = classifyLine(lines[j]);
      if (jType === currentType) {
        gapCount = 0;
        j++;
      } else if (jType === "empty" && gapCount === 0) {
        gapCount++;
        j++;
      } else {
        break;
      }
    }

    // Trim trailing empties
    while (j > i && classifyLine(lines[j - 1]) === "empty") j--;

    const rowCount = j - i;
    if (rowCount >= MIN_TABLE_ROWS) {
      regions.push({
        startLine: tableStart,
        endLine: j,
        lineType: currentType,
        caption,
      });
    }

    i = j;
  }

  return regions;
}

// ─── CONVERTERS ─────────────────────────────────────────────────────

/**
 * Split a line into columns based on the detected separator type.
 */
function splitColumns(line: string, lineType: "pipe" | "tab" | "space_aligned"): string[] {
  switch (lineType) {
    case "pipe": {
      const trimmed = line.trim();
      const inner = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
      const cleaned = inner.endsWith("|") ? inner.slice(0, -1) : inner;
      return cleaned.split("|").map((c) => c.trim());
    }
    case "tab":
      return line.split("\t").map((c) => c.trim());
    case "space_aligned":
      return line.split(/\s{3,}/).map((c) => c.trim()).filter((c) => c.length > 0);
  }
}

/**
 * Check if a line is a markdown separator row (e.g., |---|---|)
 */
function isSeparatorRow(line: string): boolean {
  return /^\|?\s*[-:]+(\s*\|\s*[-:]+)*\s*\|?\s*$/.test(line.trim());
}

/**
 * Convert table lines to a Markdown table string.
 */
function toMarkdownTable(
  lines: string[],
  lineType: "pipe" | "tab" | "space_aligned"
): { markdown: string; colCount: number; rowCount: number; quality: "high" | "medium" | "low" } {
  // Filter out separator rows and empty lines
  const dataLines = lines.filter(
    (l) => l.trim().length > 0 && !isSeparatorRow(l)
  );

  if (dataLines.length === 0) {
    return { markdown: "", colCount: 0, rowCount: 0, quality: "low" };
  }

  const rows = dataLines.map((l) => splitColumns(l, lineType));

  // Determine max columns
  const colCount = Math.max(...rows.map((r) => r.length));

  // Pad rows to same column count
  const padded = rows.map((r) => {
    while (r.length < colCount) r.push("");
    return r;
  });

  // Build markdown
  const mdRows: string[] = [];

  // Header row
  mdRows.push("| " + padded[0].join(" | ") + " |");
  // Separator
  mdRows.push("| " + padded[0].map(() => "---").join(" | ") + " |");
  // Data rows
  for (let i = 1; i < padded.length; i++) {
    mdRows.push("| " + padded[i].join(" | ") + " |");
  }

  // Assess quality
  let quality: "high" | "medium" | "low" = "high";
  if (lineType === "space_aligned") quality = "medium";

  // Check column consistency
  const colCounts = rows.map((r) => r.length);
  const variance = colCounts.some((c) => c !== colCount);
  if (variance && quality === "high") quality = "medium";
  if (variance && lineType === "space_aligned") quality = "low";

  return {
    markdown: mdRows.join("\n"),
    colCount,
    rowCount: padded.length,
    quality,
  };
}

// ─── MAIN EXTRACTOR ─────────────────────────────────────────────────

/**
 * Extract all tables from document text.
 * Returns table metadata + markdown for each detected table.
 */
export function extractTables(text: string): ExtractedTable[] {
  const allLines = text.split("\n");
  const regions = findTableRegions(allLines);
  const tables: ExtractedTable[] = [];

  for (let t = 0; t < regions.length; t++) {
    const region = regions[t];
    const regionLines = allLines.slice(region.startLine, region.endLine);

    // Separate caption lines from data lines
    const dataLines = regionLines.filter(
      (l) => !TABLE_CAPTION_RE.test(l)
    );

    const rawText = regionLines.join("\n");

    // Calculate char offsets
    let charStart = 0;
    for (let i = 0; i < region.startLine; i++) {
      charStart += allLines[i].length + 1; // +1 for \n
    }
    let charEnd = charStart;
    for (let i = region.startLine; i < region.endLine; i++) {
      charEnd += allLines[i].length + 1;
    }

    const { markdown, colCount, rowCount, quality } = toMarkdownTable(
      dataLines,
      region.lineType
    );

    if (markdown.length === 0) continue;

    tables.push({
      tableIndex: t,
      charStart,
      charEnd,
      markdown,
      rawText,
      quality,
      rowCount,
      colCount,
      caption: region.caption,
    });
  }

  return tables;
}
