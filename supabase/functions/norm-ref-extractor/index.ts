/**
 * norm-ref-extractor
 *
 * Problem:
 *   Court decision chunks reference specific legal norms (articles, parts, points)
 *   but these references are embedded in unstructured Armenian text. Without
 *   extraction, RAG cannot link chunks to specific legislation provisions.
 *
 * Risk:
 *   - Missed norm references degrade cross-referencing quality
 *   - Hallucinated act_numbers create false linkages in the knowledge graph
 *   - Non-deterministic extraction breaks reproducibility
 *
 * Solution:
 *   Pure, deterministic regex-based extractor that:
 *   1) Finds all Armenian norm reference patterns in chunk text
 *   2) Extracts article, part, point numbers
 *   3) Extracts act_number ONLY when explicitly adjacent in text
 *   4) Returns deduplicated, sorted norm_refs array
 *   5) NEVER guesses — missing fields are null
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors, checkInternalAuth } from "../_shared/edge-security.ts";

// ─── TYPES ──────────────────────────────────────────────────────────

export interface NormRef {
  /** Act number like "\u0540\u0555-528-\u0546" — null if not found in context */
  act_number: string | null;
  /** Article number, e.g. "391", "23" */
  article: string;
  /** Part number, e.g. "1", "2" — null if not specified */
  part: string | null;
  /** Point number, e.g. "3" — null if not specified */
  point: string | null;
}

export interface NormRefResult {
  norm_refs: NormRef[];
}

// ─── REGEX PATTERNS ─────────────────────────────────────────────────
// All Armenian characters as Unicode escapes per project standard.

/**
 * Core article pattern:
 * \u0540\u0578\u0564\u057e\u0561\u056e = "\u0540\u0578\u0564\u057e\u0561\u056e" (Article, uppercase start)
 * \u0570\u0578\u0564\u057e\u0561\u056e = "\u0570\u0578\u0564\u057e\u0561\u056e" (article, lowercase start)
 *
 * Patterns to match:
 *   "\u0570\u0578\u0564\u057e\u0561\u056e 391"
 *   "\u0570\u0578\u0564\u057e\u0561\u056e\u056b 391"  (genitive: \u056b suffix)
 *   "\u0570\u0578\u0564\u057e\u0561\u056e 391-\u056b" (with dash-i)
 *   "391 \u0570\u0578\u0564\u057e\u0561\u056e"        (reversed: number first)
 *   "391-\u0580\u0564 \u0570\u0578\u0564\u057e\u0561\u056e" (ordinal)
 *   "\u0570\u0578\u0564\u057e. 391" (abbreviated)
 */

// \u0570\u0578\u0564\u057e\u0561\u056e / \u0540\u0578\u0564\u057e\u0561\u056e — Article keyword
const ARTICLE_WORD = "[\u0540\u0570]\u0578\u0564\u057e\u0561\u056e";
// Abbreviated form: \u0570\u0578\u0564\u057e. or \u0540\u0578\u0564\u057e.
const ARTICLE_ABBR = "[\u0540\u0570]\u0578\u0564\u057e\\.";

// \u0574\u0561\u057d = part (\u0574\u0561\u057d)
// \u0574\u0561\u057d\u056b / \u0574\u0561\u057d\u0578\u057e = genitive/instrumental forms
const PART_WORD = "\u0574\u0561\u057d";

// \u056f\u0565\u057f = point (\u056f\u0565\u057f)
// \u056f\u0565\u057f\u056b / \u056f\u0565\u057f\u0578\u057e = genitive/instrumental forms
const POINT_WORD = "\u056f\u0565\u057f";

// Act number pattern: Armenian letters-digits-Armenian letter(s)
// e.g. \u0540\u0555-528-\u0546
const ACT_NUMBER_RE = /[\u0531-\u058f]{1,4}-\d{1,6}-[\u0531-\u058f]{1,3}/g;

/**
 * Main extraction regex:
 * Pattern A: "article <number>" — standard form
 *   [\u0540\u0570]\u0578\u0564\u057e\u0561\u056e\u056b?\s*(\d+(?:\.\d+)?)
 *
 * Pattern B: "<number> article" — reversed form
 *   (\d+(?:\.\d+)?)-?\u0580?\u0564?\s*[\u0540\u0570]\u0578\u0564\u057e\u0561\u056e
 *
 * Pattern C: abbreviated "art. <number>"
 *   [\u0540\u0570]\u0578\u0564\u057e\.\s*(\d+(?:\.\d+)?)
 *
 * After article, optionally:
 *   \u0574\u0561\u057d\u056b?\s*(\d+)  — part
 *   \u056f\u0565\u057f\u056b?\s*(\d+)  — point
 */

// Pattern A: "\u0570\u0578\u0564\u057e\u0561\u056e[i]? <number>" with optional part/point
const PATTERN_A = new RegExp(
  ARTICLE_WORD +
    "\u056b?\\s*(\\d+(?:\\.\\d+)?)" +
    "(?:" +
      "(?:[,\\-\\s\u0576]*" + PART_WORD + "\u056b?\\s*(\\d+))" +
    ")?" +
    "(?:" +
      "(?:[,\\-\\s\u0576]*" + POINT_WORD + "\u056b?\\s*(\\d+))" +
    ")?",
  "gi"
);

// Pattern B: "<number>[-rd]? \u0570\u0578\u0564\u057e\u0561\u056e" (reversed)
const PATTERN_B = new RegExp(
  "(\\d+(?:\\.\\d+)?)" +
    "[\\-]?(?:\u0580\u0564)?\\s*" +
    ARTICLE_WORD +
    "\u056b?" +
    "(?:" +
      "(?:[,\\-\\s\u0576]*" + PART_WORD + "\u056b?\\s*(\\d+))" +
    ")?" +
    "(?:" +
      "(?:[,\\-\\s\u0576]*" + POINT_WORD + "\u056b?\\s*(\\d+))" +
    ")?",
  "gi"
);

// Pattern C: "\u0570\u0578\u0564\u057e. <number>" (abbreviated)
const PATTERN_C = new RegExp(
  ARTICLE_ABBR +
    "\\s*(\\d+(?:\\.\\d+)?)" +
    "(?:" +
      "(?:[,\\-\\s\u0576]*" + PART_WORD + "\u056b?\\s*(\\d+))" +
    ")?" +
    "(?:" +
      "(?:[,\\-\\s\u0576]*" + POINT_WORD + "\u056b?\\s*(\\d+))" +
    ")?",
  "gi"
);

// Pattern D: standalone "part X point Y" after article context
// \u0574\u0561\u057d\u056b? <number> \u056f\u0565\u057f\u056b? <number>
const PART_POINT_ONLY = new RegExp(
  PART_WORD + "\u056b?\\s*(\\d+)" +
    "(?:[,\\-\\s\u0576]*" + POINT_WORD + "\u056b?\\s*(\\d+))?",
  "gi"
);

// ─── EXTRACTION LOGIC ───────────────────────────────────────────────

/**
 * Find act number nearest to a given position (within 200 chars before).
 * Returns null if none found.
 */
function findNearestActNumber(text: string, position: number): string | null {
  const lookback = text.slice(Math.max(0, position - 200), position);
  const matches = [...lookback.matchAll(ACT_NUMBER_RE)];
  if (matches.length > 0) {
    return matches[matches.length - 1][0]; // closest before position
  }
  return null;
}

/**
 * Deduplicate norm refs by composite key: act+article+part+point
 */
function deduplicateRefs(refs: NormRef[]): NormRef[] {
  const seen = new Set<string>();
  const result: NormRef[] = [];
  for (const ref of refs) {
    const key = `${ref.act_number || ""}|${ref.article}|${ref.part || ""}|${ref.point || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(ref);
    }
  }
  return result;
}

/**
 * Sort refs by article number (numeric), then part, then point
 */
function sortRefs(refs: NormRef[]): NormRef[] {
  return refs.sort((a, b) => {
    const artA = parseFloat(a.article) || 0;
    const artB = parseFloat(b.article) || 0;
    if (artA !== artB) return artA - artB;
    const partA = parseInt(a.part || "0");
    const partB = parseInt(b.part || "0");
    if (partA !== partB) return partA - partB;
    const ptA = parseInt(a.point || "0");
    const ptB = parseInt(b.point || "0");
    return ptA - ptB;
  });
}

/**
 * Extract norm references from text.
 * Pure function — no side effects, deterministic output.
 */
export function extractNormRefs(text: string): NormRef[] {
  if (!text || text.trim().length === 0) return [];

  const refs: NormRef[] = [];

  // Reset regex lastIndex
  PATTERN_A.lastIndex = 0;
  PATTERN_B.lastIndex = 0;
  PATTERN_C.lastIndex = 0;

  // Pattern A matches
  let match: RegExpExecArray | null;
  while ((match = PATTERN_A.exec(text)) !== null) {
    const actNumber = findNearestActNumber(text, match.index);
    refs.push({
      act_number: actNumber,
      article: match[1],
      part: match[2] || null,
      point: match[3] || null,
    });
  }

  // Pattern B matches
  while ((match = PATTERN_B.exec(text)) !== null) {
    const actNumber = findNearestActNumber(text, match.index);
    refs.push({
      act_number: actNumber,
      article: match[1],
      part: match[2] || null,
      point: match[3] || null,
    });
  }

  // Pattern C matches
  while ((match = PATTERN_C.exec(text)) !== null) {
    const actNumber = findNearestActNumber(text, match.index);
    refs.push({
      act_number: actNumber,
      article: match[1],
      part: match[2] || null,
      point: match[3] || null,
    });
  }

  return sortRefs(deduplicateRefs(refs));
}

// ─── HTTP HANDLER ───────────────────────────────────────────────────

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const authErr = checkInternalAuth(req, corsHeaders);
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const { chunk_text, chunks } = body;

    // Single chunk mode
    if (chunk_text && typeof chunk_text === "string") {
      const norm_refs = extractNormRefs(chunk_text);
      return new Response(
        JSON.stringify({ norm_refs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Batch mode: array of chunks
    if (Array.isArray(chunks)) {
      const results = chunks.map((chunk: { chunk_text: string; [k: string]: unknown }) => ({
        ...chunk,
        norm_refs: extractNormRefs(chunk.chunk_text || ""),
      }));
      return new Response(
        JSON.stringify({ chunks: results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Provide chunk_text (string) or chunks (array)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
