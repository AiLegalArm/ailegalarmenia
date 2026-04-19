import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { log, warn, err } from "../_shared/safe-logger.ts";
import { detectCaseNumberInQuery } from "../_shared/rag-search.ts";
import { generateEmbedding } from "../_shared/embeddings.ts";

// ─── CORS headers ─────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Hard caps (env-overridable) ─────────────────────────────────────────────
const MAX_KB_DOCS = 10;
const MAX_KB_CHUNKS = Number(Deno.env.get("MAX_KB_CHUNKS_RETURNED")) || 40;
const MAX_PRACTICE_DOCS = 20;
const MAX_PRACTICE_CHUNKS = Number(Deno.env.get("MAX_PRACTICE_CHUNKS_RETURNED")) || 40;
const MAX_CHUNKS_PER_DOC = 6;
const MAX_PREVIEW_CHARS = 500;
const MAX_QUERY_LENGTH = Number(Deno.env.get("MAX_QUERY_LENGTH")) || 2000;
const MAX_RESULTS = Number(Deno.env.get("MAX_RESULTS")) || 60;

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchRequest {
  query: string;
  category?: string | null;
  kbCategory?: string | null;
}

interface MergedItem {
  source: "kb" | "practice";
  id: string;
  title: string;
  normalized_score: number;
  raw_score: number;
  preview: string;
  meta: Record<string, unknown>;
}

// ─── HTML entity cleanup ─────────────────────────────────────────────────────
const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&#34;": '"', "&#39;": "'", "&apos;": "'",
};
const HTML_ENTITY_RE = /&(?:amp|lt|gt|quot|apos|#34|#39);/gi;

function normalizeQuery(raw: string): string {
  let q = raw
    .replace(/<[^>]*>/g, "")
    .replace(HTML_ENTITY_RE, (m) => HTML_ENTITY_MAP[m.toLowerCase()] ?? m)
    // deno-lint-ignore no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (q.length > MAX_QUERY_LENGTH) q = q.substring(0, MAX_QUERY_LENGTH);
  return q;
}

function jsonRes(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Score normalization ─────────────────────────────────────────────────────
function normalizeScores(scores: number[]): number[] {
  const max = Math.max(...scores, 0);
  if (max === 0) return scores.map(() => 0);
  return scores.map((s) => s / max);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    if (req.method !== "POST") {
      return jsonRes({ error: "Method not allowed" }, 405);
    }

    const body: SearchRequest = await req.json();
    const rawQuery = body.query;
    if (!rawQuery || typeof rawQuery !== "string") {
      return jsonRes({ error: "Query is required" }, 400);
    }

    const normalized = normalizeQuery(rawQuery);
    // Clamp to MAX_QUERY_LENGTH (env-overridable)
    const query = normalized.length > MAX_QUERY_LENGTH ? normalized.substring(0, MAX_QUERY_LENGTH) : normalized;
    if (query.length < 2) {
      return jsonRes({ error: "Query too short" }, 400);
    }

    const practiceCategory = body.category ?? null;
    const kbCategory = body.kbCategory ?? null;

    // ── Case number detection for court_decision priority ──────────
    const detectedCaseNumber = detectCaseNumberInQuery(query);
    if (detectedCaseNumber) {
      log("kb-unified-search", "Detected case_number in query", { requestId, caseNumber: detectedCaseNumber });
    }

    log("kb-unified-search", "Start", { requestId, qLen: query.length });

    // ─── Generate query embedding for semantic search (non-blocking) ─
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (e) {
      warn("kb-unified-search", "Embedding generation failed, falling back to keyword-only", { requestId, error: String(e) });
    }

    // ─── Parallel RPC calls (keyword + semantic) ─────────────────────
    const parallelCalls: Promise<unknown>[] = [
      sb.rpc("search_kb_chunks", {
        p_query: query,
        p_category: kbCategory,
        p_limit_chunks: MAX_KB_CHUNKS,
        p_limit_docs: MAX_KB_DOCS,
        p_chunks_per_doc: 3,
      }),
      sb.rpc("search_legal_practice_chunks", {
        p_query: query,
        category_filter: practiceCategory,
        p_limit_chunks: MAX_PRACTICE_CHUNKS,
        p_limit_docs: MAX_PRACTICE_DOCS,
        p_chunks_per_doc: MAX_CHUNKS_PER_DOC,
      }),
    ];

    // Add semantic calls if embedding succeeded
    if (queryEmbedding) {
      parallelCalls.push(
        sb.rpc("search_kb_semantic", {
          p_embedding: JSON.stringify(queryEmbedding),
          p_category: kbCategory,
          p_limit: MAX_KB_DOCS,
          p_threshold: 0.3,
        }),
        sb.rpc("search_practice_semantic", {
          p_embedding: JSON.stringify(queryEmbedding),
          category_filter: practiceCategory,
          p_limit: MAX_PRACTICE_DOCS,
          p_threshold: 0.3,
        }),
      );
    }

    // If case_number detected, also do a direct lookup in parallel
    if (detectedCaseNumber) {
      parallelCalls.push(
        sb.from("legal_practice_kb")
          .select("id, title, practice_category, court_type, outcome, decision_date, source_url, case_number_anonymized")
          .eq("is_active", true)
          .eq("case_number_anonymized", detectedCaseNumber)
          .limit(10)
      );
    }

    const settled = await Promise.allSettled(parallelCalls);
    const kbResult = settled[0] as PromiseSettledResult<{ data: unknown; error: unknown }>;
    const practiceChunksResult = settled[1] as PromiseSettledResult<{ data: unknown; error: unknown }>;

    // Semantic results are at index 2 and 3 (when embedding succeeded)
    // Case number result may be at index 2 or 4 depending on whether embedding was generated
    let kbSemanticResult: PromiseSettledResult<{ data: unknown; error: unknown }> | undefined;
    let practiceSemanticResult: PromiseSettledResult<{ data: unknown; error: unknown }> | undefined;
    let caseNumberResult: PromiseSettledResult<{ data: Array<Record<string, unknown>>; error: unknown }> | undefined;

    if (queryEmbedding) {
      kbSemanticResult = settled[2] as PromiseSettledResult<{ data: unknown; error: unknown }>;
      practiceSemanticResult = settled[3] as PromiseSettledResult<{ data: unknown; error: unknown }>;
      caseNumberResult = settled[4] as PromiseSettledResult<{ data: Array<Record<string, unknown>>; error: unknown }> | undefined;
    } else {
      caseNumberResult = settled[2] as PromiseSettledResult<{ data: Array<Record<string, unknown>>; error: unknown }> | undefined;
    }

    // ─── Parse semantic results into lookup maps ──────────────────────
    interface KBSemanticRow {
      id: string; title: string; category: string;
      source_name: string | null; article_number: string | null;
      source_url: string | null; similarity: number;
    }
    interface PracticeSemanticRow {
      id: string; title: string; practice_category: string;
      court_type: string; outcome: string; decision_date: string | null;
      source_url: string | null; similarity: number;
    }

    const kbSemanticMap = new Map<string, number>();
    const kbSemanticDocs = new Map<string, KBSemanticRow>();
    const practiceSemanticMap = new Map<string, number>();
    const practiceSemanticDocs = new Map<string, PracticeSemanticRow>();

    if (kbSemanticResult?.status === "fulfilled" && kbSemanticResult.value.data) {
      for (const row of (kbSemanticResult.value.data as KBSemanticRow[])) {
        kbSemanticMap.set(row.id, row.similarity);
        kbSemanticDocs.set(row.id, row);
      }
    } else if (kbSemanticResult?.status === "rejected") {
      warn("kb-unified-search", "KB semantic RPC failed", { requestId, err: String((kbSemanticResult as PromiseRejectedResult).reason) });
    }

    if (practiceSemanticResult?.status === "fulfilled" && practiceSemanticResult.value.data) {
      for (const row of (practiceSemanticResult.value.data as PracticeSemanticRow[])) {
        practiceSemanticMap.set(row.id, row.similarity);
        practiceSemanticDocs.set(row.id, row);
      }
    } else if (practiceSemanticResult?.status === "rejected") {
      warn("kb-unified-search", "Practice semantic RPC failed", { requestId, err: String((practiceSemanticResult as PromiseRejectedResult).reason) });
    }

    // ─── Parse KB results ────────────────────────────────────────────
    interface KBDoc {
      id: string; title: string; category: string;
      source_name: string | null; article_number: string | null;
      source_url: string | null; max_score: number;
    }
    interface KBChunk {
      doc_id: string; chunk_index: number; chunk_type: string;
      label: string | null; char_start: number; excerpt: string;
      full_text: string | null; score: number;
    }

    let kbDocs: KBDoc[] = [];
    let kbChunks: KBChunk[] = [];

    if (kbResult.status === "fulfilled" && kbResult.value.data) {
      const parsed = kbResult.value.data as unknown as { documents: KBDoc[]; chunks: KBChunk[] };
      kbDocs = (parsed.documents || []).slice(0, MAX_KB_DOCS);
      kbChunks = (parsed.chunks || []).slice(0, MAX_KB_CHUNKS);
    } else if (kbResult.status === "rejected") {
      warn("kb-unified-search", "KB RPC failed", { requestId, err: String(kbResult.reason) });
    }

    // ─── Parse Practice results (chunks-first + fallback) ────────────
    interface PracticeDoc {
      id: string; title: string; practice_category: string;
      court_type: string; outcome: string; decision_date: string | null;
      source_url: string | null; max_score: number;
    }
    interface PracticeChunk {
      doc_id: string; chunk_index: number; excerpt: string; score: number;
    }

    let practiceDocs: PracticeDoc[] = [];
    let practiceChunks: PracticeChunk[] = [];
    let practicePath = "chunks";

    if (practiceChunksResult.status === "fulfilled" && practiceChunksResult.value.data) {
      const parsed = practiceChunksResult.value.data as unknown as { documents: PracticeDoc[]; chunks: PracticeChunk[] };
      practiceDocs = (parsed.documents || []).slice(0, MAX_PRACTICE_DOCS);
      practiceChunks = parsed.chunks || [];
    }

    // Inject case_number exact matches at the top of practiceDocs (highest priority)
    if (caseNumberResult?.status === "fulfilled" && caseNumberResult.value.data) {
      const caseMatches = caseNumberResult.value.data;
      const existingIds = new Set(practiceDocs.map(d => d.id));
      for (const r of caseMatches) {
        if (!existingIds.has(r.id as string)) {
          practiceDocs.unshift({
            id: r.id as string,
            title: r.title as string,
            practice_category: (r.practice_category ?? "") as string,
            court_type: (r.court_type ?? "") as string,
            outcome: (r.outcome ?? "") as string,
            decision_date: (r.decision_date as string) || null,
            source_url: (r.source_url as string) || null,
            max_score: 100, // Boosted score for exact case_number match
          });
          existingIds.add(r.id as string);
        } else {
          // Boost existing match score
          const existing = practiceDocs.find(d => d.id === r.id);
          if (existing) existing.max_score = Math.max(existing.max_score, 100);
        }
      }
      if (caseMatches.length > 0) {
        log("kb-unified-search", `Case number matched ${caseMatches.length} practice docs`, { requestId });
      }
    }

    // Fallback to search_legal_practice_kb if chunks empty
    if (practiceDocs.length === 0) {
      practicePath = "fallback";
      try {
        const { data, error } = await sb.rpc("search_legal_practice_kb", {
          search_query: query,
          category_filter: practiceCategory,
          limit_docs: MAX_PRACTICE_DOCS,
        });
        if (!error && data && Array.isArray(data)) {
          practiceDocs = data.map((r: Record<string, unknown>) => ({
            id: r.id as string,
            title: r.title as string,
            practice_category: (r.practice_category ?? "") as string,
            court_type: (r.court_type ?? "") as string,
            outcome: (r.outcome ?? "") as string,
            decision_date: null,
            source_url: null,
            max_score: Number(r.relevance_score ?? 0),
          }));
        }
      } catch (e) {
        warn("kb-unified-search", "Practice fallback failed", { requestId });
      }
    }

    // ─── Fetch true total chunk counts via RPC (from chunks table) ───
    const practiceDocIds = practiceDocs.map((d) => d.id);
    const trueTotalChunks = new Map<string, number>();
    if (practiceDocIds.length > 0) {
      try {
        const { data: countData, error: countErr } = await sb.rpc(
          "get_practice_total_chunks",
          { p_ids: practiceDocIds },
        );
        if (countErr) {
          warn("kb-unified-search", "Chunk count RPC failed", {
            requestId,
            error: countErr.message,
          });
        } else if (countData && Array.isArray(countData)) {
          for (const row of countData) {
            trueTotalChunks.set(row.id, row.total_chunks ?? 0);
          }
        }
      } catch (e) {
        warn("kb-unified-search", "Chunk count RPC exception", {
          requestId,
          error: String(e),
        });
      }
    }

    // ─── Group practice chunks by doc ────────────────────────────────
    const practiceChunksByDoc = new Map<string, PracticeChunk[]>();
    for (const c of practiceChunks) {
      const arr = practiceChunksByDoc.get(c.doc_id) || [];
      arr.push(c);
      practiceChunksByDoc.set(c.doc_id, arr);
    }

    // Group KB chunks by doc
    const kbChunksByDoc = new Map<string, KBChunk[]>();
    for (const c of kbChunks) {
      const arr = kbChunksByDoc.get(c.doc_id) || [];
      arr.push(c);
      kbChunksByDoc.set(c.doc_id, arr);
    }

    // ─── Build practice response items ───────────────────────────────
    const practiceItems = practiceDocs.map((doc) => {
      const docChunks = practiceChunksByDoc.get(doc.id) || [];
      const topChunks = docChunks.slice(0, MAX_CHUNKS_PER_DOC).map((c) => ({
        chunkIndex: c.chunk_index,
        text: c.excerpt.substring(0, MAX_PREVIEW_CHARS),
      }));
      const preview = topChunks.length > 0
        ? topChunks[0].text
        : "";
      return {
        id: doc.id,
        title: doc.title,
        practice_category: doc.practice_category,
        court_type: doc.court_type,
        outcome: doc.outcome,
        decision_date: doc.decision_date,
        source_url: doc.source_url,
        max_score: Number(doc.max_score) || 0,
        top_chunks: topChunks,
        returnedChunks: topChunks.length,
        totalChunks: Math.max(trueTotalChunks.get(doc.id) ?? 0, docChunks.length),
        preview,
      };
    });

    // ─── Build KB response items ─────────────────────────────────────
    const kbItems = kbDocs.map((doc) => ({
      ...doc,
      chunks: (kbChunksByDoc.get(doc.id) || []).map((c) => ({
        doc_id: c.doc_id,
        chunk_index: c.chunk_index,
        chunk_type: c.chunk_type,
        label: c.label,
        char_start: c.char_start,
        excerpt: c.excerpt.substring(0, MAX_PREVIEW_CHARS),
        score: c.score,
      })),
    }));

    // ─── Build merged array with hybrid scores (FTS 60% + semantic 40%) ─
    const merged: MergedItem[] = [];

    // KB items
    const kbRawScores = kbItems.map((d) => Number(d.max_score) || 0);
    const kbNorm = normalizeScores(kbRawScores);
    const kbAddedIds = new Set<string>();

    for (let i = 0; i < kbItems.length; i++) {
      const d = kbItems[i];
      kbAddedIds.add(d.id);
      const ftsNorm = kbNorm[i];
      const semSim = kbSemanticMap.get(d.id) ?? 0;
      const hybridScore = queryEmbedding
        ? 0.6 * ftsNorm + 0.4 * semSim
        : ftsNorm;
      const bestChunk = d.chunks[0];
      merged.push({
        source: "kb",
        id: d.id,
        title: d.title,
        normalized_score: hybridScore,
        raw_score: kbRawScores[i],
        preview: bestChunk ? bestChunk.excerpt.substring(0, MAX_PREVIEW_CHARS) : "",
        meta: {
          category: d.category,
          ...(d.source_name ? { source_name: d.source_name } : {}),
          ...(d.article_number ? { article_number: d.article_number } : {}),
        },
      });
    }

    // KB semantic-only hits (not found by FTS but found semantically)
    if (queryEmbedding) {
      for (const [docId, row] of kbSemanticDocs) {
        if (kbAddedIds.has(docId)) continue;
        merged.push({
          source: "kb",
          id: docId,
          title: row.title,
          normalized_score: 0.4 * (kbSemanticMap.get(docId) ?? 0),
          raw_score: 0,
          preview: "",
          meta: {
            category: row.category,
            ...(row.source_name ? { source_name: row.source_name } : {}),
            ...(row.article_number ? { article_number: row.article_number } : {}),
          },
        });
      }
    }

    // Practice items
    const practiceRawScores = practiceItems.map((d) => d.max_score);
    const practiceNorm = normalizeScores(practiceRawScores);
    const practiceAddedIds = new Set<string>();

    for (let i = 0; i < practiceItems.length; i++) {
      const d = practiceItems[i];
      practiceAddedIds.add(d.id);
      const ftsNorm = practiceNorm[i];
      const semSim = practiceSemanticMap.get(d.id) ?? 0;
      const hybridScore = queryEmbedding
        ? 0.6 * ftsNorm + 0.4 * semSim
        : ftsNorm;
      const preview = d.top_chunks.length > 0
        ? d.top_chunks[0].text.substring(0, MAX_PREVIEW_CHARS)
        : "";
      merged.push({
        source: "practice",
        id: d.id,
        title: d.title,
        normalized_score: hybridScore,
        raw_score: practiceRawScores[i],
        preview,
        meta: {
          practice_category: d.practice_category,
          court_type: d.court_type,
          outcome: d.outcome,
        },
      });
    }

    // Practice semantic-only hits
    if (queryEmbedding) {
      for (const [docId, row] of practiceSemanticDocs) {
        if (practiceAddedIds.has(docId)) continue;
        merged.push({
          source: "practice",
          id: docId,
          title: row.title,
          normalized_score: 0.4 * (practiceSemanticMap.get(docId) ?? 0),
          raw_score: 0,
          preview: "",
          meta: {
            practice_category: row.practice_category,
            court_type: row.court_type,
            outcome: row.outcome,
          },
        });
      }
    }

    // Stable sort: normalized desc, raw desc, practice before kb, title asc
    merged.sort((a, b) => {
      if (b.normalized_score !== a.normalized_score) return b.normalized_score - a.normalized_score;
      if (b.raw_score !== a.raw_score) return b.raw_score - a.raw_score;
      const srcPriority = (s: string) => s === "practice" ? 0 : 1;
      if (srcPriority(a.source) !== srcPriority(b.source)) return srcPriority(a.source) - srcPriority(b.source);
      return a.title.localeCompare(b.title);
    });

    log("kb-unified-search", "Done", {
      requestId, practicePath,
      kbDocs: kbItems.length, practiceDocs: practiceItems.length,
      merged: merged.length,
    });

    return new Response(
      JSON.stringify({
        requestId,
        query,
        semantic_ok: queryEmbedding !== null,
        kb: { documents: kbItems, chunks: kbChunks.slice(0, MAX_KB_CHUNKS) },
        practice: practiceItems,
        merged,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    err("kb-unified-search", "Unhandled error", error, { requestId });
    return jsonRes({ error: "Search failed" }, 500);
  }
});
