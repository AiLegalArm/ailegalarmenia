/**
 * translate-to-armenian
 * Translates a text chunk to Armenian using the centralized AI router.
 * Input:  { text: string }
 * Output: { translated: string, model_used: string }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors } from "../_shared/edge-security.ts";
import { callText } from "../_shared/openai-router.ts";

const FUNCTION_NAME = "translate-to-armenian";

const SYSTEM_PROMPT =
  "You are a professional legal translator specializing in Armenian law. " +
  "Translate the following legal text to Eastern Armenian. " +
  "Preserve all legal terminology, article numbers, case numbers, dates, and proper nouns exactly as-is. " +
  "Output ONLY the translated text, nothing else.";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return json({ error: "text is required" }, 400);
    }

    const result = await callText(FUNCTION_NAME, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ]);

    return json({
      translated: result.text || text,
      model_used: result.model_used,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Translation failed";
    console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: FUNCTION_NAME, msg }));
    return json({ error: msg }, 500);
  }
});
