import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { log, warn, err } from "../_shared/safe-logger.ts";
import { handleCors, checkInternalAuth } from "../_shared/edge-security.ts";
import { detectCaseNumberInQuery } from "../_shared/rag-search.ts";

/**
 * Hybrid search: keyword (ILIKE + RPC) → AI reranking via Gemini Flash.
 * Returns { kb, practice, retrieval_mode, rerank_ok, rerank_error }.
 */
serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const authErr = checkInternalAuth(req, corsHeaders);
  if (authErr) return authErr;

  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

  try {
    const { query: rawQuery, tables = "both", category, limit = 10, threshold: _threshold, reference_date } = await req.json();

    if (!rawQuery || typeof rawQuery !== "string") {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // P1 FIX: Cap query length — env-overridable for large legal queries
    const MAX_QUERY_LENGTH = Number(Deno.env.get("MAX_QUERY_LENGTH")) || 2000;
    const MAX_RESULTS = Number(Deno.env.get("MAX_RESULTS")) || 60;
    const query = rawQuery.length > MAX_QUERY_LENGTH ? rawQuery.substring(0, MAX_QUERY_LENGTH) : rawQuery;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: "public" },
      global: { headers: { "x-statement-timeout": "8000" } },
    });

    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), MAX_RESULTS);
    const candidateLimit = Math.min(safeLimit * 3, MAX_RESULTS);

    const results: { kb: unknown[]; practice: unknown[] } = { kb: [], practice: [] };

    // Telemetry tracking
    let rerankOk = true;
    let rerankError: string | undefined;
    let kbCandidateCount = 0;
    let practiceCandidateCount = 0;
    let rerankUsed = false;

    // --- Knowledge Base search ---
    if (tables === "kb" || tables === "both") {
      try {
        const candidates = await keywordSearchKB(supabase, query, candidateLimit, reference_date || null);
        kbCandidateCount = candidates.length;
        if (candidates.length > 0) {
          try {
            results.kb = await rerankWithAI(query, candidates, safeLimit, LOVABLE_API_KEY);
            rerankUsed = true;
          } catch (rerankErr) {
            rerankOk = false;
            rerankError = `KB rerank failed: ${rerankErr instanceof Error ? rerankErr.message : String(rerankErr)}`;
            warn("vector-search", rerankError, { requestId });
            // Fallback: return unranked candidates
            results.kb = candidates.slice(0, safeLimit);
          }
        }
      } catch (kbErr) {
        err("vector-search", "KB search failed", { error: kbErr, requestId });
        rerankOk = false;
        rerankError = `KB search error: ${kbErr instanceof Error ? kbErr.message : String(kbErr)}`;
      }
    }

    // --- Legal Practice search ---
    if (tables === "practice" || tables === "both") {
      // Detect case_number in query for priority filtering
      const detectedCaseNumber = detectCaseNumberInQuery(query);
      try {
        const candidates = await keywordSearchPractice(supabase, query, candidateLimit, category || null, detectedCaseNumber);
        practiceCandidateCount = candidates.length;
        if (candidates.length > 0) {
          try {
            results.practice = await rerankWithAI(query, candidates, safeLimit, LOVABLE_API_KEY);
            rerankUsed = true;
          } catch (rerankErr) {
            rerankOk = false;
            const msg = `Practice rerank failed: ${rerankErr instanceof Error ? rerankErr.message : String(rerankErr)}`;
            rerankError = rerankError ? `${rerankError}; ${msg}` : msg;
            warn("vector-search", msg, { requestId });
            results.practice = candidates.slice(0, safeLimit);
          }
        }
      } catch (practiceErr) {
        err("vector-search", "Practice search failed", { error: practiceErr, requestId });
        rerankOk = false;
        const msg = `Practice search error: ${practiceErr instanceof Error ? practiceErr.message : String(practiceErr)}`;
        rerankError = rerankError ? `${rerankError}; ${msg}` : msg;
      }
    }

    // Determine retrieval mode
    const retrievalMode = rerankUsed
      ? "keyword+rerank" as const
      : (kbCandidateCount > 0 || practiceCandidateCount > 0)
        ? "keyword_only" as const
        : "rpc_fallback" as const;

    log("vector-search", "Search complete", {
      requestId,
      retrieval_mode: retrievalMode,
      rerank_ok: rerankOk,
      kb_results: results.kb.length,
      practice_results: results.practice.length,
      kb_candidates: kbCandidateCount,
      practice_candidates: practiceCandidateCount,
    });

    return new Response(
      JSON.stringify({
        ...results,
        retrieval_mode: retrievalMode,
        rerank_ok: rerankOk,
        rerank_error: rerankError || undefined,
        // Backward compat aliases
        semantic_ok: rerankOk,
        semantic_error: rerankError || undefined,
        request_id: requestId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    err("vector-search", "Search error", { error, requestId });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        kb: [],
        practice: [],
        retrieval_mode: "keyword_only",
        rerank_ok: false,
        rerank_error: error instanceof Error ? error.message : "Unknown error",
        semantic_ok: false,
        semantic_error: error instanceof Error ? error.message : "Unknown error",
        request_id: requestId,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Keyword search helpers ──────────────────────────────────────────────────

interface KBResult {
  id: string;
  doc_id: string;
  title: string;
  content_text: string;
  similarity: number;
  effective_from: string | null;
  effective_to: string | null;
  source_type: "kb";
}

async function keywordSearchKB(
  supabase: ReturnType<typeof createClient>,
  query: string,
  limit: number,
  referenceDate: string | null = null
): Promise<KBResult[]> {
  const results = new Map<string, KBResult>();

  const rpcParams: Record<string, unknown> = { search_query: query, result_limit: limit };
  if (referenceDate) rpcParams.reference_date = referenceDate;

  // 1. Try RPC with full query
  const { data: rpcData, error: rpcError } = await supabase.rpc("search_knowledge_base", rpcParams);
  if (rpcError) {
    warn("vector-search", "KB RPC search_knowledge_base failed", { error: rpcError.message });
  }
  for (const r of rpcData || []) {
    results.set(r.id, {
      id: r.id, doc_id: r.id, title: r.title,
      content_text: (r.content_text || "").substring(0, 2000),
      similarity: r.rank || 0,
      effective_from: r.effective_from || null,
      effective_to: r.effective_to || null,
      source_type: "kb",
    });
  }

  // 2. Individual word search
  const words = query.split(/\s+/).filter(w => w.length >= 2);
  for (const word of words.slice(0, 2)) {
    if (results.size >= limit) break;
    const wordParams: Record<string, unknown> = { search_query: word, result_limit: Math.min(10, limit) };
    if (referenceDate) wordParams.reference_date = referenceDate;
    const { data: wordData } = await supabase.rpc("search_knowledge_base", wordParams);
    for (const r of wordData || []) {
      if (!results.has(r.id)) {
        results.set(r.id, {
          id: r.id, doc_id: r.id, title: r.title,
          content_text: (r.content_text || "").substring(0, 2000),
          similarity: (r.rank || 0) * 0.8,
          effective_from: r.effective_from || null,
          effective_to: r.effective_to || null,
          source_type: "kb",
        });
      }
    }
  }

  // 3. Fallback: ILIKE
  if (results.size === 0) {
    for (const word of words.slice(0, 3)) {
      const searchTerm = sanitize(word);
      if (searchTerm.length < 2) continue;
      const { data } = await supabase
        .from("knowledge_base")
        .select("id, title, content_text, effective_from, effective_to")
        .eq("is_active", true)
        .ilike("title", `%${searchTerm}%`)
        .limit(Math.min(10, limit));

      for (const r of data || []) {
        if (!results.has(r.id)) {
          results.set(r.id, {
            id: r.id, doc_id: r.id, title: r.title,
            content_text: (r.content_text || "").substring(0, 2000),
            similarity: 0.3,
            effective_from: r.effective_from || null,
            effective_to: r.effective_to || null,
            source_type: "kb",
          });
        }
      }
    }
  }

  return Array.from(results.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

interface PracticeCandidate {
  id: string;
  doc_id: string;
  title: string;
  content_text: string;
  similarity: number;
  source_type: "practice";
  practice_category?: string;
  court_type?: string;
  decision_date?: string;
  case_number?: string;
  court_name?: string;
}

async function keywordSearchPractice(
  supabase: ReturnType<typeof createClient>,
  query: string,
  limit: number,
  category: string | null,
  detectedCaseNumber: string | null = null,
): Promise<PracticeCandidate[]> {
  const results = new Map<string, PracticeCandidate>();
  const selectCols = "id, title, content_text, practice_category, court_type, decision_date, case_number_anonymized, court_name, legal_reasoning_summary";

  // Priority: exact case_number match (boosted score)
  if (detectedCaseNumber) {
    const { data } = await supabase
      .from("legal_practice_kb")
      .select(selectCols)
      .eq("is_active", true)
      .eq("case_number_anonymized", detectedCaseNumber)
      .limit(10);
    for (const r of data || []) {
      results.set(r.id, {
        id: r.id,
        doc_id: r.id,
        title: r.title,
        content_text: (r.content_text || "").substring(0, 2000),
        similarity: 1.0, // Highest priority
        source_type: "practice",
        practice_category: r.practice_category || undefined,
        court_type: r.court_type || undefined,
        decision_date: r.decision_date || undefined,
        case_number: r.case_number_anonymized || undefined,
        court_name: r.court_name || undefined,
      });
    }
    if (results.size > 0) {
      log("vector-search", `Case number filter matched ${results.size} docs for ${detectedCaseNumber}`);
    }
  }

  {
    const searchTerm = sanitize(query);
    if (searchTerm.length >= 2) {
      let q = supabase
        .from("legal_practice_kb")
        .select(selectCols)
        .eq("is_active", true)
        .or(`title.ilike.%${searchTerm}%,legal_reasoning_summary.ilike.%${searchTerm}%`)
        .limit(Math.min(limit, 30));
      if (category) q = q.eq("practice_category", category);
      const { data } = await q;
      for (const r of data || []) {
        if (!results.has(r.id)) {
          results.set(r.id, {
            id: r.id,
            doc_id: r.id,
            title: r.title,
            content_text: (r.content_text || "").substring(0, 2000),
            similarity: 0.7,
            source_type: "practice",
            practice_category: r.practice_category || undefined,
            court_type: r.court_type || undefined,
            decision_date: r.decision_date || undefined,
            case_number: r.case_number_anonymized || undefined,
            court_name: r.court_name || undefined,
          });
        }
      }
    }
  }

  const words = query.split(/\s+/).filter(w => w.length >= 2);
  for (const word of words.slice(0, 5)) {
    if (results.size >= limit) break;
    const searchTerm = sanitize(word);
    if (searchTerm.length < 2) continue;
    let q = supabase
      .from("legal_practice_kb")
      .select(selectCols)
      .eq("is_active", true)
      .or(`title.ilike.%${searchTerm}%,legal_reasoning_summary.ilike.%${searchTerm}%`)
      .limit(Math.min(10, limit));
    if (category) q = q.eq("practice_category", category);
    const { data } = await q;
    for (const r of data || []) {
      if (!results.has(r.id)) {
        results.set(r.id, {
          id: r.id,
          doc_id: r.id,
          title: r.title,
          content_text: (r.content_text || "").substring(0, 2000),
          similarity: 0.5,
          source_type: "practice",
          practice_category: r.practice_category || undefined,
          court_type: r.court_type || undefined,
          decision_date: r.decision_date || undefined,
          case_number: r.case_number_anonymized || undefined,
          court_name: r.court_name || undefined,
        });
      }
    }
  }

  return Array.from(results.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// ─── AI Reranking ────────────────────────────────────────────────────────────

async function rerankWithAI(
  query: string,
  candidates: Array<{ id: string; title: string; content_text: string }>,
  topK: number,
  apiKey: string
): Promise<unknown[]> {
  if (candidates.length <= topK) return candidates;

  const items = candidates.map((c, i) => ({
    idx: i,
    title: c.title,
    snippet: c.content_text.substring(0, 500),
  }));

  const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");

  const bypassResult = await callGatewayBypass(
    [
      {
        role: "system",
        content: `You are a legal document relevance ranker. Given a user query and a list of candidate documents, call the rank_results function with the indices of the most relevant documents in order of decreasing relevance. Return at most ${topK} indices. Consider legal terminology, article references, and semantic meaning.`,
      },
      {
        role: "user",
        content: `Query: "${query}"\n\nCandidates:\n${items.map(it => `[${it.idx}] ${it.title}: ${it.snippet}`).join("\n\n")}`,
      },
    ],
    {
      functionName: "vector-search-rerank",
      bypassReason: "tool_calling",
      timeoutMs: 30000,
      extraBody: {
        tools: [
          {
            type: "function",
            function: {
              name: "rank_results",
              description: "Return ranked indices of the most relevant documents",
              parameters: {
                type: "object",
                properties: {
                  ranked_indices: {
                    type: "array",
                    items: { type: "number" },
                    description: `Array of candidate indices (0-based) in order of relevance, max ${topK}`,
                  },
                },
                required: ["ranked_indices"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "rank_results" } },
      },
    }
  );

  const data = bypassResult.data;
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    const args = JSON.parse(toolCall.function.arguments);
    const indices = args.ranked_indices as number[];
    if (Array.isArray(indices)) {
      const valid = indices
        .filter((i) => typeof i === "number" && i >= 0 && i < candidates.length)
        .slice(0, topK);
      if (valid.length > 0) {
        return valid.map((i) => candidates[i]);
      }
    }
  }

  // Rerank returned no usable indices — not an error, just use original order
  warn("vector-search", "Rerank returned no usable indices, using original order");
  return candidates.slice(0, topK);
}

function sanitize(input: string): string {
  return input
    .replace(/[%_]/g, "")
    .replace(/[(),.*\\;:!'"]/g, "")
    .replace(/\b(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|not|or|and|fts|plfts|phfts|wfts)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
}
