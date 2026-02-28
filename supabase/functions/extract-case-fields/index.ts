import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { FIELD_EXTRACTION, buildModelParams } from "../_shared/model-config.ts";
import { handleCors } from "../_shared/edge-security.ts";

const SYSTEM_PROMPT = `You are a Senior Legal Analyst specializing in Armenian criminal law (RA). Your task is to perform DEEP PROFESSIONAL extraction of all legally significant information from case materials.

EXTRACTION PROTOCOL — MANDATORY DEPTH REQUIREMENTS:

1. CASE NUMBER (Գործի համար):
   - Patterns: ԿԴ/1718/02/24, ԵԱԴ/1234/01/25, ԿԴ-1234-2024, XXXX/NN/NN
   - Also look for: «գործ N», «գործ թիվ», «дело N»
   - Return EXACT case number as written

2. DESCRIPTION (Նկարագրություն) — PROFESSIONAL LEGAL SUMMARY:
   - State the criminal charge / legal qualification (e.g., ՀՀ ՔՕ հոդված 104 — Սպանություն)
   - Identify all parties: կասկածյալ/մեղադրյալ, տուժող, վկաներ, հետաքննող մարմին
   - Court name and jurisdiction
   - Current procedural stage
   - Write 4-6 sentences in formal legal Armenian

3. FACTS (Փաստեր) — EXHAUSTIVE FACTUAL RECONSTRUCTION:
   - WHAT happened: precise criminal act, method (modus operandi), weapon/instrument
   - WHEN: exact date/time or estimated time of incident
   - WHERE: exact location, crime scene description
   - WHO: full identification of all known parties (names, roles, relationships)
   - HOW: sequence of events, cause of death/harm (if available)
   - Physical evidence available: forensic reports, autopsy (ՓՓԱ), CCTV, DNA, ballistics
   - Witness statements summary
   - Investigative actions taken
   - If information is ABSENT from materials — explicitly state: «[ԲԱՑԱԿԱՅՈՒՄ Է — անհրաժեշտ է ձեռք բերել]»

4. LEGAL QUESTION (Իրավաբանական հարց) — CRIMINAL LAW ANALYSIS:
   - Exact criminal qualification: article, part, subpart of RA Criminal Code
   - Elements of the crime that must be proven (corpus delicti): objective side, subjective side (intent/motive), subject, object
   - Aggravating/mitigating circumstances to examine
   - Admissibility issues for key evidence
   - Fair trial concerns (ՀՀ ՔԴՕ հոդվածներ)
   - List of investigative actions REQUIRED but not yet performed
   - Key legal questions for the defense/prosecution to resolve
   - Potential procedural violations to examine

CRITICAL RULES:
- ALWAYS respond in formal legal Armenian (Հայերեն)
- Use professional legal terminology throughout
- For MISSING data: write «[ԲԱՑԱԿԱՅՈՒՄ Է — անհրաժեշտ է ձեռք բերել]» — NEVER fabricate facts
- For homicide cases: ALWAYS include forensic evidence checklist, autopsy status, chain of custody
- Extract ALL available information — be thorough, not brief
- If PDF/image contains legal documents — read and extract every legally relevant detail`;


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
        text: `Extract case number, description, facts and legal question from the following case materials:\n${context}`
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
              text: `Extract case number, description, facts and legal question from this uploaded image: "${file.original_filename}"`
            });
          } else {
            userMessageContent.push({
              type: "text",
              text: `\nAlso analyze this uploaded image: "${file.original_filename}"`
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
                description: "Extract case number, description, facts and legal question from provided materials",
                parameters: {
                  type: "object",
                  properties: {
                    case_number: {
                      type: "string",
                      description: "Case number found in documents (exact format). Return empty string if not found."
                    },
                    description: {
                      type: "string",
                      description: "PROFESSIONAL legal summary in Armenian (4-6 sentences): criminal charge with RA Criminal Code article, all parties (defendant/victim/investigative body), court, procedural stage. Use formal legal terminology."
                    },
                    facts: {
                      type: "string",
                      description: "EXHAUSTIVE factual reconstruction in Armenian: (1) WHAT happened - crime type, method, weapon/instrument; (2) WHEN - exact date/time; (3) WHERE - location; (4) WHO - all parties with roles; (5) HOW - sequence of events; (6) evidence available: forensic/autopsy/CCTV/DNA/ballistics; (7) witness statements; (8) investigative actions taken. For MISSING data write: [\u0532\u0531\u0551\u0531KAYUM \u0538 \u2014 \u0561\u0576hrajesht e jerk berel]. Be thorough and exhaustive."
                    },
                    legal_question: {
                      type: "string",
                      description: "DEEP criminal law analysis in Armenian: (1) exact RA Criminal Code qualification (article/part/subpart); (2) corpus delicti elements to prove; (3) aggravating/mitigating circumstances; (4) evidence admissibility issues; (5) fair trial concerns per RA CPC; (6) list of required investigative actions not yet performed; (7) key defense/prosecution questions; (8) potential procedural violations. Professional legal language required."
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
