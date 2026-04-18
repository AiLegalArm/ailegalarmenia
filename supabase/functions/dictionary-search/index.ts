import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors } from "../_shared/edge-security.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const start = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getUser(token);
    if (claimsErr || !claims?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { q, limit = 20, offset = 0 } = await req.json();

    if (!q || typeof q !== "string" || q.trim().length < 1 || q.trim().length > 80) {
      return new Response(
        JSON.stringify({ error: "q must be a string of length 1..80" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const safeOffset = Math.max(0, Number(offset) || 0);

    // Use the DB RPC for search
    const { data, error } = await supabase.rpc("dictionary_search", {
      q_norm: q.trim().toLowerCase(),
      search_limit: safeLimit,
      search_offset: safeOffset,
    });

    if (error) {
      console.error("dictionary_search error:", error);
      return new Response(
        JSON.stringify({ error: "Search failed", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const latency_ms = Date.now() - start;

    return new Response(
      JSON.stringify({
        q: q.trim(),
        q_norm: q.trim().toLowerCase(),
        results: data || [],
        total: data?.length ?? 0,
        latency_ms,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("dictionary-search error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
