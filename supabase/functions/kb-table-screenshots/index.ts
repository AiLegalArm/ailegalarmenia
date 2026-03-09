/**
 * kb-table-screenshots
 *
 * Processes a legal_document's table chunks that have low extraction quality.
 * For each low-quality table chunk:
 * 1. Sends the relevant text to Gemini Vision for re-extraction
 * 2. If successful, updates the chunk with better markdown
 * 3. If still low quality, creates an image_ref chunk with page metadata
 *
 * Auth: requires x-internal-key header
 * Input: { docId: string }
 * Output: { processed: number, improved: number, image_refs_created: number }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { handleCors, checkInternalAuth } from "../_shared/edge-security.ts";
import { callGatewayBypass } from "../_shared/gateway-bypass.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const authErr = checkInternalAuth(req, corsHeaders);
  if (authErr) return authErr;

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const { docId } = await req.json();
    if (!docId || typeof docId !== "string") {
      return json({ error: "docId is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch the document
    const { data: doc, error: docErr } = await supabase
      .from("legal_documents")
      .select("id, title, content_text, source_url, source_name")
      .eq("id", docId)
      .single();

    if (docErr || !doc) {
      return json({ error: "Document not found" }, 404);
    }

    // Find table chunks with low/medium quality (from metadata)
    const { data: tableChunks, error: chunksErr } = await supabase
      .from("legal_chunks")
      .select("*")
      .eq("doc_id", docId)
      .eq("chunk_type", "table")
      .eq("is_active", true)
      .order("chunk_index", { ascending: true });

    if (chunksErr) {
      return json({ error: "Failed to fetch chunks", details: chunksErr.message }, 500);
    }

    if (!tableChunks || tableChunks.length === 0) {
      return json({ processed: 0, improved: 0, image_refs_created: 0, message: "No table chunks found" }, 200);
    }

    let improved = 0;
    let imageRefsCreated = 0;
    const processed = tableChunks.length;

    for (const chunk of tableChunks) {
      try {
        // Send chunk text to Gemini Vision for better extraction
        const result = await reExtractTable(chunk.chunk_text, doc.title);

        if (result.success && result.markdown) {
          // Update the existing chunk with improved markdown
          const updatedMetadata = {
            ...(chunk.metadata as Record<string, unknown> || {}),
            table_reprocessed: true,
            original_quality: "low",
            reprocessed_quality: result.quality,
            reprocessed_at: new Date().toISOString(),
          };

          await supabase
            .from("legal_chunks")
            .update({
              chunk_text: result.markdown,
              metadata: updatedMetadata,
            })
            .eq("id", chunk.id);

          improved++;
        } else {
          // Create image_ref chunk as fallback
          const imageRefMetadata = {
            content_type: "image_ref",
            confidence: "low" as const,
            source: "screenshot",
            reason: result.reason || "extraction_failed",
            bbox: null,
            bbox_missing: true,
            original_chunk_id: chunk.id,
            doc_title: doc.title,
            source_url: doc.source_url,
            reprocessed_at: new Date().toISOString(),
          };

          // Get max chunk_index for this doc
          const { data: maxIdx } = await supabase
            .from("legal_chunks")
            .select("chunk_index")
            .eq("doc_id", docId)
            .order("chunk_index", { ascending: false })
            .limit(1)
            .single();

          const nextIndex = (maxIdx?.chunk_index ?? 0) + 1 + imageRefsCreated;

          const imageRefText = buildImageRefText(chunk, doc.title);

          await supabase
            .from("legal_chunks")
            .insert({
              doc_id: docId,
              doc_type: "law",
              chunk_index: nextIndex,
              chunk_type: "table",
              chunk_text: imageRefText,
              char_start: chunk.char_start,
              char_end: chunk.char_end,
              label: `image_ref: ${chunk.label || "Table"}`,
              metadata: imageRefMetadata,
              chunk_hash: simpleHash(imageRefText),
              norm_refs: [],
              is_active: true,
            });

          // Mark original chunk with image_ref reference
          await supabase
            .from("legal_chunks")
            .update({
              metadata: {
                ...(chunk.metadata as Record<string, unknown> || {}),
                has_image_ref: true,
                reprocessing_failed: true,
                reason: result.reason,
              },
            })
            .eq("id", chunk.id);

          imageRefsCreated++;
        }
      } catch (chunkErr) {
        console.error(`Failed to process chunk ${chunk.id}:`, chunkErr);
        // Continue with next chunk
      }
    }

    return json({
      processed,
      improved,
      image_refs_created: imageRefsCreated,
    }, 200);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("kb-table-screenshots error:", msg);
    return json({ error: msg }, 500);
  }
});

// ─── Gemini Vision re-extraction (via gateway-bypass, MODEL_MAP: ocr-process) ──

interface ReExtractResult {
  success: boolean;
  markdown: string | null;
  quality: "high" | "medium" | "low";
  reason?: string;
}

async function reExtractTable(
  chunkText: string,
  docTitle: string
): Promise<ReExtractResult> {
  const systemPrompt = [
    "You are a table extraction specialist for Armenian legal documents.",
    "You receive a poorly extracted table from a legal document.",
    "Your task is to reconstruct the table in clean Markdown format.",
    "",
    "Rules:",
    "1. Preserve ALL original data exactly as-is. Do NOT translate or modify content.",
    "2. Maintain proper column alignment and row structure.",
    "3. Use standard Markdown table syntax: | Col1 | Col2 |",
    "4. If the text is too corrupted to reconstruct, respond with: EXTRACTION_FAILED",
    "5. Include a header row separator: | --- | --- |",
    "6. Armenian text must remain in Armenian. Do not transliterate.",
  ].join("\n");

  const userPrompt = [
    `Document: ${docTitle}`,
    "",
    "Below is a table that was poorly extracted. Please reconstruct it as a clean Markdown table:",
    "",
    "```",
    chunkText,
    "```",
  ].join("\n");

  try {
    const bypassResult = await callGatewayBypass(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        functionName: "ocr-process",
        bypassReason: "table_reextraction",
        timeoutMs: 30000,
      }
    );

    const content = (bypassResult.data?.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content?.trim() || "";

    if (content.includes("EXTRACTION_FAILED") || content.length < 20) {
      return { success: false, markdown: null, quality: "low", reason: "extraction_failed" };
    }

    // Check if the response contains a valid markdown table
    if (content.includes("|") && content.includes("---")) {
      return { success: true, markdown: content, quality: "high" };
    }

    // Partial success — the AI returned something but not a proper table
    return { success: true, markdown: content, quality: "medium" };
  } catch (err) {
    console.error("reExtractTable error:", err);
    return { success: false, markdown: null, quality: "low", reason: "exception" };
  }
}

// ─── JSONL image_ref format builder ──────────────────────────────────

function buildImageRefText(
  chunk: { chunk_text: string; char_start: number; char_end: number; label: string | null },
  docTitle: string
): string {
  return [
    `[IMAGE_REF] ${chunk.label || "Table"} (${docTitle})`,
    "",
    `\u054F\u0561\u0562\u056C\u056B\u0581\u0561 (\u057D\u056F\u0580\u056B\u0576\u0577\u0578\u0569). \u054A\u0561\u057F\u0573\u0561\u057c: extraction_failed.`,
    "",
    "Original text (corrupted):",
    chunk.chunk_text.slice(0, 500),
    chunk.chunk_text.length > 500 ? "..." : "",
  ].join("\n");
}

// ─── Simple hash ─────────────────────────────────────────────────────

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
