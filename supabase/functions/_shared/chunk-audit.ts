/**
 * chunk-audit.ts — Deterministic chunk quality auditor
 *
 * auditChunks(documentId, supabase) loads a document and its chunks,
 * then runs pure deterministic coverage & boundary checks.
 *
 * No LLM usage. No side-effects. Read-only.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

// ─── Types ─────────────────────────────────────────────────────────

export interface ChunkAuditMetrics {
  document_id: string;
  source_table: string;
  chunk_count: number;
  avg_size: number;
  max_size: number;
  min_size: number;
  total_chunk_chars: number;
  document_chars: number;
  coverage_ratio: number;
  coverage_ok: boolean;
  boundary_violations: BoundaryViolation[];
  gap_violations: GapViolation[];
  overlap_violations: OverlapViolation[];
  duplicate_hashes: string[];
  empty_chunks: number[];
  index_continuity_ok: boolean;
  missing_indices: number[];
}

export interface BoundaryViolation {
  chunk_index: number;
  issue: string;
}

export interface GapViolation {
  between: [number, number];
  gap_start: number;
  gap_end: number;
  gap_size: number;
}

export interface OverlapViolation {
  between: [number, number];
  overlap_start: number;
  overlap_end: number;
  overlap_size: number;
  overlap_ratio: number;
}

// ─── Core audit function ───────────────────────────────────────────

export async function auditChunks(
  documentId: string,
  supabase: ReturnType<typeof createClient>,
  sourceTable: "knowledge_base" | "legal_practice_kb" | "legal_documents" = "knowledge_base",
): Promise<ChunkAuditMetrics> {
  // 1. Load document text
  const { data: doc, error: docErr } = await supabase
    .from(sourceTable)
    .select("id, content_text")
    .eq("id", documentId)
    .single();

  if (docErr || !doc) {
    throw new Error(`Document not found in ${sourceTable}: ${docErr?.message || "no data"}`);
  }

  const contentText: string = (doc as Record<string, unknown>).content_text as string || "";

  // 2. Load chunks
  const chunksTable = sourceTable === "knowledge_base"
    ? "knowledge_base_chunks"
    : sourceTable === "legal_practice_kb"
      ? "legal_practice_kb_chunks"
      : "legal_chunks";

  const fkColumn = sourceTable === "knowledge_base"
    ? "kb_id"
    : "doc_id";

  const { data: chunks, error: chunkErr } = await supabase
    .from(chunksTable)
    .select("*")
    .eq(fkColumn, documentId)
    .order("chunk_index", { ascending: true });

  if (chunkErr) {
    throw new Error(`Failed to load chunks: ${chunkErr.message}`);
  }

  const chunkRows = (chunks || []) as Record<string, unknown>[];

  // 3. Run deterministic checks
  return computeMetrics(documentId, sourceTable, contentText, chunkRows);
}

// ─── Pure metrics computation ──────────────────────────────────────

export function computeMetrics(
  documentId: string,
  sourceTable: string,
  contentText: string,
  chunkRows: Record<string, unknown>[],
): ChunkAuditMetrics {
  const docChars = contentText.length;
  const chunkCount = chunkRows.length;

  if (chunkCount === 0) {
    return {
      document_id: documentId,
      source_table: sourceTable,
      chunk_count: 0,
      avg_size: 0,
      max_size: 0,
      min_size: 0,
      total_chunk_chars: 0,
      document_chars: docChars,
      coverage_ratio: 0,
      coverage_ok: false,
      boundary_violations: [],
      gap_violations: [],
      overlap_violations: [],
      duplicate_hashes: [],
      empty_chunks: [],
      index_continuity_ok: true,
      missing_indices: [],
    };
  }

  // Extract sizes
  const sizes = chunkRows.map((c) => {
    const text = (c.chunk_text as string) || "";
    return text.length;
  });

  const totalChunkChars = sizes.reduce((a, b) => a + b, 0);
  const avgSize = Math.round(totalChunkChars / chunkCount);
  const maxSize = Math.max(...sizes);
  const minSize = Math.min(...sizes);

  // ── Index continuity ────────────────────────────────────────────
  const indices = chunkRows.map((c) => (c.chunk_index as number) ?? 0);
  const sortedIndices = [...indices].sort((a, b) => a - b);
  const missingIndices: number[] = [];
  if (sortedIndices.length > 0) {
    for (let i = sortedIndices[0]; i <= sortedIndices[sortedIndices.length - 1]; i++) {
      if (!sortedIndices.includes(i)) {
        missingIndices.push(i);
      }
    }
  }

  // ── Empty chunks ────────────────────────────────────────────────
  const emptyChunks: number[] = [];
  for (const c of chunkRows) {
    const text = ((c.chunk_text as string) || "").trim();
    if (text.length === 0) {
      emptyChunks.push((c.chunk_index as number) ?? 0);
    }
  }

  // ── Boundary violations (char_start / char_end) ─────────────────
  const boundaryViolations: BoundaryViolation[] = [];
  const hasCharBounds = chunkRows.some((c) => c.char_start !== undefined && c.char_start !== null);

  if (hasCharBounds) {
    for (const c of chunkRows) {
      const idx = (c.chunk_index as number) ?? 0;
      const start = (c.char_start as number) ?? 0;
      const end = (c.char_end as number) ?? 0;

      if (start < 0) {
        boundaryViolations.push({ chunk_index: idx, issue: `char_start < 0 (${start})` });
      }
      if (end > docChars) {
        boundaryViolations.push({ chunk_index: idx, issue: `char_end (${end}) > doc length (${docChars})` });
      }
      if (end <= start) {
        boundaryViolations.push({ chunk_index: idx, issue: `char_end (${end}) <= char_start (${start})` });
      }
    }
  }

  // ── Gap & overlap analysis (only if char bounds exist) ──────────
  const gapViolations: GapViolation[] = [];
  const overlapViolations: OverlapViolation[] = [];

  if (hasCharBounds) {
    const sorted = [...chunkRows].sort(
      (a, b) => ((a.char_start as number) ?? 0) - ((b.char_start as number) ?? 0),
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i + 1];
      const currEnd = (curr.char_end as number) ?? 0;
      const nextStart = (next.char_start as number) ?? 0;
      const currIdx = (curr.chunk_index as number) ?? i;
      const nextIdx = (next.chunk_index as number) ?? i + 1;

      if (currEnd < nextStart) {
        const gapSize = nextStart - currEnd;
        // Allow small gaps (whitespace, newlines) up to 20 chars
        if (gapSize > 20) {
          gapViolations.push({
            between: [currIdx, nextIdx],
            gap_start: currEnd,
            gap_end: nextStart,
            gap_size: gapSize,
          });
        }
      } else if (currEnd > nextStart) {
        const overlapSize = currEnd - nextStart;
        const currLen = currEnd - ((curr.char_start as number) ?? 0);
        const overlapRatio = currLen > 0 ? overlapSize / currLen : 0;
        // Overlap > 15% is suspicious (reasoning overlap is max 10-12%)
        if (overlapRatio > 0.15) {
          overlapViolations.push({
            between: [currIdx, nextIdx],
            overlap_start: nextStart,
            overlap_end: currEnd,
            overlap_size: overlapSize,
            overlap_ratio: Math.round(overlapRatio * 100) / 100,
          });
        }
      }
    }
  }

  // ── Coverage ratio ──────────────────────────────────────────────
  let coverageRatio: number;
  if (hasCharBounds) {
    // Use char bounds for accurate coverage
    const covered = new Set<number>();
    for (const c of chunkRows) {
      const start = (c.char_start as number) ?? 0;
      const end = Math.min((c.char_end as number) ?? 0, docChars);
      for (let i = start; i < end && i < docChars; i++) {
        covered.add(i);
      }
    }
    coverageRatio = docChars > 0 ? covered.size / docChars : 0;
  } else {
    // Fallback: ratio of total chunk text to document
    coverageRatio = docChars > 0 ? Math.min(totalChunkChars / docChars, 1.5) : 0;
  }

  // Coverage is OK if >= 95% of document is covered
  const coverageOk = coverageRatio >= 0.95;

  // ── Duplicate chunk hashes ──────────────────────────────────────
  const hashes = chunkRows
    .map((c) => c.chunk_hash as string)
    .filter(Boolean);
  const hashCounts = new Map<string, number>();
  for (const h of hashes) {
    hashCounts.set(h, (hashCounts.get(h) || 0) + 1);
  }
  const duplicateHashes = [...hashCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([hash]) => hash);

  return {
    document_id: documentId,
    source_table: sourceTable,
    chunk_count: chunkCount,
    avg_size: avgSize,
    max_size: maxSize,
    min_size: minSize,
    total_chunk_chars: totalChunkChars,
    document_chars: docChars,
    coverage_ratio: Math.round(coverageRatio * 1000) / 1000,
    coverage_ok: coverageOk,
    boundary_violations: boundaryViolations,
    gap_violations: gapViolations,
    overlap_violations: overlapViolations,
    duplicate_hashes: duplicateHashes,
    empty_chunks: emptyChunks,
    index_continuity_ok: missingIndices.length === 0,
    missing_indices: missingIndices,
  };
}
