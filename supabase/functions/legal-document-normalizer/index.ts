/**
 * legal-document-normalizer
 *
 * Thin HTTP wrapper around the shared normalizer logic.
 * All business logic lives in _shared/normalizer.ts.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors, checkInternalAuth, checkInputSize } from "../_shared/edge-security.ts";
import { normalize, validate } from "../_shared/normalizer.ts";
import type { NormalizerInput } from "../_shared/normalizer.ts";

// Re-export for tests
export { normalize, validate } from "../_shared/normalizer.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  // Auth guard
  const authErr = checkInternalAuth(req, corsHeaders);
  if (authErr) return authErr;

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { fileName, mimeType, rawText, sourceUrl } = body as NormalizerInput;

    // Input validation
    if (!fileName || typeof fileName !== "string") {
      return new Response(
        JSON.stringify({ error: "fileName is required (string)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!rawText || typeof rawText !== "string") {
      return new Response(
        JSON.stringify({ error: "rawText is required (string)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (rawText.length === 0) {
      return new Response(
        JSON.stringify({ error: "rawText must not be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Input size limit
    const sizeErr = checkInputSize(rawText, corsHeaders);
    if (sizeErr) return sizeErr;

    const document = await normalize({
      fileName,
      mimeType: mimeType || "text/plain",
      rawText,
      sourceUrl,
    });

    const validationErrors = validate(document);
    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: validationErrors, document }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ document }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("legal-document-normalizer error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
