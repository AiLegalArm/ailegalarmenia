import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { log, warn, err } from "../_shared/safe-logger.ts";

import { handleCors } from "../_shared/edge-security.ts";

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

    log("kb-unified-search", "Start", { requestId, qLen: query.length });

    // ─── Parallel RPC calls ──────────────────────────────────────────
    const [kbResult, practiceChunksResult] = await Promise.allSettled([
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
    ]);

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

    // ─── Build merged array with normalized scores ───────────────────
    const merged: MergedItem[] = [];

    // KB items
    const kbRawScores = kbItems.map((d) => Number(d.max_score) || 0);
    const kbNorm = normalizeScores(kbRawScores);
    for (let i = 0; i < kbItems.length; i++) {
      const d = kbItems[i];
      const bestChunk = d.chunks[0];
      merged.push({
        source: "kb",
        id: d.id,
        title: d.title,
        normalized_score: kbNorm[i],
        raw_score: kbRawScores[i],
        preview: bestChunk ? bestChunk.excerpt.substring(0, MAX_PREVIEW_CHARS) : "",
        meta: {
          category: d.category,
          ...(d.source_name ? { source_name: d.source_name } : {}),
          ...(d.article_number ? { article_number: d.article_number } : {}),
        },
      });
    }

    // Practice items
    const practiceRawScores = practiceItems.map((d) => d.max_score);
    const practiceNorm = normalizeScores(practiceRawScores);
    for (let i = 0; i < practiceItems.length; i++) {
      const d = practiceItems[i];
      const preview = d.top_chunks.length > 0
        ? d.top_chunks[0].text.substring(0, MAX_PREVIEW_CHARS)
        : "";
      merged.push({
        source: "practice",
        id: d.id,
        title: d.title,
        normalized_score: practiceNorm[i],
        raw_score: practiceRawScores[i],
        preview,
        meta: {
          practice_category: d.practice_category,
          court_type: d.court_type,
          outcome: d.outcome,
        },
      });
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
