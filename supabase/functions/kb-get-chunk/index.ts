import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors } from "../_shared/edge-security.ts";

serve(async (req) => {
  // Handle CORS
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method !== "GET" && req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse parameters from URL or body
    let docId: string;
    let chunkIndex: number;

    if (req.method === "GET") {
      const url = new URL(req.url);
      docId = url.searchParams.get("docId") || "";
      chunkIndex = parseInt(url.searchParams.get("chunkIndex") || "0", 10);
    } else {
      const body = await req.json();
      docId = body.docId || "";
      chunkIndex = parseInt(body.chunkIndex || "0", 10);
    }

    // Validate inputs
    if (!docId || typeof docId !== "string") {
      return new Response(
        JSON.stringify({ error: "docId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return new Response(
        JSON.stringify({ error: "chunkIndex must be a non-negative integer" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the document
    const { data: doc, error } = await supabase
      .from("legal_practice_kb")
      .select("id, title, content_chunks, chunk_index_meta")
      .eq("id", docId)
      .eq("is_active", true)
      .single();

    if (error || !doc) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chunks = doc.content_chunks || [];
    const totalChunks = chunks.length;

    // Validate chunk index
    if (chunkIndex >= totalChunks) {
      return new Response(
        JSON.stringify({ 
          error: `chunkIndex ${chunkIndex} out of range. Document has ${totalChunks} chunks (0-${totalChunks - 1}).`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chunkText = chunks[chunkIndex] || "";
    const chunkMeta = (doc.chunk_index_meta || [])[chunkIndex] || null;

    return new Response(
      JSON.stringify({
        id: doc.id,
        title: doc.title,
        chunkIndex,
        totalChunks,
        text: chunkText,
        meta: chunkMeta,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("KB get-chunk error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to get chunk" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
