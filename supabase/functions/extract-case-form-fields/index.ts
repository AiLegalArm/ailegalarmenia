import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors } from "../_shared/edge-security.ts";

const COURTS_MAP: Record<string, string> = {
  "\u0544\u0549\u0535\u0534": "\u0544\u0561\u0580\u0564\u0578\u0582 \u056b\u0580\u0561\u057e\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056b \u0565\u057e\u0580\u043e\u043f\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576 (\u0544\u0549\u0535\u0534)",
  "\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576": "\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0573\u057c\u0561\u0562\u0565\u056f": "\u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056b\u0561\u056f\u0561\u0576": "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056b\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0580\u0565\u0561\u056f\u0561\u0576": "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u057e\u0561\u0580\u0579\u0561\u056f\u0561\u0576": "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u057e\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u0540\u0561\u056f\u0561\u056f\u0578\u057c\u0578\u0582\u057a\u0581\u056b\u0578\u0576": "\u0540\u0561\u056f\u0561\u056f\u0578\u057c\u0578\u0582\u057a\u0581\u056b\u0578\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576": "\u054e\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u0535\u0580\u0587\u0561\u0576": "\u0535\u0580\u0587\u0561\u0576 \u0584\u0561\u0572\u0561\u0584\u056b \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056b\u0580\u0561\u057e\u0561\u057d\u0578\u0582\u0569\u0575\u0561\u0576 \u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
};

const SYSTEM_PROMPT = `You are a Senior Legal Document Analyst specializing in Armenian law (RA). Perform DEEP PROFESSIONAL extraction from legal documents.

EXTRACTION PROTOCOL:

1. CASE NUMBER (\u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580):
   - Patterns: \u053F\u0534/1718/02/24, \u0535\u0531\u0534/1234/01/25, \u053F\u0534-1234-2024, XXXX/NN/NN
   - Also look for: \u00AB\u0563\u0578\u0580\u056E N\u00BB, \u00AB\u0563\u0578\u0580\u056E \u0569\u056B\u057E\u00BB, \u00AB\u0434\u0435\u043B\u043E N\u00BB
   - Return EXACT case number as written

2. TITLE: Short case title in Armenian (max 100 chars), include parties and charge type

3. DESCRIPTION: Professional legal summary (3-4 sentences) in Armenian:
   - Criminal charge / legal qualification (e.g., \u0540\u0540 \u0554\u0555 \u0570\u0578\u0564\u057E\u0561\u056E 104)
   - All parties: defendant, victim, investigative body
   - Court name and jurisdiction
   - Current procedural stage

4. CASE TYPE DETECTION:
   - \u00AB\u0584\u0580\u0565\u0561\u056F\u0561\u0576\u00BB / \u00AB\u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u00BB / \u00AB\u053F\u0534\u00BB = "criminal"
   - \u00AB\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576\u00BB / \u00AB\u0570\u0561\u0575\u0581\u00BB = "civil"
   - \u00AB\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576\u00BB = "administrative"
   - ECHR / \u00AB\u0415\u0421\u041F\u0427\u00BB / \u00AB\u0535\u054D\u054A\u054E\u00BB = "echr"

5. PARTY ROLE: Determine from document perspective:
   - Criminal: "defendant"|"defense"|"prosecutor"|"victim"
   - Civil: "claimant"|"defendant"|"third_party"
   - Administrative: "applicant"|"administrative_body"

6. COURT NAME: Full official Armenian name as found in the document

7. CURRENT STAGE: Determine from procedural context:
   - "preliminary" \u2014 investigation/pre-trial
   - "first_instance" \u2014 first court hearing
   - "appeal" \u2014 appeal stage
   - "cassation" \u2014 cassation stage
   - "echr" \u2014 ECHR proceedings

Return a JSON object with fields: case_number, title, description, case_type, party_role, court_name, current_stage.

CRITICAL RULES:
- Return ONLY valid JSON, no markdown fences
- If a field cannot be determined, return empty string ""
- case_type must be exactly one of: "criminal", "civil", "administrative", "echr"
- Read ALL pages thoroughly \u2014 do not skip any content
- Extract information from headers, footers, stamps, seals
- For scanned documents: read handwritten text carefully
- NEVER fabricate or guess \u2014 only extract what is present`;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data, error: authError } = await sb.auth.getClaims(token);
    if (authError || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { files } = await req.json();
    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No files provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build multimodal content
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: "Extract case information from the following documents:" }
    ];

    for (const file of files.slice(0, 5)) {
      const { name, mimeType, base64 } = file as { name: string; mimeType: string; base64: string };
      
      if (mimeType.startsWith("image/")) {
        userContent.push({
          type: "text",
          text: `\nDocument: "${name}"`
        });
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}` }
        });
      } else if (mimeType === "application/pdf") {
        // For PDFs, include as text context if small
        userContent.push({
          type: "text",
          text: `\nPDF document: "${name}" (analyze the content to extract case fields)`
        });
        userContent.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}` }
        });
      } else {
        // Text-based files
        try {
          const decoded = atob(base64);
          userContent.push({
            type: "text",
            text: `\nDocument "${name}":\n${decoded.slice(0, 10000)}`
          });
        } catch {
          console.warn(`Could not decode file ${name}`);
        }
      }
    }

    const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");

    const result = await callGatewayBypass(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ],
      {
        functionName: "extract-case-fields",
        bypassReason: "multimodal",
        timeoutMs: 120000,
      }
    );

    const aiData = result.data;
    const choices = aiData.choices as Array<Record<string, unknown>> | undefined;
    const message = (choices?.[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    const content = (message?.content as string || "").trim();

    let extracted: Record<string, string> = {};
    try {
      const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", content.slice(0, 300));
      return new Response(
        JSON.stringify({ success: false, error: "AI response parsing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize court_name to match known courts
    if (extracted.court_name) {
      const courtLower = extracted.court_name.toLowerCase();
      for (const [key, value] of Object.entries(COURTS_MAP)) {
        if (courtLower.includes(key.toLowerCase())) {
          extracted.court_name = value;
          break;
        }
      }
    }

    // Validate case_type
    const validTypes = ["criminal", "civil", "administrative", "echr"];
    if (!validTypes.includes(extracted.case_type || "")) {
      extracted.case_type = "criminal";
    }

    // Validate stage
    const validStages = ["preliminary", "first_instance", "appeal", "cassation", "echr"];
    if (!validStages.includes(extracted.current_stage || "")) {
      extracted.current_stage = "preliminary";
    }

    return new Response(
      JSON.stringify({ success: true, fields: extracted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in extract-case-form-fields:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
