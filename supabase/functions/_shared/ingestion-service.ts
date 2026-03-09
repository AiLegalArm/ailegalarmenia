/**
 * Unified ingestion service — single entry point for all import flows.
 *
 * Consolidates: text-preprocessor, normalizer, chunker, JSONL build/validate.
 * Deterministic output, no new dependencies, no ML.
 *
 * Functions:
 *   parseInput(source)     — detect format, extract raw text
 *   normalizeText(text, opts) — preprocess + normalize to LegalDocument
 *   chunkDoc(doc, mode)    — chunk a normalized document
 *   buildJsonl(chunks, meta) — serialize chunks to JSONL lines
 *   validateJsonl(lines)   — validate JSONL lines against schema
 *   mergeSources(a, b)     — merge TXT+PDF of same document
 *   findMatchingPairs(sources) — batch-find matching documents
 *
 * IMPORTANT: No Armenian glyphs — all Unicode escapes \uXXXX.
 */

import { preprocessText, type PreprocessResult } from "./text-preprocessor.ts";
import {
  normalize as rawNormalize,
  validate as rawValidate,
  sha256Hex,
  type NormalizerInput,
  type LegalDocument,
  type ValidationError,
  type DocType,
} from "./normalizer.ts";
import {
  chunkDocument,
  extractCaseNumber,
  type LegalChunk,
  type LegalDocumentInput,
  type ChunkType,
  type ChunkResult,
} from "./chunker.ts";

// ─── RE-EXPORTS for convenience ─────────────────────────────────────
export type {
  LegalDocument,
  LegalChunk,
  ValidationError,
  PreprocessResult,
  DocType,
  ChunkType,
  ChunkResult,
};
export { sha256Hex, extractCaseNumber };

// ─── TYPES ──────────────────────────────────────────────────────────

export type InputSourceType = "raw_text" | "html" | "json" | "jsonl";

export interface ParsedInput {
  /** Detected source type */
  sourceType: InputSourceType;
  /** Array of raw text items extracted from input */
  items: ParsedItem[];
  /** Parse warnings (non-fatal) */
  warnings: string[];
}

export interface ParsedItem {
  fileName: string;
  mimeType: string;
  rawText: string;
  sourceUrl?: string;
  /** Original metadata from JSON/JSONL if available */
  meta?: Record<string, unknown>;
}

export interface NormalizeOptions {
  /** Override auto-detected doc_type */
  forceDocType?: DocType;
  /** Override source URL */
  sourceUrl?: string;
  /** Override source name */
  sourceName?: string;
  /** Skip preprocessing (text already clean) */
  skipPreprocess?: boolean;
}

export type ChunkMode = "auto" | "legislation" | "court_decision" | "fixed_window";

export interface ChunkOptions {
  mode?: ChunkMode;
}

export type JsonlCollection = "knowledge_base" | "legal_practice_kb";

export interface JsonlMeta {
  doc_id?: string;
  doc_type?: string;
  title?: string;
  source_name?: string;
  source_url?: string;
  source_file_name?: string;
  category?: string;
  language?: string;
  collection?: JsonlCollection;
  chunk_strategy?: string;
  case_number?: string;
}

export interface JsonlLine {
  /** Line number (1-based) */
  line: number;
  /** Serialized JSON string */
  json: string;
  /** Parsed object */
  data: Record<string, unknown>;
}

export interface JsonlValidationResult {
  valid: boolean;
  errors: { line: number; message: string }[];
  records: Record<string, unknown>[];
}

// ─── 1. parseInput ──────────────────────────────────────────────────

/**
 * Detect format and extract raw text items from input.
 * Supports: raw text, HTML, JSON array, JSONL.
 */
export function parseInput(
  input: string,
  opts?: { fileName?: string; mimeType?: string; sourceUrl?: string }
): ParsedInput {
  const warnings: string[] = [];
  const fileName = opts?.fileName || "input.txt";
  const mimeType = opts?.mimeType || "text/plain";
  const sourceUrl = opts?.sourceUrl;

  const trimmed = input.trim();

  // Try JSON array
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        const items: ParsedItem[] = [];
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i];
          if (typeof item === "string") {
            items.push({
              fileName: `${fileName}_${i}`,
              mimeType: "text/plain",
              rawText: item,
              sourceUrl,
            });
          } else if (typeof item === "object" && item !== null) {
            const text = item.content_text || item.content || item.text || item.body || "";
            if (text) {
              items.push({
                fileName: item.fileName || item.title || `${fileName}_${i}`,
                mimeType: item.mimeType || "text/plain",
                rawText: String(text),
                sourceUrl: item.sourceUrl || item.source_url || sourceUrl,
                meta: item,
              });
            } else {
              warnings.push(`Item ${i}: no text field found`);
            }
          }
        }
        return { sourceType: "json", items, warnings };
      }
    } catch {
      // Not valid JSON array, fall through
    }
  }

  // Try JSONL
  if (trimmed.startsWith("{") && trimmed.includes("\n")) {
    const lines = trimmed.split("\n").filter((l) => l.trim());
    let isJsonl = true;
    const items: ParsedItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      try {
        const obj = JSON.parse(lines[i]);
        const text = obj.content_text || obj.content || obj.text || obj.body || "";
        items.push({
          fileName: obj.fileName || obj.title || `${fileName}_${i}`,
          mimeType: obj.mimeType || "text/plain",
          rawText: String(text || JSON.stringify(obj)),
          sourceUrl: obj.sourceUrl || obj.source_url || sourceUrl,
          meta: obj,
        });
      } catch {
        isJsonl = false;
        break;
      }
    }

    if (isJsonl && items.length > 0) {
      return { sourceType: "jsonl", items, warnings };
    }
  }

  // HTML detection
  const isHtml =
    mimeType.includes("html") ||
    /^<!DOCTYPE|^<html/i.test(trimmed.slice(0, 100));

  return {
    sourceType: isHtml ? "html" : "raw_text",
    items: [
      {
        fileName,
        mimeType: isHtml ? "text/html" : mimeType,
        rawText: input,
        sourceUrl,
      },
    ],
    warnings,
  };
}

// ─── 2. normalizeText ───────────────────────────────────────────────

/**
 * Preprocess + normalize raw text to a canonical LegalDocument.
 * Wraps _shared/text-preprocessor and _shared/normalizer.
 */
export async function normalizeText(
  rawText: string,
  opts?: NormalizeOptions & { fileName?: string; mimeType?: string }
): Promise<{
  document: LegalDocument;
  preprocess: PreprocessResult;
  validationErrors: ValidationError[];
}> {
  const fileName = opts?.fileName || "document.txt";
  const mimeType = opts?.mimeType || "text/plain";

  // Step 1: Preprocess (unless skipped)
  let preprocessResult: PreprocessResult;
  let cleanedText: string;

  if (opts?.skipPreprocess) {
    cleanedText = rawText;
    preprocessResult = { cleaned: rawText, rulesApplied: 0, charsRemoved: 0 };
  } else {
    const isHtml = mimeType.includes("html");
    preprocessResult = preprocessText(rawText, { isHtml });
    cleanedText = preprocessResult.cleaned;
  }

  // Step 2: Normalize via shared normalizer
  const normInput: NormalizerInput = {
    fileName,
    mimeType,
    rawText: cleanedText, // Pass cleaned text but normalizer will hash original
    sourceUrl: opts?.sourceUrl,
  };

  // We need to hash the ORIGINAL raw text for dedup (before preprocessing)
  // The normalizer hashes rawText internally, so pass original
  normInput.rawText = rawText;
  const document = await rawNormalize(normInput);

  // Apply overrides
  if (opts?.forceDocType) {
    document.doc_type = opts.forceDocType;
  }
  if (opts?.sourceName) {
    document.source_name = opts.sourceName;
  }
  if (opts?.sourceUrl) {
    document.source_url = opts.sourceUrl;
  }

  // Override content_text with cleaned version
  document.content_text = cleanedText;

  // Validate
  const validationErrors = rawValidate(document);

  return { document, preprocess: preprocessResult, validationErrors };
}

// ─── 3. chunkDoc ────────────────────────────────────────────────────

/**
 * Chunk a normalized document using the shared chunker.
 * Mode 'auto' delegates to chunker's own doc_type detection.
 */
export async function chunkDoc(
  document: { doc_type: string; content_text: string; title?: string },
  opts?: ChunkOptions
): Promise<LegalChunk[]> {
  const mode = opts?.mode || "auto";

  let effectiveDocType = document.doc_type;

  // Override doc_type based on explicit mode
  if (mode === "legislation" && !["law", "code", "regulation"].includes(effectiveDocType)) {
    effectiveDocType = "law";
  } else if (mode === "court_decision" && ![
    "court_decision", "cassation_ruling", "appeal_ruling",
    "first_instance_ruling", "constitutional_court", "echr_judgment",
  ].includes(effectiveDocType)) {
    effectiveDocType = "court_decision";
  }

  const input: LegalDocumentInput = {
    doc_type: effectiveDocType,
    content_text: document.content_text,
    title: document.title,
  };

  const result = await chunkDocument(input);
  return result.chunks;
}

/**
 * Chunk with full metadata (strategy + case_number).
 */
export async function chunkDocFull(
  document: { doc_type: string; content_text: string; title?: string },
  opts?: ChunkOptions
): Promise<ChunkResult> {
  const mode = opts?.mode || "auto";

  let effectiveDocType = document.doc_type;

  if (mode === "legislation" && !["law", "code", "regulation"].includes(effectiveDocType)) {
    effectiveDocType = "law";
  } else if (mode === "court_decision" && ![
    "court_decision", "cassation_ruling", "appeal_ruling",
    "first_instance_ruling", "constitutional_court", "echr_judgment",
  ].includes(effectiveDocType)) {
    effectiveDocType = "court_decision";
  }

  const input: LegalDocumentInput = {
    doc_type: effectiveDocType,
    content_text: document.content_text,
    title: document.title,
  };

  return await chunkDocument(input);
}

// ─── 4. buildJsonl ──────────────────────────────────────────────────

/**
 * Serialize chunks + metadata to JSONL lines for storage/export.
 * Each line is a self-contained JSON object.
 */
export function buildJsonl(
  chunks: LegalChunk[],
  meta: JsonlMeta
): JsonlLine[] {
  const total = chunks.length;
  const strategy = meta.chunk_strategy || "semantic";
  const collection = meta.collection || "knowledge_base";

  return chunks.map((chunk, i) => {
    // Stable deterministic ID: collection + doc hash + chunk index
    const stableIdInput = `${collection}:${meta.doc_id || "unknown"}:${chunk.chunk_index}`;
    const stableId = `${collection.replace("_", "")}-${chunk.chunk_hash || String(chunk.chunk_index)}`;

    const record: Record<string, unknown> = {
      id: stableId,
      jurisdiction: "RA",
      collection,
      doc_type: meta.doc_type || null,
      title: meta.title || null,
      block_type: "text",
      source: {
        type: meta.source_url ? "url" : "file",
        uri: meta.source_url || null,
        file_name: meta.source_file_name || meta.source_name || null,
      },
      language: meta.language || "hy",
      chunk: {
        index: chunk.chunk_index,
        total,
        strategy: chunk.chunk_type === "article" ? "article" : strategy,
        type: chunk.chunk_type,
        text: chunk.chunk_text,
        char_start: chunk.char_start,
        char_end: chunk.char_end,
        label: chunk.label || null,
        locator: chunk.locator || null,
      },
      metadata: {
        doc_id: meta.doc_id || null,
        category: meta.category || null,
        chunk_hash: chunk.chunk_hash || null,
        // Include article_number for article-type chunks
        ...(chunk.chunk_type === "article" && chunk.locator?.article
          ? { article_number: chunk.locator.article }
          : {}),
        // Include case_number for court decision chunks
        ...(meta.case_number ? { case_number: meta.case_number } : {}),
      },
    };

    const json = JSON.stringify(record);
    return { line: i + 1, json, data: record };
  });
}

// ─── 5. validateJsonl ───────────────────────────────────────────────

const MAX_CHUNK_TEXT_LENGTH = 50_000;
const VALID_COLLECTIONS: JsonlCollection[] = ["knowledge_base", "legal_practice_kb"];
const VALID_CHUNK_TYPES = [
  "header", "operative", "resolution", "reasoning", "facts", "dissent",
  "article", "preamble", "reference_list", "full_text", "other",
];

/**
 * Validate JSONL lines against the deterministic schema.
 * Each line must have: jurisdiction, collection, chunk.text.
 * Also accepts legacy flat format (chunk_text field).
 */
export function validateJsonl(lines: string[]): JsonlValidationResult {
  const errors: { line: number; message: string }[] = [];
  const records: Record<string, unknown>[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i].trim();
    if (!lineText) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(lineText);
    } catch {
      errors.push({ line: i + 1, message: "Invalid JSON" });
      continue;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      errors.push({ line: i + 1, message: "Must be a JSON object" });
      continue;
    }

    // Support both new nested schema and legacy flat schema
    const chunk = parsed.chunk as Record<string, unknown> | undefined;
    const chunkText = chunk?.text ?? parsed.chunk_text;

    if (!chunkText || typeof chunkText !== "string") {
      errors.push({ line: i + 1, message: "Missing chunk text (chunk.text or chunk_text)" });
    } else if (chunkText.length > MAX_CHUNK_TEXT_LENGTH) {
      errors.push({
        line: i + 1,
        message: `chunk text exceeds max length (${chunkText.length} > ${MAX_CHUNK_TEXT_LENGTH})`,
      });
    }

    // Validate collection if present
    const collection = parsed.collection as string | undefined;
    if (collection && !VALID_COLLECTIONS.includes(collection as JsonlCollection)) {
      errors.push({ line: i + 1, message: `Invalid collection: ${collection}` });
    }

    // Validate chunk type
    const chunkType = chunk?.type ?? parsed.chunk_type;
    if (chunkType && typeof chunkType === "string" && !VALID_CHUNK_TYPES.includes(chunkType)) {
      errors.push({ line: i + 1, message: `Invalid chunk_type: ${chunkType}` });
    }

    records.push(parsed);
  }

  return {
    valid: errors.length === 0,
    errors,
    records,
  };
}

// ─── CONVENIENCE: Full pipeline ─────────────────────────────────────

/**
 * End-to-end: parse → normalize → chunk → build JSONL.
 * Single function for the simplest use case.
 */
export async function ingestText(
  rawText: string,
  opts?: NormalizeOptions & {
    fileName?: string;
    mimeType?: string;
    chunkMode?: ChunkMode;
    category?: string;
    collection?: JsonlCollection;
    language?: string;
  }
): Promise<{
  document: LegalDocument;
  chunks: LegalChunk[];
  jsonl: JsonlLine[];
  preprocess: PreprocessResult;
  validationErrors: ValidationError[];
}> {
  const { document, preprocess, validationErrors } = await normalizeText(
    rawText,
    opts
  );

  const result = await chunkDocFull(document, { mode: opts?.chunkMode });
  const chunks = result.chunks;

  const jsonl = buildJsonl(chunks, {
    doc_type: document.doc_type,
    title: document.title,
    source_name: document.source_name || undefined,
    source_url: document.source_url || undefined,
    source_file_name: opts?.fileName,
    category: opts?.category,
    collection: opts?.collection || "knowledge_base",
    language: opts?.language || "hy",
    chunk_strategy: result.strategy,
    case_number: result.case_number,
  });

  return { document, chunks, jsonl, preprocess, validationErrors };
}
