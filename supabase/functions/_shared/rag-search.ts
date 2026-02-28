// =============================================================================
// UNIFIED RAG SEARCH — Single module for all KB + Practice hybrid search
// Used by: ai-analyze, legal-chat, multi-agent-analyze, generate-complaint,
//          generate-document, vector-search
// =============================================================================
//
// INDEX SEPARATION RULE (MANDATORY):
// 1. Normative KB (knowledge_base) → laws/legislation ONLY
// 2. Practice KB (legal_practice_kb) → RA court decisions ONLY
// 3. ECHR KB → ECHR decisions ONLY (filtered by practice_category='echr')
// NEVER mix indexes across these boundaries.
// NEVER embed entire documents for generation — use precedent_units only.
// When Practice results contain key_paragraphs (precedent_units), prefer them
// over full content_text for AI prompt injection.
// =============================================================================

import type { KBSearchResult, PracticeSearchResult, VectorSearchResponse } from "./rag-types.ts";
import { callInternalFunction } from "./edge-security.ts";

// ─── Configuration ──────────────────────────────────────────────────────────

export interface RAGSearchOptions {
  /** Supabase client (service_role) */
  supabase: SupabaseClient;
  /** Supabase URL for vector-search edge function calls */
  supabaseUrl: string;
  /** Service role key for auth */
  supabaseKey: string;
  /** The user query to search */
  query: string;
  /** Reference date for temporal legislation filtering (ISO string) */
  referenceDate?: string | null;
  /** Practice category filter */
  category?: string | null;
  /** Incoming x-request-id to propagate through internal calls */
  requestId?: string;
}

export interface RAGKBOptions extends RAGSearchOptions {
  /** Max results to return (default: 8) */
  limit?: number;
  /** Max content chars per result (default: 4000) */
  snippetLength?: number;
}

export interface RAGPracticeOptions extends RAGSearchOptions {
  /** Max results to return (default: 5) */
  limit?: number;
  /** Max content chars per result (default: full text) */
  snippetLength?: number;
}

export interface RAGResult<T> {
  results: T[];
  sources: Array<{ title: string; category?: string; source_name?: string }>;
  /** Telemetry: retrieval mode used */
  retrieval_mode?: "keyword+rerank" | "keyword_only" | "rpc_fallback";
  /** Whether AI reranking succeeded */
  rerank_ok?: boolean;
  /** Error message if AI reranking failed */
  rerank_error?: string;
  /** @deprecated Use rerank_ok */
  semantic_ok?: boolean;
  /** @deprecated Use rerank_error */
  semantic_error?: string;
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// ─── Keyword extraction ─────────────────────────────────────────────────────

/** Extract and sanitize search keywords from query text */
export function extractKeywords(text: string, maxCount = 10): string[] {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^[0-9]+$/.test(w))
    .slice(0, maxCount);
}

/** Sanitize keyword for Postgrest ILIKE (remove special chars) */
export function sanitizeForPostgrest(input: string): string {
  return input
    .replace(/[%_]/g, "")
    .replace(/[(),.*\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
}

// ─── Vector Search Helper ───────────────────────────────────────────────────

/** Result from callVectorSearch including telemetry */
interface VectorSearchCallResult extends VectorSearchResponse {
  _failed: boolean;
  _error?: string;
}

/** Call the vector-search edge function — surfaces errors explicitly */
async function callVectorSearch(
  supabaseUrl: string,
  query: string,
  tables: "kb" | "practice" | "both",
  opts: { limit?: number; category?: string | null; referenceDate?: string | null; requestId?: string } = {}
): Promise<VectorSearchCallResult> {
  try {
    // Internal calls authenticate via x-internal-key only (set by callInternalFunction).
    // Authorization header is intentionally omitted: vector-search creates its
    // own service_role client server-side, so forwarding a service-role key over
    // HTTP would be an unnecessary secret exposure.
    const response = await callInternalFunction(
      `${supabaseUrl}/functions/v1/vector-search`,
      {
        query,
        tables,
        category: opts.category || undefined,
        limit: opts.limit || 10,
        threshold: 0.3,
        reference_date: opts.referenceDate || undefined,
      },
      {
        requestId: opts.requestId,
        timeoutMs: 60_000,
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      const msg = `vector-search returned ${response.status}: ${errorText.substring(0, 200)}`;
      console.warn(`[rag-search] ${msg}`);
      return { kb: [], practice: [], _failed: true, _error: msg };
    }

    const data = await response.json();
    return {
      kb: data.kb || [],
      practice: data.practice || [],
      retrieval_mode: data.retrieval_mode,
      rerank_ok: data.rerank_ok ?? data.semantic_ok,
      rerank_error: data.rerank_error ?? data.semantic_error,
      semantic_ok: data.semantic_ok,
      semantic_error: data.semantic_error,
      request_id: data.request_id,
      _failed: false,
    };
  } catch (fetchErr) {
    const msg = `vector-search fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
    console.error(`[rag-search] ${msg}`);
    return { kb: [], practice: [], _failed: true, _error: msg };
  }
}

// ─── Keyword Relevance Scoring ──────────────────────────────────────────────

interface ScoredItem {
  id: string;
  title: string;
  score: number;
  [key: string]: unknown;
}

/** Score items by keyword overlap: title=3, reasoning/summary=2, content=1 */
function scoreByKeywords<T extends { id: string; title: string; content_text?: string; legal_reasoning_summary?: string }>(
  items: T[],
  keywords: string[]
): (T & { score: number })[] {
  return items.map((r) => {
    let score = 0;
    const titleLower = (r.title || "").toLowerCase();
    const contentLower = (r.content_text || "").toLowerCase();
    const reasoningLower = (r.legal_reasoning_summary || "").toLowerCase();
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      if (titleLower.includes(kwLower)) score += 3;
      if (reasoningLower.includes(kwLower)) score += 2;
      if (contentLower.includes(kwLower)) score += 1;
    }
    return { ...r, score };
  });
}

// ─── Deduplication ──────────────────────────────────────────────────────────

/** Merge arrays of items by id, preserving insertion order (first wins) */
function dedup<T extends { id: string }>(
  ...arrays: T[][]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
  }
  return out;
}

// ─── Knowledge Base Search ──────────────────────────────────────────────────

/**
 * Hybrid KB search: vector + keyword ILIKE + FTS RPC fallback.
 * Returns deduplicated, scored, trimmed results.
 */
export async function searchKB(opts: RAGKBOptions): Promise<RAGResult<KBSearchResult>> {
  const { supabase, supabaseUrl, supabaseKey, query, referenceDate } = opts;
  const limit = opts.limit ?? 8;
  const snippetLen = opts.snippetLength ?? 4000;
  const keywords = extractKeywords(query);
  const safeKeywords = keywords.map(sanitizeForPostgrest).filter((k) => k.length > 0);

  // Phase 1: Parallel vector + keyword search
  const vectorPromise = callVectorSearch(supabaseUrl, query, "kb", {
    limit: 10,
    referenceDate,
    requestId: opts.requestId,
  });

  const keywordPromise = (async (): Promise<KBSearchResult[]> => {
    if (safeKeywords.length === 0) return [];
    const orConditions = safeKeywords
      .map((k) => `title.ilike.%${k}%,content_text.ilike.%${k}%`)
      .join(",");
    const { data, error } = await supabase
      .from("knowledge_base")
      .select("id, title, content_text, category, source_name")
      .eq("is_active", true)
      .or(orConditions)
      .limit(50);
    return !error && data ? data : [];
  })();

  const [vectorResults, keywordResults] = await Promise.all([vectorPromise, keywordPromise]);

  // Vector results get semantic-based rank
  const vectorItems = (vectorResults.kb || []).map((r: KBSearchResult) => ({
    ...r,
    score: (r.similarity || 0) * 10,
  }));

  // Keyword results get keyword-relevance score
  const scoredKeyword = scoreByKeywords(keywordResults, keywords);

  // Merge: vector first (semantic), then keyword
  let merged = dedup(vectorItems, scoredKeyword);

  // Phase 2: FTS RPC fallback if nothing found
  if (merged.length === 0) {
    const rpcParams: Record<string, unknown> = { search_query: query, result_limit: 20 };
    if (referenceDate) rpcParams.reference_date = referenceDate;
    const { data, error } = await supabase.rpc("search_knowledge_base", rpcParams);
    if (!error && data) {
      merged = (data as KBSearchResult[]).filter((r) => (r.rank ?? 0) > 0.001);
    }
  }

  // Sort by score descending, trim
  const sorted = merged
    .sort((a, b) => (b.score ?? b.rank ?? 0) - (a.score ?? a.rank ?? 0))
    .slice(0, limit);

  // Trim content
  const trimmed = sorted.map((r) => ({
    ...r,
    content_text: (r.content_text || "").substring(0, snippetLen),
  }));

  const sources = trimmed.map((r) => ({
    title: r.title,
    category: r.category,
    source_name: r.source_name || "RA Legal Database",
  }));

  // Propagate telemetry from vector-search
  const rerankOk = !vectorResults._failed && vectorResults.rerank_ok !== false;
  const retrievalMode = vectorResults._failed
    ? (merged.length > 0 ? "keyword_only" as const : "rpc_fallback" as const)
    : (vectorResults.retrieval_mode || "keyword_only" as const);

  if (vectorResults._failed) {
    console.warn(`[rag-search/searchKB] Rerank retrieval failed: ${vectorResults._error}`);
  }

  return {
    results: trimmed,
    sources,
    retrieval_mode: retrievalMode,
    rerank_ok: rerankOk,
    rerank_error: vectorResults._error || vectorResults.rerank_error,
    semantic_ok: rerankOk,
    semantic_error: vectorResults._error || vectorResults.rerank_error,
  };
}

// ─── Legal Practice Search ──────────────────────────────────────────────────

/**
 * Hybrid practice search: vector + keyword ILIKE + FTS RPC fallback.
 * Returns deduplicated, scored, trimmed results.
 */
export async function searchPractice(opts: RAGPracticeOptions): Promise<RAGResult<PracticeSearchResult>> {
  const { supabase, supabaseUrl, supabaseKey, query, category } = opts;
  const limit = opts.limit ?? 5;
  const keywords = extractKeywords(query, 8);
  const safeKeywords = keywords.map(sanitizeForPostgrest).filter((k) => k.length > 0);

  // Phase 1: Parallel vector + keyword
  const vectorPromise = callVectorSearch(supabaseUrl, query, "practice", {
    limit: 10,
    category,
    requestId: opts.requestId,
  });

  const keywordPromise = (async (): Promise<PracticeSearchResult[]> => {
    if (safeKeywords.length === 0) return [];
    const orConditions = safeKeywords
      .map((k) => `title.ilike.%${k}%,legal_reasoning_summary.ilike.%${k}%`)
      .join(",");
    let q = supabase
      .from("legal_practice_kb")
      .select("id, title, content_text, practice_category, court_type, outcome, legal_reasoning_summary, applied_articles, key_violations, decision_date, case_number_anonymized, court_name, key_paragraphs")
      .eq("is_active", true)
      .or(orConditions)
      .limit(30);
    if (category) q = q.eq("practice_category", category);
    const { data, error } = await q;
    return !error && data ? data : [];
  })();

  const [vectorResults, keywordResults] = await Promise.all([vectorPromise, keywordPromise]);

  // Normalize vector results (content_snippet → content_text)
  const vectorItems = (vectorResults.practice || []).map((r: PracticeSearchResult) => ({
    ...r,
    content_text: r.content_text || r.content_snippet || "",
    score: (r.similarity || 0) * 10,
  }));

  // Normalize DB field names to PracticeSearchResult shape
  const normalizedKeyword = keywordResults.map((r: Record<string, unknown>) => ({
    ...r,
    case_number: r.case_number_anonymized as string | undefined,
  })) as PracticeSearchResult[];

  const scoredKeyword = scoreByKeywords(
    normalizedKeyword as Array<PracticeSearchResult & { legal_reasoning_summary?: string }>,
    keywords
  );

  let merged = dedup(vectorItems, scoredKeyword);

  // Phase 2: FTS RPC fallback
  if (merged.length === 0) {
    const rpcParams: Record<string, unknown> = {
      search_query: query,
      result_limit: 10,
    };
    if (category) rpcParams.category = category;
    const { data, error } = await supabase.rpc("search_legal_practice", rpcParams);
    if (!error && data) {
      merged = data as PracticeSearchResult[];
    }
  }

  // Sort and trim
  const sorted = merged
    .sort((a, b) => (b.score ?? b.rank ?? b.relevance_rank ?? 0) - (a.score ?? a.rank ?? a.relevance_rank ?? 0))
    .slice(0, limit);

  const sources = sorted.map((r) => ({
    title: r.title,
    category: r.practice_category,
  }));

  const rerankOk = !vectorResults._failed && vectorResults.rerank_ok !== false;
  const retrievalMode = vectorResults._failed
    ? (merged.length > 0 ? "keyword_only" as const : "rpc_fallback" as const)
    : (vectorResults.retrieval_mode || "keyword_only" as const);

  if (vectorResults._failed) {
    console.warn(`[rag-search/searchPractice] Rerank retrieval failed: ${vectorResults._error}`);
  }

  return {
    results: sorted,
    sources,
    retrieval_mode: retrievalMode,
    rerank_ok: rerankOk,
    rerank_error: vectorResults._error || vectorResults.rerank_error,
    semantic_ok: rerankOk,
    semantic_error: vectorResults._error || vectorResults.rerank_error,
  };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

/** Format KB results into context string for AI prompt */
export function formatKBContext(results: KBSearchResult[], snippetLength = 4000): string {
  if (results.length === 0) return "";
  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title} (${r.category}, ${r.source_name || "N/A"}):\n${(r.content_text || "").substring(0, snippetLength)}`
    )
    .join("\n\n---\n\n");
}

/** Format practice results into structured block for AI prompt.
 * Strict format: [PRACTICE]...[/PRACTICE] with consistent field labels.
 * Prefers precedent_units (key_paragraphs) over full text per INDEX SEPARATION RULE.
 */
export function formatPracticeContext(results: PracticeSearchResult[], _fullText = true): string {
  if (results.length === 0) return "";

  return results
    .map((r) => {
      // Determine source: ECHR vs RA
      const isEchr = r.practice_category === "echr" || r.court_type === "echr";
      const source = isEchr ? "ECHR" : r.court_type ? "RA" : "UNKNOWN";

      // Build excerpt: prefer key_paragraphs, then legal_reasoning_summary, then content
      let excerpt = "";
      const keyParas = r.key_paragraphs;
      if (keyParas && Array.isArray(keyParas) && keyParas.length > 0) {
        excerpt = keyParas.slice(0, 6).map((u: Record<string, unknown>, idx: number) => {
          const ruleText = u.rule_text || u.holding || "";
          const quote = u.quote || u.exact_quote || "";
          return `  ${idx + 1}) ${ruleText}${quote ? ` «${quote}»` : ""}`;
        }).join("\n");
      } else {
        excerpt = (r.content_snippet || r.content_text || "").substring(0, 1500);
      }

      // Build lines, omitting empty values (except ID)
      const lines: string[] = ["[PRACTICE]"];
      lines.push(`Source: ${source}`);
      if (r.practice_category) lines.push(`Category: ${r.practice_category}`);
      if (r.court_type) lines.push(`CourtType: ${r.court_type}`);
      if (r.court_name) lines.push(`Court: ${r.court_name}`);
      lines.push(`Case: ${r.title}`);
      if (r.decision_date) lines.push(`Date: ${r.decision_date}`);
      if (r.case_number) lines.push(`CaseNo: ${r.case_number}`);
      lines.push(`ID: ${r.id || "unknown"}`);
      if (excerpt) {
        lines.push("Excerpt:");
        lines.push(excerpt);
      }
      lines.push("[/PRACTICE]");

      return lines.join("\n");
    })
    .join("\n\n");
}

/** Build temporal disclaimer for RAG context */
export function temporalDisclaimer(referenceDate: string | null | undefined, dateAssumed: boolean): string {
  if (dateAssumed) {
    return "\n\n[TEMPORAL NOTE: No case date provided. Legislation shown is the currently effective version. If events occurred on a different date, applicable law may differ. State this assumption explicitly.]";
  }
  if (referenceDate) {
    return `\n\n[TEMPORAL NOTE: Legislation filtered for versions effective as of ${referenceDate}.]`;
  }
  return "";
}

// ─── Convenience: Full dual-bucket search ───────────────────────────────────

export interface DualRAGResult {
  kbContext: string;
  practiceContext: string;
  kbResults: KBSearchResult[];
  practiceResults: PracticeSearchResult[];
  sources: Array<{ title: string; category?: string; source_name?: string }>;
  /** Telemetry: overall retrieval mode */
  retrieval_mode: "keyword+rerank" | "keyword_only" | "rpc_fallback";
  /** Whether all AI reranking succeeded */
  rerank_ok: boolean;
  /** Aggregated rerank errors if any */
  rerank_error?: string;
  /** @deprecated Use rerank_ok */
  semantic_ok: boolean;
  /** @deprecated Use rerank_error */
  semantic_error?: string;
}

/**
 * One-call dual-bucket RAG: searches both KB and Practice in parallel,
 * returns formatted context strings ready for AI prompt injection.
 */
export async function dualSearch(opts: RAGSearchOptions & {
  kbLimit?: number;
  practiceLimit?: number;
  kbSnippetLength?: number;
  fullPracticeText?: boolean;
}): Promise<DualRAGResult> {
  const [kb, practice] = await Promise.all([
    searchKB({
      ...opts,
      limit: opts.kbLimit ?? 8,
      snippetLength: opts.kbSnippetLength ?? 4000,
    }),
    searchPractice({
      ...opts,
      limit: opts.practiceLimit ?? 5,
    }),
  ]);

  // Aggregate telemetry
  const rerankOk = (kb.rerank_ok !== false) && (practice.rerank_ok !== false);
  const errors = [kb.rerank_error, practice.rerank_error].filter(Boolean).join("; ");

  // Pick the "best" retrieval mode (if either used rerank, report it)
  const retrievalMode = (kb.retrieval_mode === "keyword+rerank" || practice.retrieval_mode === "keyword+rerank")
    ? "keyword+rerank" as const
    : (kb.retrieval_mode === "keyword_only" || practice.retrieval_mode === "keyword_only")
      ? "keyword_only" as const
      : "rpc_fallback" as const;

  if (!rerankOk) {
    console.warn(`[rag-search/dualSearch] Rerank degradation: ${errors}`);
  }

  // ── Fire-and-forget retrieval telemetry ──
  // Uses log_api_usage RPC; no PII — only counts and status fields.
  try {
    const sanitizedError = errors
      ? errors.replace(/[\n\r]/g, " ").substring(0, 200)
      : null;
    const telemetryMeta = {
      request_id: opts.requestId || null,
      retrieval_mode: retrievalMode,
      semantic_ok: rerankOk,
      semantic_error: sanitizedError,
      kb_results_count: kb.results.length,
      practice_results_count: practice.results.length,
      kb_retrieval_mode: kb.retrieval_mode || null,
      practice_retrieval_mode: practice.retrieval_mode || null,
      vector_search_failed: !!(kb.rerank_error || practice.rerank_error),
    };
    opts.supabase.rpc("log_api_usage", {
      _service_type: "rag_retrieval",
      _model_name: null,
      _tokens_used: 0,
      _estimated_cost: 0,
      _metadata: telemetryMeta,
    }).then(() => { /* fire-and-forget */ }).catch((e: unknown) => {
      console.warn("[rag-search] telemetry log failed:", e);
    });
  } catch (_) {
    // Never block search results for telemetry failures
  }

  return {
    kbContext: formatKBContext(kb.results, opts.kbSnippetLength ?? 4000),
    practiceContext: formatPracticeContext(practice.results, opts.fullPracticeText ?? true),
    kbResults: kb.results,
    practiceResults: practice.results,
    sources: [...kb.sources, ...practice.sources],
    retrieval_mode: retrievalMode,
    rerank_ok: rerankOk,
    rerank_error: errors || undefined,
    semantic_ok: rerankOk,
    semantic_error: errors || undefined,
  };
}

