import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { log, warn, err } from "../_shared/safe-logger.ts";

import { handleCors } from "../_shared/edge-security.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SearchRequest {
  query: string;
  category?: "criminal" | "civil" | "administrative" | "echr" | "constitutional" | null;
  limitDocs?: number;
  limitChunksPerDoc?: number;
}

interface TopChunk {
  chunkIndex: number;
  text: string;
}

interface SearchResultDocument {
  id: string;
  title: string;
  practice_category: string;
  court_type: string;
  outcome: string;
  applied_articles: unknown[];
  key_violations: string[];
  legal_reasoning_summary: string | null;
  decision_map: unknown | null;
  key_paragraphs: unknown[];
  top_chunks: TopChunk[];
  totalChunks: number;
  max_score?: number;
}

interface ChunksRpcDoc {
  id: string;
  title: string;
  practice_category: string;
  court_type: string;
  outcome: string;
  decision_date: string | null;
  source_url: string | null;
  max_score: number;
}

interface ChunksRpcChunk {
  doc_id: string;
  chunk_index: number;
  excerpt: string;
  score: number;
}

interface ChunksRpcResponse {
  documents: ChunksRpcDoc[];
  chunks: ChunksRpcChunk[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ALLOWED_CATEGORIES = new Set([
  "criminal", "civil", "administrative", "echr", "constitutional",
]);

/** Decode the minimal safe set of HTML entities that may appear in user input */
const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#34;": '"',
  "&#39;": "'",
  "&apos;": "'",
};
const HTML_ENTITY_RE = /&(?:amp|lt|gt|quot|apos|#34|#39);/gi;

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    // === AUTH GUARD (getUser via Authorization header) ===
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: authError } = await sb.auth.getUser();
    if (authError || !userData?.user?.id) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    // === Rate limiting ===
    const supabaseServiceUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseServiceUrl, supabaseServiceRoleKey);
    const { checkRateLimits } = await import("../_shared/rate-limiter.ts");
    const rateCheck = await checkRateLimits(serviceClient, userData.user.id, "kb-search");
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateCheck.reason, message: rateCheck.message }),
        { status: rateCheck.status || 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // === End rate limiting ===

    // === Method check ===
    if (req.method !== "POST") {
      return jsonRes({ error: "Method not allowed" }, 405);
    }

    // === Parse & validate ===
    const body: SearchRequest = await req.json();
    const { category = null, limitDocs = 20, limitChunksPerDoc = 4 } = body;
    const rawQuery = body.query;

    if (!rawQuery || typeof rawQuery !== "string") {
      return jsonRes({ error: "Query is required" }, 400);
    }

    const query = normalizeSearchQuery(rawQuery);
    if (query.length < 2) {
      return jsonRes({ error: "Query too short" }, 400);
    }

    if (category != null && !ALLOWED_CATEGORIES.has(category)) {
      return jsonRes({ error: "Invalid category" }, 400);
    }

    const safeLimitDocs = Math.max(1, Math.min(Number(limitDocs) || 20, 20));
    const safeChunksPerDoc = Math.max(1, Math.min(Number(limitChunksPerDoc) || 4, 6));

    log("kb-search", "Search start", { requestId, qLen: query.length, category });

    // === PRIMARY: search_legal_practice_chunks RPC ===
    let path = "chunks";
    let results: SearchResultDocument[];

    try {
      results = await searchViaChunksRpc(sb, query, category, safeLimitDocs, safeChunksPerDoc);
    } catch (e) {
      warn("kb-search", "Chunks RPC failed, falling back", { requestId });
      results = [];
    }

    // === FALLBACK: search_legal_practice_kb RPC ===
    if (results.length === 0) {
      path = "fallback";
      try {
        results = await searchViaFallbackRpc(sb, query, category, safeLimitDocs);
      } catch (e) {
        err("kb-search", "Fallback RPC also failed", e, { requestId });
        results = [];
      }
    }

    log("kb-search", "Search done", { requestId, path, docs: results.length });

    return new Response(
      JSON.stringify({ documents: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    err("kb-search", "Unhandled error", error, { requestId });
    return jsonRes({ error: "Search failed" }, 500);
  }
});

// ─── PRIMARY: Chunks RPC ─────────────────────────────────────────────────────

async function searchViaChunksRpc(
  sb: ReturnType<typeof createClient>,
  query: string,
  category: string | null,
  limitDocs: number,
  chunksPerDoc: number,
): Promise<SearchResultDocument[]> {
  const { data, error } = await sb.rpc("search_legal_practice_chunks", {
    p_query: query,
    category_filter: category ?? null,
    p_limit_chunks: 120,
    p_limit_docs: limitDocs,
    p_chunks_per_doc: chunksPerDoc,
  });

  if (error) throw new Error(`chunks RPC: ${error.message}`);
  if (!data) return [];

  const parsed: ChunksRpcResponse = typeof data === "string" ? JSON.parse(data) : data;
  const docs = parsed.documents || [];
  const chunks = parsed.chunks || [];

  if (docs.length === 0) return [];

  // Group chunks by doc_id
  const chunksByDoc = new Map<string, ChunksRpcChunk[]>();
  for (const c of chunks) {
    const arr = chunksByDoc.get(c.doc_id) || [];
    arr.push(c);
    chunksByDoc.set(c.doc_id, arr);
  }

  return docs.map((doc) => {
    const docChunks = chunksByDoc.get(doc.id) || [];
    // Use first chunk excerpt as legal_reasoning_summary preview
    const preview = docChunks.length > 0
      ? docChunks[0].excerpt.substring(0, 500)
      : null;

    return {
      id: doc.id,
      title: doc.title,
      practice_category: doc.practice_category,
      court_type: doc.court_type,
      outcome: doc.outcome,
      applied_articles: [],
      key_violations: [],
      legal_reasoning_summary: preview,
      decision_map: null,
      key_paragraphs: [],
      top_chunks: docChunks.map((c) => ({
        chunkIndex: c.chunk_index,
        text: c.excerpt,
      })),
      totalChunks: docChunks.length,
      max_score: Number(doc.max_score) || 0,
    };
  });
}

// ─── FALLBACK: search_legal_practice_kb RPC ──────────────────────────────────

async function searchViaFallbackRpc(
  sb: ReturnType<typeof createClient>,
  query: string,
  category: string | null,
  limitDocs: number,
): Promise<SearchResultDocument[]> {
  const { data, error } = await sb.rpc("search_legal_practice_kb", {
    search_query: query,
    category_filter: category ?? null,
    limit_docs: limitDocs,
  });

  if (error) throw new Error(`fallback RPC: ${error.message}`);
  if (!data || !Array.isArray(data)) return [];

  return data.map((r: Record<string, unknown>, idx: number) => ({
    id: r.id as string,
    title: r.title as string,
    practice_category: (r.practice_category ?? "") as string,
    court_type: (r.court_type ?? "") as string,
    outcome: (r.outcome ?? "") as string,
    applied_articles: (r.applied_articles ?? []) as unknown[],
    key_violations: (r.key_violations ?? []) as string[],
    legal_reasoning_summary: (r.legal_reasoning_summary ?? r.content_snippet ?? null) as string | null,
    decision_map: null,
    key_paragraphs: [],
    top_chunks: [],
    totalChunks: 0,
    max_score: Number(r.relevance_score ?? r.rank ?? 0) || 0,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize search query:
 * - Strip HTML tags
 * - Decode safe HTML entities (&quot; → ", &amp; → &, etc.)
 * - Remove control chars (keep \n \r \t)
 * - Collapse whitespace, cap at 200 chars
 * - Preserves Armenian (U+0531–U+058F), Cyrillic, and quotes for phrase-mode
 */
function normalizeSearchQuery(raw: string): string {
  let q = raw
    .replace(/<[^>]*>/g, "")                     // strip HTML tags
    .replace(HTML_ENTITY_RE, (m) => HTML_ENTITY_MAP[m.toLowerCase()] ?? m) // decode safe entities
    // deno-lint-ignore no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // control chars (keep \n \r \t)
    .replace(/\s+/g, " ")                         // collapse whitespace
    .trim();

  if (q.length > 200) q = q.substring(0, 200);
  return q;
}

function jsonRes(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
