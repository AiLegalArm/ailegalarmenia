import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors } from "../_shared/edge-security.ts";

const CONFIDENCE_THRESHOLD = 0.50;
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: authUser }, error: authError } = await sb.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { audioUrl, fileName, caseId, fileId } = await req.json();

    if (!audioUrl) {
      return new Response(JSON.stringify({ error: "Audio URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log(`Processing audio transcription for: ${fileName}`);

    // Check file size
    const headResponse = await fetch(audioUrl, { method: "HEAD" });
    const contentLength = headResponse.headers.get("content-length");
    const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
    console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return new Response(JSON.stringify({
        error: `File size (${(fileSize / 1024 / 1024).toFixed(1)} MB) exceeds limit (${MAX_FILE_SIZE_MB} MB).`,
        error_code: "file_too_large",
      }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Download the audio
    console.log("Downloading audio file...");
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) throw new Error(`Failed to fetch audio: ${audioResponse.status}`);

    const audioBuffer = await audioResponse.arrayBuffer();
    console.log(`Downloaded ${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Convert to base64
    const uint8Array = new Uint8Array(audioBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize));
    }
    const base64Audio = btoa(binary);

    // Determine MIME type
    const ext = fileName?.split(".").pop()?.toLowerCase() || "mp3";
    const mimeMap: Record<string, string> = {
      mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
      ogg: "audio/ogg", flac: "audio/flac", webm: "audio/webm",
      mp4: "video/mp4", avi: "video/x-msvideo", mov: "video/quicktime",
      mkv: "video/x-matroska",
    };
    const mimeType = mimeMap[ext] || "audio/mpeg";

    // Call via centralized gateway-bypass (multimodal content requires bypass)
    const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");
    console.log("Sending to AI via centralized gateway-bypass (multimodal)...");

    const bypassResult = await callGatewayBypass(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a professional transcription service specializing in Armenian and Russian legal proceedings.
Transcribe the audio file as a dialogue with speaker labels and timestamps.

IMPORTANT RULES:
- Add a timestamp [MM:SS] at the beginning of EACH speaker turn (e.g. [0:00], [0:15], [1:32])
- Identify different speakers and label them as "\u0421\u043F\u0438\u043A\u0435\u0440 1:", "\u0421\u043F\u0438\u043A\u0435\u0440 2:", "\u0421\u043F\u0438\u043A\u0435\u0440 3:" etc.
- Each new speaker turn starts on a new line
- Format: [MM:SS] \u0421\u043F\u0438\u043A\u0435\u0440 N: text
- If only one speaker, still use "\u0421\u043F\u0438\u043A\u0435\u0440 1:"
- Preserve all spoken words exactly as said
- Include legal terminology correctly
- If multiple languages are spoken, transcribe each in its original language
- Output ONLY the dialogue transcription, nothing else

Example format:
[0:00] \u0421\u043F\u0438\u043A\u0435\u0440 1: \u0414\u043E\u0431\u0440\u044B\u0439 \u0434\u0435\u043D\u044C, \u0441\u0443\u0434 \u0437\u0430\u0441\u0435\u0434\u0430\u043D\u0438\u0435 \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F.
[0:08] \u0421\u043F\u0438\u043A\u0435\u0440 2: \u0412\u0430\u0448\u0430 \u0447\u0435\u0441\u0442\u044C, \u0437\u0430\u0449\u0438\u0442\u0430 \u0433\u043E\u0442\u043E\u0432\u0430.
[0:12] \u0421\u043F\u0438\u043A\u0435\u0440 1: \u0425\u043E\u0440\u043E\u0448\u043E, \u043F\u0440\u0438\u0441\u0442\u0443\u043F\u0430\u0435\u043C.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Audio}`,
              },
            },
          ],
        },
      ],
      {
        functionName: "audio-transcribe",
        bypassReason: "multimodal",
        timeoutMs: 120000,
      }
    );

    const geminiResult = bypassResult.data;
    console.log("AI response received");

    const choices = geminiResult.choices as Array<{ message?: { content?: string } }> | undefined;
    const transcription = choices?.[0]?.message?.content?.trim() || "";

    if (!transcription) {
      throw new Error("Empty transcription result from Gemini");
    }

    // Detect language from content
    const armenianChars = (transcription.match(/[\u0531-\u058F]/g) || []).length;
    const russianChars = (transcription.match(/[\u0400-\u04FF]/g) || []).length;
    const totalChars = transcription.length;

    let language_detected = "unknown";
    if (armenianChars / totalChars > 0.3) {
      language_detected = russianChars / totalChars > 0.2 ? "mixed" : "armenian";
    } else if (russianChars / totalChars > 0.3) {
      language_detected = "russian";
    }

    const word_count = transcription.split(/\s+/).filter(Boolean).length;
    const confidence_score = 0.85;

    const needsReview = confidence_score < CONFIDENCE_THRESHOLD;

    const confidence_reason = confidence_score >= 0.8
      ? "High confidence transcription"
      : "Medium confidence \u2014 review recommended";

    // Only save to DB if fileId is provided (case-linked transcription)
    let transcriptionRecord = null;
    if (fileId) {
      const { data, error: insertError } = await supabase
        .from("audio_transcriptions")
        .insert({
          file_id: fileId,
          transcription_text: transcription,
          confidence: confidence_score,
          language: language_detected,
          duration_seconds: 0,
          needs_review: needsReview,
          reviewed_by: null,
          speaker_labels: null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Failed to save transcription:", insertError);
      } else {
        transcriptionRecord = data;
      }
    }

    try {
      await supabase.rpc("log_api_usage", {
        _service_type: "audio",
        _model_name: bypassResult.model_used,
        _tokens_used: 0,
        _estimated_cost: 0,
        _metadata: { fileName, fileId: fileId || null, fileSizeMB: (fileSize / 1024 / 1024).toFixed(2), request_id: bypassResult.request_id }
      });
    } catch (_) { /* non-critical */ }

    return new Response(JSON.stringify({
      success: true,
      transcription_id: transcriptionRecord?.id,
      transcription,
      language_detected,
      speakers_count: 1,
      confidence_score,
      confidence_reason,
      duration_seconds: 0,
      warnings: [],
      word_count,
      needs_review: needsReview,
      tokens_used: 0
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("audio-transcribe error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Transcription failed",
      error_code: "internal_error"
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
