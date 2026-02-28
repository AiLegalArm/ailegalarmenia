import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { FIELD_EXTRACTION, buildModelParams } from "../_shared/model-config.ts";
import { handleCors } from "../_shared/edge-security.ts";

const SYSTEM_PROMPT = [
  "Ты — юридический аналитик по делам Республики Армения.",
  "",
  "Тебе передан агрегированный текст дела (все файлы + OCR).",
  "Документы могут охватывать несколько стадий процесса.",
  "",
  "СТРОГИЕ ПРАВИЛА:",
  "",
  "1) Не выдумывай — извлекай только то, что есть в материалах.",
  "2) Если данных недостаточно — прямо укажи: «[\u0532\u0531\u0551\u0531\u053f\u0531\u0545\u0548\u0552\u0544 \u0538 — \u0561\u0576\u0570\u0580\u0561\u056b\u0565\u0577\u057f \u0567 \u0571\u0565\u057c\u0584 \u0562\u0565\u0580\u0565\u056c]».",
  "3) PII (\u0430\u0434\u0440\u0435\u0441\u0430, \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u044b, \u043f\u0430\u0441\u043f\u043e\u0440\u0442\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435) \u043c\u0430\u0441\u043a\u0438\u0440\u0443\u0439 \"***\".",
  "",
  "facts — \u0441\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u0438\u0440\u043e\u0432\u0430\u043d\u043d\u044b\u0439 \u0442\u0435\u043a\u0441\u0442 10\u201325 \u043f\u0443\u043d\u043a\u0442\u043e\u0432:",
  "",
  "1) \u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0438 (\u0438\u043c\u0435\u043d\u0430 \u043c\u0430\u0441\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u044b \u043f\u0440\u0438 \u043d\u0435\u043e\u0431\u0445\u043e\u0434\u0438\u043c\u043e\u0441\u0442\u0438)",
  "2) \u0425\u0440\u043e\u043d\u043e\u043b\u043e\u0433\u0438\u044f \u0441 \u0434\u0430\u0442\u0430\u043c\u0438",
  "3) \u041f\u0440\u043e\u0446\u0435\u0441\u0441\u0443\u0430\u043b\u044c\u043d\u044b\u0435 \u0440\u0435\u0448\u0435\u043d\u0438\u044f (1 \u0438\u043d\u0441\u0442\u0430\u043d\u0446\u0438\u044f \u2192 \u0430\u043f\u0435\u043b\u043b\u044f\u0446\u0438\u044f \u2192 \u043a\u0430\u0441\u0441\u0430\u0446\u0438\u044f)",
  "4) \u0427\u0442\u043e \u043e\u0431\u0436\u0430\u043b\u0443\u0435\u0442\u0441\u044f",
  "5) \u0422\u0435\u043a\u0443\u0449\u0430\u044f \u0441\u0442\u0430\u0434\u0438\u044f (\u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0438 \u043f\u043e \u043f\u0440\u0430\u0432\u0438\u043b\u0443 \"\u0441\u0430\u043c\u0430\u044f \u043f\u043e\u0437\u0434\u043d\u044f\u044f \u0434\u0430\u0442\u0430\")",
  "",
  "\u0415\u0441\u043b\u0438 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b \u043e\u0445\u0432\u0430\u0442\u044b\u0432\u0430\u044e\u0442 \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0441\u0442\u0430\u0434\u0438\u0439 — \u044f\u0432\u043d\u043e \u043f\u0435\u0440\u0435\u0447\u0438\u0441\u043b\u0438 \u0438\u0445.",
  "",
  "legal_question — 1\u20133 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f.",
  "\u0413\u043b\u0430\u0432\u043d\u044b\u0439 \u044e\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0432\u043e\u043f\u0440\u043e\u0441, \u043a\u043e\u0442\u043e\u0440\u044b\u0439 \u0440\u0430\u0441\u0441\u043c\u0430\u0442\u0440\u0438\u0432\u0430\u0435\u0442\u0441\u044f \u043d\u0430 \u0442\u0435\u043a\u0443\u0449\u0435\u0439 \u0441\u0442\u0430\u0434\u0438\u0438.",
].join("\n");
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
    const token = authHeader.replace('Bearer ', '');
    const { data, error: authError } = await sb.auth.getClaims(token);
    if (authError || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END AUTH GUARD ===

    const { caseId } = await req.json();
    if (!caseId) throw new Error("caseId is required");

    console.log("Processing extraction for case:", caseId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get case data
    const { data: caseData, error: caseError } = await supabase
      .from("cases")
      .select("id, title, description, facts, legal_question, case_number, case_type, court_name, court_date, notes")
      .eq("id", caseId)
      .single();

    if (caseError || !caseData) {
      throw new Error(`Case not found: ${caseError?.message}`);
    }

    // Get OCR results
    const { data: ocrResults } = await supabase
      .from("ocr_results")
      .select(`extracted_text, case_files!inner(case_id)`)
      .eq("case_files.case_id", caseId)
      .limit(5);

    // Get audio transcriptions
    const { data: transcriptions } = await supabase
      .from("audio_transcriptions")
      .select(`transcription_text, case_files!inner(case_id)`)
      .eq("case_files.case_id", caseId)
      .limit(5);

    // Get uploaded case files (PDFs)
    const { data: caseFiles } = await supabase
      .from("case_files")
      .select("id, original_filename, storage_path, file_type")
      .eq("case_id", caseId)
      .is("deleted_at", null)
      .in("file_type", ["application/pdf", "image/jpeg", "image/png", "image/jpg"])
      .limit(3);

    // Build text context — always include available case metadata
    let context = "";

    // Always include title and known fields as baseline context
    context += `\n\n=== CASE METADATA ===`;
    context += `\nTitle: ${caseData.title}`;
    if (caseData.case_number) context += `\nCase Number: ${caseData.case_number}`;
    if (caseData.case_type) context += `\nCase Type: ${caseData.case_type}`;
    if (caseData.court_name) context += `\nCourt: ${caseData.court_name}`;
    if (caseData.court_date) context += `\nCourt Date: ${caseData.court_date}`;

    if (caseData.description) {
      context += `\n\n=== CASE DESCRIPTION ===\n${caseData.description}`;
    }

    if (caseData.notes) {
      context += `\n\n=== CASE NOTES ===\n${caseData.notes}`;
    }

    if (ocrResults && ocrResults.length > 0) {
      context += "\n\n=== OCR EXTRACTED TEXT ===";
      ocrResults.forEach((ocr, idx) => {
        context += `\n\n[Document ${idx + 1}]:\n${(ocr.extracted_text || "").substring(0, 8000)}`;
      });
    }

    if (transcriptions && transcriptions.length > 0) {
      context += "\n\n=== AUDIO TRANSCRIPTIONS ===";
      transcriptions.forEach((trans, idx) => {
        context += `\n\n[Transcription ${idx + 1}]:\n${(trans.transcription_text || "").substring(0, 8000)}`;
      });
    }

    // Build multimodal message content
    const userMessageContent: unknown[] = [];

    if (context.trim()) {
      userMessageContent.push({
        type: "text",
        text: `Проанализируй следующие материалы дела и извлеки facts и legal_question.\n\n<<<CASE_START>>>\n${context}\n<<<CASE_END>>>`
      });
    }

    // If we have uploaded PDF/image files and no text context, download and send them
    const hasTextContext = context.trim().length > 0;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const IMAGE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

    if (caseFiles && caseFiles.length > 0) {
      for (const file of caseFiles) {
        try {
          const mimeType = file.file_type || "";
          const isImage = IMAGE_MIME_TYPES.includes(mimeType);
          const isPdf = mimeType === "application/pdf";

          // PDFs cannot be sent as image_url — mention them in text context instead
          if (isPdf) {
            console.log(`PDF file noted (cannot send as image): ${file.original_filename}`);
            context += `\n\n=== UPLOADED PDF FILE ===\nFilename: ${file.original_filename}\n(PDF content — extract information from the case metadata and OCR results above)`;
            continue;
          }

          // Only process actual image files
          if (!isImage) {
            console.warn(`Unsupported file type ${mimeType} for ${file.original_filename}, skipping`);
            continue;
          }

          console.log(`Downloading image from storage: ${file.storage_path}`);
          
          // Download file from Supabase storage
          const { data: fileData, error: downloadError } = await supabase.storage
            .from("case-files")
            .download(file.storage_path);

          if (downloadError || !fileData) {
            console.warn(`Failed to download ${file.storage_path}: ${downloadError?.message}`);
            continue;
          }

          const arrayBuffer = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          if (bytes.length > 15 * 1024 * 1024) {
            console.warn(`File too large (${bytes.length} bytes), skipping`);
            continue;
          }

          // Convert to base64
          const { uint8ToBase64 } = await import("../_shared/base64.ts");
          const base64 = uint8ToBase64(bytes);
          const dataUrl = `data:${mimeType};base64,${base64}`;

          console.log(`Image ${file.original_filename} encoded (${Math.round(base64.length / 1024)}KB)`);

          if (!hasTextContext && userMessageContent.length === 0) {
            userMessageContent.push({
              type: "text",
              text: `Проанализируй это изображение и извлеки facts и legal_question: "${file.original_filename}"`
            });
          } else {
            userMessageContent.push({
              type: "text",
              text: `\n[Изображение: "${file.original_filename}"]`
            });
          }

          userMessageContent.push({
            type: "image_url",
            image_url: { url: dataUrl }
          });

        } catch (fileErr) {
          console.warn(`Error processing file ${file.id}:`, fileErr);
        }
      }
    }

    if (userMessageContent.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No data available for extraction. Please add a case description or upload PDF/image documents first."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Calling AI for extraction with", userMessageContent.length, "content parts...");

    // Route via centralized gateway-bypass (tool_calling requires bypass)
    const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");

    const bypassResult = await callGatewayBypass(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessageContent }
      ],
      {
        functionName: "extract-case-fields",
        bypassReason: "tool_calling",
        timeoutMs: 60000,
        extraBody: {
          tools: [
            {
              type: "function",
              function: {
                name: "extract_case_fields",
                description: "Извлечь facts и legal_question из материалов дела",
                parameters: {
                  type: "object",
                  properties: {
                    case_number: {
                      type: "string",
                      description: "Номер дела как указан в документах. Пустая строка если не найден."
                    },
                    description: {
                      type: "string",
                      description: "Краткое описание дела 3-5 предложений: предмет, стороны, суд, стадия."
                    },
                    facts: {
                      type: "string",
                      description: "Структурированный текст 10-25 пунктов: участники, хронология, процессуальные решения по стадиям, что обжалуется, текущая стадия."
                    },
                    legal_question: {
                      type: "string",
                      description: "1-3 предложения: главный юридический вопрос на текущей стадии."
                    }
                  },
                  required: ["case_number", "description", "facts", "legal_question"]
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "extract_case_fields" } }
        },
      }
    );
    const aiData = bypassResult.data;

    // Try OpenAI-style tool_calls first
    let extractedFields: Record<string, string> | null = null;

    const choices = aiData.choices as Array<Record<string, unknown>> | undefined;
    const message = (choices?.[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    const tool_calls_arr = message?.tool_calls as Array<Record<string, unknown>> | undefined;
    const firstToolCall = tool_calls_arr?.[0] as Record<string, unknown> | undefined;
    const fnObj = firstToolCall?.function as Record<string, unknown> | undefined;

    if (fnObj && fnObj.name === "extract_case_fields") {
      extractedFields = JSON.parse(fnObj.arguments as string);
    }

    // Fallback: Gemini may return content as plain text/JSON when tool_choice isn't honoured
    if (!extractedFields && message?.content) {
      const raw = (message.content as string).trim();
      try {
        // Strip markdown fences if present
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed.case_number !== "undefined") {
          extractedFields = parsed;
        }
      } catch {
        console.warn("Could not parse AI content as JSON fallback");
      }
    }

    if (!extractedFields) {
      console.error("Unexpected AI response structure:", JSON.stringify(aiData).slice(0, 500));
      throw new Error("Unexpected AI response format");
    }
    console.log("Extracted fields:", extractedFields);

    const updateData: Record<string, unknown> = {
      facts: extractedFields.facts,
      legal_question: extractedFields.legal_question,
      updated_at: new Date().toISOString()
    };

    if (extractedFields.case_number && extractedFields.case_number.trim()) {
      updateData.case_number = extractedFields.case_number.trim();
    }

    if (extractedFields.description && extractedFields.description.trim()) {
      updateData.description = extractedFields.description.trim();
    }

    const { error: updateError } = await supabase
      .from("cases")
      .update(updateData)
      .eq("id", caseId);

    if (updateError) throw new Error(`Failed to update case: ${updateError.message}`);

    console.log("Case updated successfully");

    return new Response(
      JSON.stringify({
        success: true,
        case_number: extractedFields.case_number || null,
        description: extractedFields.description || null,
        facts: extractedFields.facts,
        legal_question: extractedFields.legal_question
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in extract-case-fields:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
