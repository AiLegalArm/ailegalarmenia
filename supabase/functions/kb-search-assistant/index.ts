import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
// model-config import removed — all AI calls routed via openai-router.ts (callText)
import { handleCors } from "../_shared/edge-security.ts";

// ... keep existing code (interfaces KBSearchResult, SearchOutput)

// ... keep existing code (SEARCH_ASSISTANT_SYSTEM_PROMPT)

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    // === AUTH GUARD ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END AUTH GUARD ===

    const { query, limit = 20 } = await req.json();

    if (!query || typeof query !== "string") {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`KB Search Assistant: query="${query.substring(0, 100)}..."`);

    // Step 1: Use AI to extract keywords from the query
    let keywords: string[] = [];
    
    try {
      // Route via centralized OpenAI router
      const { callText } = await import("../_shared/openai-router.ts");
      const kbResult = await callText("kb-search-assistant", [
        { role: "system", content: SEARCH_ASSISTANT_SYSTEM_PROMPT },
        { role: "user", content: query },
      ]);
      const aiResponse = { ok: true, json: async () => ({ choices: [{ message: { content: kbResult.text } }] }) };

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || "";
        
        // Parse the JSON array from the response
        const jsonMatch = content.match(/\[.*\]/s);
        if (jsonMatch) {
          try {
            keywords = JSON.parse(jsonMatch[0]);
            console.log(`AI extracted keywords: ${keywords.join(", ")}`);
          } catch {
            console.log("Failed to parse AI keywords, using fallback");
          }
        }
      }
    } catch (aiErr) {
      console.error("AI keyword extraction error:", aiErr);
    }

    // Fallback: extract keywords manually if AI failed
    if (keywords.length === 0) {
      keywords = query
        .split(/[\s,.\u054D\u057F]+/)
        .filter((w: string) => w.length > 2 && !/^[0-9]+$/.test(w))
        .slice(0, 10);
      console.log(`Fallback keywords: ${keywords.join(", ")}`);
    }

    // Step 2: Search the knowledge base with extracted keywords
    let searchResults: KBSearchResult[] = [];
    
    if (keywords.length > 0) {
      // Build OR conditions for each keyword
      const orConditions = keywords
        .map((k: string) => `title.ilike.%${k}%,content_text.ilike.%${k}%`)
        .join(",");

      const { data, error } = await supabase
        .from("knowledge_base")
        .select("id, title, content_text, category, source_name, source_url, article_number")
        .eq("is_active", true)
        .or(orConditions)
        .limit(Math.min(limit, 50));

      if (!error && data) {
        // Score and rank results
        searchResults = data.map((r: { id: string; title: string; content_text: string; category: string; source_name: string; source_url: string; article_number: string }) => {
          let score = 0;
          const titleLower = (r.title || "").toLowerCase();
          const contentLower = (r.content_text || "").toLowerCase();

          for (const kw of keywords) {
            const kwLower = kw.toLowerCase();
            if (titleLower.includes(kwLower)) score += 3;
            if (contentLower.includes(kwLower)) score += 1;
          }
          return { ...r, rank: score / (keywords.length * 4) };
        }).sort((a, b) => b.rank - a.rank);
      }
    }

    // Fallback: use full-text search if keyword search failed
    if (searchResults.length === 0) {
      const { data: ftsData, error: ftsError } = await supabase.rpc(
        "search_knowledge_base",
        { search_query: query, result_limit: limit }
      );

      if (!ftsError && ftsData) {
        searchResults = ftsData.filter((r: KBSearchResult) => r.rank > 0.001);
      }
    }

    // Step 3: Format output according to requirements
    const output: SearchOutput = {
      results: searchResults.slice(0, limit).map((r) => ({
        title: r.title,
        snippet: r.content_text.substring(0, 300) + (r.content_text.length > 300 ? "..." : ""),
        source: r.source_name || r.source_url || `ID: ${r.id}`,
        category: r.category,
        documentId: r.id,
      })),
      keywords,
      totalFound: searchResults.length,
    };

    // Log API usage
    try {
      const { getModelConfig: _getModelConfig } = await import("../_shared/openai-router.ts");
      const kbCfg = _getModelConfig("kb-search-assistant");
      await supabase.rpc("log_api_usage", {
        _service_type: "kb_search_assistant",
        _model_name: kbCfg.model,
        _tokens_used: null,
        _estimated_cost: 0.0005,
        _metadata: { query_length: query.length, keywords_count: keywords.length, results_count: output.results.length }
      });
    } catch (logErr) {
      console.error("Failed to log API usage:", logErr);
    }

    console.log(`KB Search completed: ${output.results.length} results found`);

    return new Response(
      JSON.stringify(output),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("KB Search Assistant error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        results: [],
        keywords: [],
        totalFound: 0
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
