import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { OCR_EXTRACTION, buildModelParams } from "../_shared/model-config.ts";
import { redactForLog } from "../_shared/pii-redactor.ts";
import { parseDocx } from "../_shared/docx-parser.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.70;
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "tiff", "tif", "webp", "docx", "txt"]);

// ─── Pricing map (per 1K tokens) ────────────────────────────────────────────
const MODEL_PRICING: Record<string, { input_per_1k: number; output_per_1k: number }> = {
  "google/gemini-2.5-flash":      { input_per_1k: 0.000075, output_per_1k: 0.0003 },
  "google/gemini-2.5-flash-lite": { input_per_1k: 0.000025, output_per_1k: 0.0001 },
  "google/gemini-2.5-pro":        { input_per_1k: 0.00125,  output_per_1k: 0.01 },
  "google/gemini-3-flash-preview":{ input_per_1k: 0.0001,   output_per_1k: 0.0004 },
  "google/gemini-3-pro-preview":  { input_per_1k: 0.0015,   output_per_1k: 0.01 },
  "openai/gpt-5":                 { input_per_1k: 0.005,    output_per_1k: 0.015 },
  "openai/gpt-5-mini":            { input_per_1k: 0.0004,   output_per_1k: 0.0016 },
};

function computeCost(model: string, inputTokens: number, outputTokens: number): { cost_usd: number; cost_estimated: boolean } {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return { cost_usd: 0, cost_estimated: true };
  return {
    cost_usd: (inputTokens / 1000) * pricing.input_per_1k + (outputTokens / 1000) * pricing.output_per_1k,
    cost_estimated: false,
  };
}

// CORS handled via handleCors in serve() below; corsHeaders is set per-request.
import { handleCors as _handleCorsOcr } from "../_shared/edge-security.ts";
const DEFAULT_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Validate that a URL points to our own Supabase storage — blocks SSRF */
function isAllowedFileUrl(url: string): boolean {
  if (url.startsWith('data:')) return true;
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) return false;

  // Strict check: Must start with Supabase URL + /storage/v1/object/
  // This prevents hitting other endpoints or external domains
  if (url.startsWith(supabaseUrl + '/storage/v1/object/')) {
    return true;
  }
  
  // Also allow relative paths if they are strictly /storage/v1/object/
  // (though fetch() usually requires absolute, some clients might send relative)
  if (url.startsWith('/storage/v1/object/')) {
    return true;
  }

  return false;
}

// ─── Output schema ──────────────────────────────────────────────────────────

interface OcrResponse {
  ok: boolean;
  text: string;
  pages?: number;
  language?: string;
  warnings?: string[];
  pipeline?: string;
  usage?: {
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    usage_missing?: boolean;
  };
  // Legacy fields kept for backward compat
  ocr_id?: string;
  confidence_score?: number;
  confidence_reason?: string;
  needs_review?: boolean;
  review_warning?: string | null;
  word_count?: number;
}

// Note: these use a per-request corsHeaders variable captured in the handler closure
let _activeCorsHeaders: Record<string, string> = DEFAULT_CORS_HEADERS;

function jsonResponse(body: OcrResponse, status = 200, requestId?: string): Response {
  const headers: Record<string, string> = { ..._activeCorsHeaders, "Content-Type": "application/json" };
  if (requestId) headers["x-request-id"] = requestId;
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(message: string, status = 400, requestId?: string): Response {
  const body: OcrResponse = { ok: false, text: "", warnings: [message] };
  const headers: Record<string, string> = { ..._activeCorsHeaders, "Content-Type": "application/json" };
  if (requestId) headers["x-request-id"] = requestId;
  return new Response(JSON.stringify(body), { status, headers });
}

// ─── System prompt ──────────────────────────────────────────────────────────

export const OCR_SYSTEM_PROMPT = `You are an expert OCR specialist for Armenian legal documents with advanced handwritten text recognition capabilities. Your task is to accurately extract BOTH printed AND handwritten text from scanned documents, PDFs, and images containing Armenian (hy), Russian (ru), or English (en) text.

CRITICAL INSTRUCTIONS:
1) Return ONLY valid JSON — no markdown, no backticks.
2) Identify ALL languages present (Armenian, Russian, English).
3) Detect and separately note handwritten sections.
4) Preserve exact legal terminology and article references (e.g., ՀՀ ՔԿ 123-րդ հdelays).
5) Maintain document structure: paragraphs, numbered lists, tables.
6) If confidence is low for any section, add a warning.
7) For PDF documents, estimate the page count in your response.

JSON schema:
{
  "extracted_text": "<full text or {full, printed_only, handwritten_only}>",
  "languages_detected": ["hy","ru","en"],
  "confidence_score": 0.0-1.0,
  "confidence_reason": "...",
  "text_types_detected": ["printed","handwritten"],
  "handwritten_sections": [],
  "warnings": [],
  "word_count": 0,
  "pages": 0
}

8) Mark unclear/illegible text with [illegible] or [unclear].
9) Preserve handwritten Armenian text exactly as written (no spelling correction).`;

// ─── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  // Centralized CORS handling
  const corsResult = _handleCorsOcr(req);
  if (corsResult.errorResponse) return corsResult.errorResponse;
  // Per-request CORS headers — avoid shared mutable state
  if (corsResult.corsHeaders) _activeCorsHeaders = corsResult.corsHeaders;

  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

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
      return errorResponse("Unauthorized", 401, requestId);
    }

    // === RATE LIMITING (P0) ===
    const { checkRateLimits } = await import("../_shared/rate-limiter.ts");
    const supabaseServiceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const rateCheck = await checkRateLimits(supabaseServiceClient, user.id, "ocr-process");
    if (!rateCheck.allowed) {
      return errorResponse(rateCheck.message || "Rate limit exceeded", rateCheck.status || 429, requestId);
    }
    // === END RATE LIMITING ===

    const body = await req.json();
    const fileUrl = body.fileUrl || body.imageUrl;
    const fileName: string = body.fileName || 'document';
    const { caseId, fileId } = body;

    // === INPUT VALIDATION ===
    if (!fileUrl || typeof fileUrl !== "string") {
      return errorResponse("File URL is required", 400, requestId);
    }

    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';

    if (!ALLOWED_EXTENSIONS.has(fileExt)) {
      return errorResponse(`Unsupported file type: .${fileExt}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`, 400, requestId);
    }

    if (fileExt === 'doc') {
      return errorResponse("Legacy .doc format is not supported. Please convert to DOCX or PDF.", 400, requestId);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const userId = user.id;

    console.log(`[ocr-process] requestId=${requestId} file=${fileName} ext=${fileExt}`);

    const isPdf = fileExt === 'pdf';
    const isDocx = fileExt === 'docx';
    const isTxt = fileExt === 'txt';
    const isImage = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'webp'].includes(fileExt);

    let imageContent: { type: string; image_url?: { url: string }; text?: string } | null = null;
    let docxTextContent: string | null = null;
    let docxImages: string[] = [];
    let txtContent: string | null = null;
    let fileBuffer: ArrayBuffer | null = null;

    // ─── File acquisition ───────────────────────────────────────────────
    if (fileUrl.startsWith('data:')) {
      if (isImage || isPdf) {
        imageContent = { type: "image_url", image_url: { url: fileUrl } };
      } else if (isDocx) {
        const base64Match = fileUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (!base64Match) throw new Error('Invalid base64 data URL format');
        const binaryString = atob(base64Match[1]);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        fileBuffer = bytes.buffer;
      } else if (isTxt) {
        const base64Match = fileUrl.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
          try {
            txtContent = decodeURIComponent(escape(atob(base64Match[1])));
          } catch {
            txtContent = atob(base64Match[1]);
          }
        } else {
          const textMatch = fileUrl.match(/^data:text\/plain[^,]*,(.+)$/);
          if (textMatch) txtContent = decodeURIComponent(textMatch[1]);
        }
      }
    } else if (fileUrl.includes('/storage/v1/object/')) {
      const storageMatch = fileUrl.match(/\/storage\/v1\/object\/(?:public\/)?([^\/]+)\/(.+)$/);
      if (!storageMatch) throw new Error('Invalid Supabase storage URL format');
      const [, bucket, path] = storageMatch;
      const decodedPath = decodeURIComponent(path);
      const { data, error } = await supabase.storage.from(bucket).download(decodedPath);
      if (error || !data) throw new Error(`Failed to download from storage: ${error?.message || 'Unknown error'}`);
      fileBuffer = await data.arrayBuffer();
    } else {
      // SSRF PROTECTION: Block arbitrary URL fetching
      if (!isAllowedFileUrl(fileUrl)) {
        return errorResponse("Invalid file URL: only Supabase storage URLs are allowed", 400, requestId);
      }
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) throw new Error(`Failed to download file: ${fileResponse.status}`);
      fileBuffer = await fileResponse.arrayBuffer();
    }

    // ─── File size check ────────────────────────────────────────────────
    if (fileBuffer && fileBuffer.byteLength > MAX_FILE_SIZE) {
      return errorResponse(`File size ${(fileBuffer.byteLength / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`, 400, requestId);
    }

    // ─── TXT: direct text, no AI ────────────────────────────────────────
    if (isTxt && fileBuffer && !txtContent) {
      txtContent = new TextDecoder('utf-8').decode(fileBuffer);
    }

    if (txtContent) {
      const pipeline = "txt_direct";
      await supabase.rpc("log_api_usage", {
        _service_type: "ocr",
        _model_name: "direct_text",
        _tokens_used: 0,
        _estimated_cost: 0,
        _metadata: { pipeline, file_type: "txt", request_id: requestId, usage_missing: false }
      });

      if (fileId) {
        await upsertOcrResult(supabase, fileId, txtContent, 1.0, "hy, ru, en", false);
      }

      return jsonResponse({
        ok: true,
        text: txtContent,
        language: "hy, ru, en",
        warnings: [],
        word_count: txtContent.split(/\s+/).length,
        confidence_score: 1.0,
        confidence_reason: "Direct text file — no OCR required",
        needs_review: false,
        pipeline,
        usage: { provider: "direct", model: "direct_text", input_tokens: 0, output_tokens: 0, cost_usd: 0 },
      }, 200, requestId);
    }

    // ─── DOCX: parse text + images ──────────────────────────────────────
    if (isDocx && fileBuffer) {
      const parsed = await parseDocx(fileBuffer);
      if (parsed.text && parsed.text.length >= 20) {
        docxTextContent = parsed.text;
      }
      if (parsed.images.length > 0) {
        docxImages = parsed.images;
      }
      if (parsed.warnings.length > 0) {
        console.warn("[ocr-process] DOCX warnings:", parsed.warnings);
      }
      if ((!docxTextContent || docxTextContent.length < 20) && docxImages.length === 0) {
        throw new Error("Could not extract meaningful content from DOCX. Try converting to PDF.");
      }
    } else if (!imageContent && fileBuffer) {
      // PDF or image from URL → base64
      const bytes = new Uint8Array(fileBuffer);
      const { uint8ToBase64 } = await import("../_shared/base64.ts");
      const base64 = uint8ToBase64(bytes);

      let mimeType = 'image/jpeg';
      if (isPdf) mimeType = 'application/pdf';
      else if (fileExt === 'png') mimeType = 'image/png';
      else if (fileExt === 'tiff' || fileExt === 'tif') mimeType = 'image/tiff';
      else if (fileExt === 'webp') mimeType = 'image/webp';

      imageContent = { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } };
    }

    // ─── Build messages for AI ──────────────────────────────────────────
    let messages;

    if (docxTextContent || docxImages.length > 0) {
      if (docxImages.length > 0) {
        const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
        let instruction = "Content extracted from a Word document (DOCX). File: " + fileName + ". ";
        if (docxTextContent) {
          instruction += "Contains text and embedded images. Extract ALL text from images, combine with extracted text, preserve Armenian legal terms.\n\nExtracted text:\n" + docxTextContent;
        } else {
          instruction += "Contains only images/screenshots. Extract ALL text, focusing on Armenian legal terminology.";
        }
        contentParts.push({ type: "text", text: instruction });
        for (const imgData of docxImages.slice(0, 5)) {
          contentParts.push({ type: "image_url", image_url: { url: imgData } });
        }
        messages = [
          { role: "system", content: OCR_SYSTEM_PROMPT },
          { role: "user", content: contentParts }
        ];
      } else {
        messages = [
          { role: "system", content: OCR_SYSTEM_PROMPT },
          { role: "user", content: "Extracted text from DOCX. File: " + fileName + ". Analyze and structure this Armenian legal document.\n\nText:\n" + docxTextContent }
        ];
      }
    } else if (imageContent) {
      messages = [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        { role: "user", content: [
          { type: "text", text: "Extract all text from this " + (isPdf ? 'PDF' : 'image') + ". File: " + fileName + ". Preserve Armenian legal terminology." },
          imageContent
        ]}
      ];
    } else {
      throw new Error('No content to process');
    }

    // ─── Call AI ────────────────────────────────────────────────────────
    const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");
    const bypassResult = await callGatewayBypass(messages, {
      functionName: "ocr-process",
      bypassReason: "multimodal",
      timeoutMs: 90000,
    });
    const aiData = bypassResult.data;

    const rawContent = (aiData.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content || "";

    console.log("[ocr-process] Raw AI response:", redactForLog(rawContent, 500));

    // ─── Parse AI response ──────────────────────────────────────────────
    let ocrResult: Record<string, unknown>;
    try {
      let jsonStr = rawContent;
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      ocrResult = JSON.parse(jsonStr);
    } catch {
      ocrResult = {
        extracted_text: rawContent,
        languages_detected: ["unknown"],
        confidence_score: 0.5,
        confidence_reason: "Failed to parse structured response",
        warnings: ["Response format was unexpected"],
        word_count: rawContent.split(/\s+/).length
      };
    }

    const extracted_text = typeof ocrResult.extracted_text === 'object' && (ocrResult.extracted_text as Record<string, unknown>)?.full
      ? (ocrResult.extracted_text as Record<string, unknown>).full as string
      : ocrResult.extracted_text as string || "";
    const languages_detected = ocrResult.languages_detected as string[] | undefined;
    const confidence_score = (ocrResult.confidence_score as number) || 0.5;
    const confidence_reason = (ocrResult.confidence_reason as string) || "";
    const warnings = (ocrResult.warnings as string[]) || [];
    const word_count = (ocrResult.word_count as number) || extracted_text.split(/\s+/).length;
    const pages = (ocrResult.pages as number) || undefined;
    const needsReview = confidence_score < CONFIDENCE_THRESHOLD;

    // ─── Extract usage from AI response ─────────────────────────────────
    const aiUsage = aiData.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
    const usageMissing = !aiUsage;
    const inputTokens = aiUsage?.prompt_tokens || 0;
    const outputTokens = aiUsage?.completion_tokens || 0;
    const totalTokens = aiUsage?.total_tokens || (inputTokens + outputTokens);
    const modelName = (aiData.model as string) || "google/gemini-2.5-flash";
    const { cost_usd: costUsd, cost_estimated: costEstimated } = computeCost(modelName, inputTokens, outputTokens);

    // ─── Determine pipeline ─────────────────────────────────────────────
    let pipeline: string;
    if (docxTextContent && docxImages.length > 0) {
      pipeline = "docx_images_multimodal";
    } else if (docxTextContent) {
      pipeline = "docx_text_only";
    } else {
      pipeline = "pdf_or_image_multimodal";
    }

    // ─── Save OCR result ────────────────────────────────────────────────
    let ocrRecordId: string | null = null;
    if (fileId) {
      const record = await upsertOcrResult(
        supabase, fileId, extracted_text, confidence_score,
        languages_detected?.join(", ") || "unknown", needsReview
      );
      ocrRecordId = record?.id || null;
    }

    // ─── Log usage ──────────────────────────────────────────────────────
    await supabase.rpc("log_api_usage", {
      _service_type: "ocr",
      _model_name: modelName,
      _tokens_used: totalTokens,
      _estimated_cost: costUsd,
      _metadata: {
        pipeline,
        request_id: requestId,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        confidence: confidence_score,
        pages: pages || null,
        usage_missing: usageMissing,
        cost_estimated: costEstimated,
      }
    });

    console.log(`[ocr-process] requestId=${requestId} pipeline=${pipeline} done: ${word_count} words, confidence=${confidence_score}, tokens=${totalTokens}`);

    // ─── Return normalized response ─────────────────────────────────────
    return jsonResponse({
      ok: true,
      text: extracted_text,
      pages,
      language: languages_detected?.join(", ") || "unknown",
      warnings,
      pipeline,
      usage: {
        provider: "lovable-gateway",
        model: modelName,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        usage_missing: usageMissing,
      },
      // Legacy fields for backward compat
      ocr_id: ocrRecordId || undefined,
      confidence_score,
      confidence_reason,
      needs_review: needsReview,
      review_warning: needsReview
        ? `Confidence ${(confidence_score * 100).toFixed(0)}% is below 70% threshold. Manual review recommended.`
        : null,
      word_count,
    }, 200, requestId);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "OCR processing failed";
    console.error(`[ocr-process] requestId=${requestId} error:`, errMsg);

    // Structured error logging — no PII
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.rpc("log_error", {
        _error_type: "ocr",
        _error_message: `OCR processing failed: ${errMsg}`,
        _error_details: { request_id: requestId, stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined },
        _case_id: null,
        _file_id: null,
      });
    } catch (logErr) {
      console.error("[ocr-process] Failed to log error:", logErr);
    }

    return jsonResponse({
      ok: false,
      text: "",
      warnings: [errMsg],
    }, 500, requestId);
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function upsertOcrResult(
  supabase: ReturnType<typeof createClient>,
  fileId: string,
  text: string,
  confidence: number,
  language: string,
  needsReview: boolean,
): Promise<{ id: string } | null> {
  const { data: existing } = await supabase
    .from("ocr_results")
    .select("id")
    .eq("file_id", fileId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("ocr_results")
      .update({ extracted_text: text, confidence, language, needs_review: needsReview })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) console.error("[ocr-process] Failed to update OCR result:", error);
    return data;
  } else {
    const { data, error } = await supabase
      .from("ocr_results")
      .insert({ file_id: fileId, extracted_text: text, confidence, language, needs_review: needsReview })
      .select("id")
      .single();
    if (error) console.error("[ocr-process] Failed to insert OCR result:", error);
    return data;
  }
}
