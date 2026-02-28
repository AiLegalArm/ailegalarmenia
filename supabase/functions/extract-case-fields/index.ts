import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { FIELD_EXTRACTION, buildModelParams } from "../_shared/model-config.ts";
import { handleCors } from "../_shared/edge-security.ts";

const SYSTEM_PROMPT = [
  "\u0534\u0578\u0582 AI LEGAL ARMENIA \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0561\u0562\u0561\u0576 \u0565\u057D \u0540\u0561\u0575\u0561\u057D\u057F\u0561\u0576\u056B \u0540\u0561\u0576\u0580\u0561\u057A\u0565\u057F\u0578\u0582\u0569\u0575\u0561\u0576 \u0563\u0578\u0580\u056E\u0565\u0580\u056B \u0570\u0561\u0574\u0561\u0580\u055D",
  "",
  "\u0554\u0565\u0566 \u0576\u0565\u0580\u056F\u0561\u0575\u0561\u0581\u057E\u0561\u056E \u0567 \u0563\u0578\u0580\u056E\u056B \u0561\u0563\u0580\u0565\u0563\u0561\u0581\u057E\u0561\u056E \u057F\u0565\u0584\u057D\u057F\u0568 (\u0562\u0578\u056C\u0578\u0580 \u0586\u0561\u0575\u056C\u0565\u0580\u0568 + OCR)\u055D",
  "\u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0568 \u056F\u0561\u0580\u0578\u0572 \u0565\u0576 \u0568\u0576\u0564\u0563\u0580\u056F\u0565\u056C \u0574\u056B \u0584\u0561\u0576\u056B \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0583\u0578\u0582\u056C\u0565\u0580\u055D",
  "",
  "\u053D\u053B\u054D\u054F \u053F\u0531\u0546\u0548\u0546\u0546\u0535\u0550\u055D",
  "",
  "1) \u0549\u0570\u0578\u0580\u056B\u0576\u0565\u056C \u2014 \u0570\u0561\u0576\u0565\u056C \u0574\u056B\u0561\u0575\u0576 \u0561\u0575\u0576, \u056B\u0576\u0579 \u056F\u0561 \u0576\u0575\u0578\u0582\u0569\u0565\u0580\u0578\u0582\u0574\u055D",
  "2) \u0535\u0569\u0565 \u057F\u057E\u0575\u0561\u056C\u0576\u0565\u0580\u0568 \u0562\u0561\u057E\u0561\u0580\u0561\u0580 \u0579\u0565\u0576 \u2014 \u0576\u0577\u0565\u056C\u055D \u00AB[\u0532\u0531\u0551\u0531\u053F\u0531\u0545\u0548\u0552\u0544 \u0537 \u2014 \u0561\u0576\u0570\u0580\u0561\u056B\u0565\u0577\u057F \u0567 \u0571\u0565\u057C\u0584 \u0562\u0565\u0580\u0565\u056C]\u00BB\u055D",
  "3) PII (\u0570\u0561\u057D\u0581\u0565\u0576\u0565\u0580, \u0570\u0565\u057C\u0561\u056D\u0578\u057D\u0576\u0565\u0580, \u0561\u0576\u0571\u0576\u0561\u0563\u0580\u0565\u0580\u056B \u057F\u057E\u0575\u0561\u056C\u0576\u0565\u0580) \u0564\u056B\u0574\u0561\u056F\u0561\u057E\u0578\u0580\u0565\u056C \"***\"\u055D",
  "4) \u054A\u0531\u054F\u0531\u054D\u053D\u0531\u0546\u0538 \u054A\u053B\u054F\u053B \u053C\u053B\u0546\u053B \u0540\u0531\u0545\u0535\u0550\u0535\u0546\u054A\u053F\u055D",
  "",
  "facts \u2014 \u056F\u0561\u057C\u0578\u0582\u0581\u057E\u0561\u056E\u0584\u0561\u0575\u056B\u0576 \u057F\u0565\u0584\u057D\u057F 10\u201425 \u056F\u0565\u057F\u0565\u0580\u0578\u057E\u055D",
  "",
  "1) \u0534\u0565\u056C\u0568 (\u0561\u0576\u057E\u0561\u0576\u0578\u0582\u0574, \u057F\u0565\u057D\u0561\u056F, \u0564\u0561\u057F\u0561\u0580\u0561\u0576, \u0570\u0561\u0574\u0561\u0580)",
  "2) \u0544\u0561\u057D\u0576\u0561\u056F\u056B\u0581\u0576\u0565\u0580\u0568 (\u0570\u0561\u0575\u0581\u057E\u0578\u0580, \u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0578\u0572, \u0576\u0565\u0580\u056F\u0561\u0575\u0561\u0581\u0578\u0582\u0581\u056B\u0579\u0576\u0565\u0580)",
  "3) \u054E\u0565\u0573\u056B \u0561\u057C\u0561\u0580\u056F\u0561\u0576",
  "4) \u0553\u0561\u057D\u057F\u0561\u056F\u0561\u0576 \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580\u0568 \u0568\u057D\u057F \u0567\u0578\u0582\u0569\u0575\u0561\u0576",
  "5) \u053A\u0561\u0574\u0561\u0576\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0569\u057E\u0561\u056F\u0561\u0576\u0576\u0565\u0580\u0578\u057E (1-\u056B\u0576 \u0561\u057F\u0575\u0561\u0576 \u2192 \u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u2192 \u057E\u0573\u057C\u0561\u0562\u0565\u056F)",
  "6) \u053B\u0576\u0579 \u0567 \u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056F\u057E\u0578\u0582\u0574",
  "7) \u0538\u0576\u0569\u0561\u0581\u056B\u056F \u0583\u0578\u0582\u056C\u0568 (\u0578\u0580\u0578\u0577\u0565\u056C \u0568\u057D\u057F \u056F\u0561\u0576\u0578\u0576\u056B \u00AB\u0561\u0574\u0565\u0576\u0561\u0578\u0582\u0577 \u057F\u0561\u0580\u057E\u0561\u0576 \u0569\u057E\u0561\u056F\u0561\u0576\u0568\u00BB)",
  "",
  "\u0535\u0569\u0565 \u0576\u0575\u0578\u0582\u0569\u0565\u0580\u0568 \u0568\u0576\u0564\u0563\u0580\u056F\u0578\u0582\u0574 \u0565\u0576 \u0574\u056B \u0584\u0561\u0576\u056B \u0583\u0578\u0582\u056C\u0565\u0580 \u2014 \u0570\u057D\u057F\u0561\u056F\u0578\u0580\u0565\u0576 \u0569\u057E\u0561\u0580\u056F\u0565\u056C \u0564\u0580\u0561\u0576\u0584\u055D",
  "",
  "legal_question \u2014 1\u20143 \u0576\u0561\u056D\u0561\u0564\u0561\u057D\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u055D",
  "\u0533\u056C\u056D\u0561\u057E\u0578\u0580 \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581\u0568, \u0578\u0580\u0568 \u0584\u0576\u0576\u057E\u0578\u0582\u0574 \u0567 \u0568\u0576\u0569\u0561\u0581\u056B\u056F \u0583\u0578\u0582\u056C\u0578\u0582\u0574\u055D",
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

    // Get uploaded case files — include DOCX alongside PDF/images
    const SUPPORTED_FILE_TYPES = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const { data: caseFiles } = await supabase
      .from("case_files")
      .select("id, original_filename, storage_path, file_type")
      .eq("case_id", caseId)
      .is("deleted_at", null)
      .in("file_type", SUPPORTED_FILE_TYPES)
      .limit(5);

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
        text: `\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u056B\u0580 \u0570\u0565\u057F\u0587\u0575\u0561\u056C \u0563\u0578\u0580\u056E\u056B \u0576\u0575\u0578\u0582\u0569\u0565\u0580\u0568 \u0587 \u0570\u0561\u0576\u056B\u0580 facts \u0587 legal_question\u055D\n\n<<<CASE_START>>>\n${context}\n<<<CASE_END>>>`
      });
    }

    // Process uploaded files (PDF, image, DOCX)
    const hasTextContext = context.trim().length > 0;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const IMAGE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    if (caseFiles && caseFiles.length > 0) {
      for (const file of caseFiles) {
        try {
          const mimeType = file.file_type || "";
          const isImage = IMAGE_MIME_TYPES.includes(mimeType);
          const isPdf = mimeType === "application/pdf";
          const isDocx = mimeType === DOCX_MIME;

          // === DOCX: parse and inject text ===
          if (isDocx) {
            console.log(`Downloading DOCX from storage: ${file.storage_path}`);
            const { data: fileData, error: downloadError } = await supabase.storage
              .from("case-files")
              .download(file.storage_path);

            if (downloadError || !fileData) {
              console.warn(`Failed to download DOCX ${file.storage_path}: ${downloadError?.message}`);
              continue;
            }

            const arrayBuffer = await fileData.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            console.log(`DOCX downloaded: ${bytes.length} bytes`);

            try {
              const { parseDocx } = await import("../_shared/docx-parser.ts");
              const docxText = await parseDocx(bytes);
              const trimmed = docxText.substring(0, 12000);
              console.log(`DOCX parsed: ${trimmed.length} chars from ${file.original_filename}`);

              context += `\n\n=== DOCX DOCUMENT: ${file.original_filename} ===\n${trimmed}`;
              userMessageContent.push({
                type: "text",
                text: `\n\n=== DOCX DOCUMENT: ${file.original_filename} ===\n${trimmed}`
              });
            } catch (parseErr) {
              console.warn(`DOCX parse error for ${file.original_filename}:`, parseErr);
              context += `\n\n=== DOCX FILE (parse failed) ===\nFilename: ${file.original_filename}`;
            }
            continue;
          }

          // === PDF: note in context (cannot send as image_url) ===
          if (isPdf) {
            console.log(`PDF file noted (cannot send as image): ${file.original_filename}`);
            context += `\n\n=== UPLOADED PDF FILE ===\nFilename: ${file.original_filename}\n(PDF content \u2014 extract information from the case metadata and OCR results above)`;
            continue;
          }

          // === Images: send as vision ===
          if (!isImage) {
            console.warn(`Unsupported file type ${mimeType} for ${file.original_filename}, skipping`);
            continue;
          }

          console.log(`Downloading image from storage: ${file.storage_path}`);
          
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

          const { uint8ToBase64 } = await import("../_shared/base64.ts");
          const base64 = uint8ToBase64(bytes);
          const dataUrl = `data:${mimeType};base64,${base64}`;

          console.log(`Image ${file.original_filename} encoded (${Math.round(base64.length / 1024)}KB)`);

          if (!hasTextContext && userMessageContent.length === 0) {
            userMessageContent.push({
              type: "text",
              text: `\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u056B\u0580 \u0561\u0575\u057D \u057A\u0561\u057F\u056F\u0565\u0580\u0568 \u0587 \u0570\u0561\u0576\u056B\u0580 facts \u0587 legal_question: "${file.original_filename}"`
            });
          } else {
            userMessageContent.push({
              type: "text",
              text: `\n[\u054A\u0561\u057F\u056F\u0565\u0580: "${file.original_filename}"]`
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
          error: "No data available for extraction. Please add a case description or upload PDF/image/DOCX documents first."
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
        timeoutMs: 120000,
        extraBody: {
          tools: [
            {
              type: "function",
              function: {
                name: "extract_case_fields",
                description: "\u0540\u0561\u0576\u0565\u056C facts \u0587 legal_question \u0563\u0578\u0580\u056E\u056B \u0576\u0575\u0578\u0582\u0569\u0565\u0580\u056B\u0581 (\u0570\u0561\u0575\u0565\u0580\u0565\u0576\u0578\u057E)",
                parameters: {
                  type: "object",
                  properties: {
                    case_number: {
                      type: "string",
                      description: "\u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580\u0568, \u056B\u0576\u0579\u057A\u0565\u057D \u0576\u0577\u057E\u0561\u056E \u0567 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0578\u0582\u0574\u055D \u0534\u0561\u057F\u0561\u0580\u056F \u057F\u0578\u0572 \u0565\u0569\u0565 \u0579\u056B \u0563\u057F\u0576\u057E\u0565\u056C\u055D"
                    },
                    description: {
                      type: "string",
                      description: "\u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u057C\u0578\u057F \u0576\u056F\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 3\u20145 \u0576\u0561\u056D\u0561\u0564\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0574\u0562\u055D \u0561\u057C\u0561\u0580\u056F\u0561, \u056F\u0578\u0572\u0574\u0565\u0580, \u0564\u0561\u057F\u0561\u0580\u0561\u0576, \u0583\u0578\u0582\u056C\u055D \u0540\u0531\u0545\u0535\u0550\u0535\u0546\u054A\u053F\u055D"
                    },
                    facts: {
                      type: "string",
                      description: "\u053F\u0561\u057C\u0578\u0582\u0581\u057E\u0561\u056E\u0584\u0561\u0575\u056B\u0576 \u057F\u0565\u0584\u057D\u057F 10\u201425 \u056F\u0565\u057F\u0565\u0580\u0578\u057E\u055D \u0574\u0561\u057D\u0576\u0561\u056F\u056B\u0581\u0576\u0565\u0580, \u056A\u0561\u0574\u0561\u0576\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576, \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0576\u0565\u0580 \u0568\u057D\u057F \u0583\u0578\u0582\u056C\u0565\u0580\u056B, \u056B\u0576\u0579 \u0567 \u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056F\u057E\u0578\u0582\u0574, \u0568\u0576\u0569\u0561\u0581\u056B\u056F \u0583\u0578\u0582\u056C\u0568\u055D \u0540\u0531\u0545\u0535\u0550\u0535\u0546\u054A\u053F\u055D"
                    },
                    legal_question: {
                      type: "string",
                      description: "1\u20143 \u0576\u0561\u056D\u0561\u0564\u0561\u057D\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u055D \u0563\u056C\u056D\u0561\u057E\u0578\u0580 \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581\u0568 \u0568\u0576\u0569\u0561\u0581\u056B\u056F \u0583\u0578\u0582\u056C\u0578\u0582\u0574\u055D \u0540\u0531\u0545\u0535\u0550\u0535\u0546\u054A\u053F\u055D"
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
