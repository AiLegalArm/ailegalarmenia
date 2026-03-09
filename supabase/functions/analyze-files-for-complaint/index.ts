import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// model-config import removed — all AI calls routed via openai-router.ts (callText)
import { handleCors } from "../_shared/edge-security.ts";

interface AnalyzeRequest {
  files: Array<{
    name: string;
    content: string; // base64 data URL or text content
    type: string;
  }>;
  caseData?: {
    title?: string;
    case_number?: string;
    case_type?: string;
    court?: string;
    facts?: string;
    description?: string;
  };
  documentType: string; // appeal, cassation, etc.
  language: string;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    // === AUTH GUARD (Prevent Anonymous Access) ===
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

    const body: AnalyzeRequest = await req.json();
    const { files, caseData, documentType, language } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!files || files.length === 0) {
      throw new Error("No files provided for analysis");
    }

    console.log(`Analyzing ${files.length} files for ${documentType} in ${language}`);

    // Build messages array for multimodal AI
    const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [];

    // System prompt for document analysis
    const systemPrompt = getSystemPrompt(language, documentType);
    messages.push({ role: "system", content: systemPrompt });

    // User message with all files
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    
    // Add case context if available
    if (caseData) {
      userContent.push({
        type: "text",
        text: buildCaseContext(caseData, language)
      });
    }

    // Add instruction
    userContent.push({
      type: "text",
      text: getAnalysisInstruction(language, documentType, files.length)
    });

    // Add files as images or text
    for (const file of files) {
      const isImage = file.type.startsWith('image/') || 
                      file.content.startsWith('data:image/');
      const isPdf = file.type === 'application/pdf' || 
                    file.content.startsWith('data:application/pdf');
      
      if (isImage) {
        // Add image directly for vision analysis
        userContent.push({
          type: "image_url",
          image_url: {
            url: file.content,
            detail: "high"
          }
        });
        userContent.push({
          type: "text",
          text: `[Above image is from file: ${file.name}]`
        });
      } else if (isPdf) {
        // For PDFs, extract text first using OCR if needed
        // For now, note that it's a PDF and ask AI to read it
        userContent.push({
          type: "image_url",
          image_url: {
            url: file.content,
            detail: "high"
          }
        });
        userContent.push({
          type: "text",
          text: `[Above is PDF document: ${file.name}. Analyze all pages and extract key legal information.]`
        });
      } else {
        // Text content - decode if base64
        let textContent = file.content;
        if (file.content.startsWith('data:')) {
          const base64Part = file.content.split(',')[1];
          if (base64Part) {
            try {
              textContent = atob(base64Part);
            } catch {
              textContent = file.content;
            }
          }
        }
        userContent.push({
          type: "text",
          text: `--- Document: ${file.name} ---\n${textContent.slice(0, 50000)}`
        });
      }
    }

    messages.push({ role: "user", content: userContent });

    // Route via centralized OpenAI router
    const { callText } = await import("../_shared/openai-router.ts");

    let analysis: string;
    try {
      const result = await callText("analyze-files-for-complaint", messages as import("../_shared/openai-router.ts").RouterMessage[]);
      analysis = result.text;
      console.log("Analysis complete, length:", analysis.length, "model:", result.model_used);
    } catch (routerErr) {
      const status = (routerErr as { status?: number })?.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("AI router error:", routerErr);
      throw new Error(`AI router error: ${String(routerErr)}`);
    }

    return new Response(
      JSON.stringify({
        analysis,
        filesAnalyzed: files.length,
        tokensUsed: data.usage?.total_tokens || 0
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("File analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getSystemPrompt(language: string, documentType: string): string {
  const docTypeMap: Record<string, Record<string, string>> = {
    appeal: {
      hy: "\u0531\u057A\u0565\u056C\u0575\u0561\u0581\u056B\u0578\u0576 \u0562\u0578\u0572\u0578\u0584",
      ru: "\u0410\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430",
      en: "Appeal complaint"
    },
    cassation: {
      hy: "\u054E\u0573\u057C\u0561\u0575\u056B\u0576 \u0562\u0578\u0572\u0578\u0584",
      ru: "\u041A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0436\u0430\u043B\u043E\u0431\u0430",
      en: "Cassation complaint"
    }
  };
  
  const docName = docTypeMap[documentType]?.[language] || documentType;

  if (language === 'hy') {
    return `\u0534\u0578\u0582\u0584 \u0570\u0561\u0575 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u056B \u0574\u0561\u057D\u0576\u0561\u0563\u0565\u057F \u0565\u0584\u0589 \u0531\u0576\u0561\u056C\u056B\u0566\u0565\u056C \u0562\u0578\u056C\u0578\u0580 \u0576\u0565\u0580\u056F\u0561\u0575\u0561\u0581\u057E\u0561\u056E \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0568 \u0587 \u057A\u0561\u057F\u0580\u0561\u057D\u057F\u0565\u056C \u056F\u0561\u057C\u0578\u0582\u0581\u057E\u0561\u056E\u0584\u0561\u0575\u056B\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576 ${docName}-\u056B \u0570\u0561\u0574\u0561\u0580\u0589

\u0554\u0548 \u0531\u054C\u0531\u054B\u0531\u0534\u0550\u0531\u0546\u0554\u0546\u0535\u0550:
1. \u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u056B \u056F\u0561\u057C\u0578\u0582\u0581\u057E\u0561\u056E\u0584\u0561\u0575\u056B\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576 (facts, circumstances, dates, parties)
2. \u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0568 \u0587 \u0564\u0580\u0561 \u0569\u0578\u0582\u0575\u056C \u056F\u0578\u0572\u0574\u0565\u0580\u0568 (\u0565\u0569\u0565 \u056F\u0561\u0576)
3. \u0540\u0561\u0575\u057F\u0576\u0561\u0562\u0565\u0580\u057E\u0561\u056E \u0585\u0580\u0565\u0576\u057D\u0564\u0580\u0561\u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580\u0568 (\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576, \u0566\u0561\u0576\u0563\u057E\u0561\u056E\u0561\u0575\u056B\u0576 \u0585\u0580\u0565\u0576\u0584\u0576\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580)
4. \u0548\u0580\u0578\u0577\u0574\u0561\u0576 \u0569\u0578\u0582\u0575\u056C \u056F\u0578\u0572\u0574\u0565\u0580 (wrong legal provisions, procedural violations)
5. \u0556\u0561\u057D\u057F\u0565\u0580\u056B \u0570\u056B\u0574\u0576\u0561\u057E\u0578\u0580\u0578\u0582\u0574\u0576\u0565\u0580 (\u0565\u0569\u0565 \u056F\u0561\u0576)

\u054A\u0531\u054F\u0531\u054D\u053D\u0531\u0546\u0535\u0554 \u0548\u0552\u053F\u0539\u0548\u054C\u0538 \u0540\u0531\u0545\u0535\u0550\u0535\u0546\u0548\u054E\u0589`;
  }
  
  if (language === 'ru') {
    return `\u0412\u044B \u044D\u043A\u0441\u043F\u0435\u0440\u0442 \u043F\u043E \u0430\u0440\u043C\u044F\u043D\u0441\u043A\u0438\u043C \u043F\u0440\u0430\u0432\u043E\u0432\u044B\u043C \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u043C. \u041F\u0440\u043E\u0430\u043D\u0430\u043B\u0438\u0437\u0438\u0440\u0443\u0439\u0442\u0435 \u0432\u0441\u0435 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u044B \u0438 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u044C\u0442\u0435 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0434\u043B\u044F \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u044F ${docName}.

\u0412\u0410\u0428\u0418 \u0417\u0410\u0414\u0410\u0427\u0418:
1. \u0421\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0444\u0430\u043A\u0442\u043E\u0432 \u0434\u0435\u043B\u0430 (\u0444\u0430\u043A\u0442\u044B, \u043E\u0431\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430, \u0434\u0430\u0442\u044B, \u0441\u0442\u043E\u0440\u043E\u043D\u044B)
2. \u0421\u0443\u0434\u0435\u0431\u043D\u043E\u0435 \u0440\u0435\u0448\u0435\u043D\u0438\u0435 \u0438 \u0435\u0433\u043E \u0441\u043B\u0430\u0431\u044B\u0435 \u0441\u0442\u043E\u0440\u043E\u043D\u044B (\u0435\u0441\u043B\u0438 \u0435\u0441\u0442\u044C)
3. \u0412\u044B\u044F\u0432\u043B\u0435\u043D\u043D\u044B\u0435 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u0437\u0430\u043A\u043E\u043D\u0430 (\u041A\u043E\u043D\u0441\u0442\u0438\u0442\u0443\u0446\u0438\u044F \u0420\u0410, \u043C\u0430\u0442\u0435\u0440\u0438\u0430\u043B\u044C\u043D\u043E\u0435 \u0438 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0443\u0430\u043B\u044C\u043D\u043E\u0435 \u043F\u0440\u0430\u0432\u043E)
4. \u041E\u0448\u0438\u0431\u043A\u0438 \u0432 \u0440\u0435\u0448\u0435\u043D\u0438\u0438 (\u043D\u0435\u043F\u0440\u0430\u0432\u0438\u043B\u044C\u043D\u043E\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u043D\u043E\u0440\u043C, \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0443\u0430\u043B\u044C\u043D\u044B\u0435 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F)
5. \u0410\u0440\u0433\u0443\u043C\u0435\u043D\u0442\u044B \u0437\u0430\u0449\u0438\u0442\u044B (\u0435\u0441\u043B\u0438 \u0435\u0441\u0442\u044C)

\u041E\u0422\u0412\u0415\u0427\u0410\u0419\u0422\u0415 \u0422\u041E\u041B\u042C\u041A\u041E \u041D\u0410 \u0420\u0423\u0421\u0421\u041A\u041E\u041C \u042F\u0417\u042B\u041A\u0415.`;
  }
  
  return `You are an expert in Armenian legal documents. Analyze all provided documents and prepare a structured analysis for drafting a ${docName}.

YOUR TASKS:
1. Structured analysis of case facts (facts, circumstances, dates, parties)
2. Court decision and its weaknesses (if available)
3. Identified legal violations (Constitution of RA, substantive and procedural law)
4. Errors in the decision (wrong application of norms, procedural violations)
5. Defense arguments (if available)

RESPOND ONLY IN ENGLISH.`;
}

function buildCaseContext(caseData: { title?: string; case_number?: string; case_type?: string; court?: string; facts?: string; description?: string }, language: string): string {
  if (language === 'ru') {
    return `\u0414\u0410\u041D\u041D\u042B\u0415 \u0414\u0415\u041B\u0410:
\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435: ${caseData.title || '\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E'}
\u041D\u043E\u043C\u0435\u0440 \u0434\u0435\u043B\u0430: ${caseData.case_number || '\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D'}
\u0422\u0438\u043F: ${caseData.case_type || '\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D'}
\u0421\u0443\u0434: ${caseData.court || '\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D'}
\u0424\u0430\u043A\u0442\u044B: ${caseData.facts || '\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u044B'}
\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435: ${caseData.description || '\u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D\u043E'}`;
  }
  
  if (language === 'hy') {
    return `\u0533\u0548\u0550\u053E\u0538 \u054F\u054E\u0545\u0531\u053C\u0546\u0535\u0550:
\u054E\u0565\u0580\u0576\u0561\u0563\u056B\u0580: ${caseData.title || '\u0576\u0577\u057E\u0561\u056E \u0579\u0567'}
\u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580: ${caseData.case_number || '\u0576\u0577\u057E\u0561\u056E \u0579\u0567'}
\u054F\u0565\u057D\u0561\u056F: ${caseData.case_type || '\u0576\u0577\u057E\u0561\u056E \u0579\u0567'}
\u0534\u0561\u057F\u0561\u0580\u0561\u0576: ${caseData.court || '\u0576\u0577\u057E\u0561\u056E \u0579\u0567'}
\u0553\u0561\u057D\u057F\u0565\u0580: ${caseData.facts || '\u0576\u0577\u057E\u0561\u056E \u0579\u0565\u0576'}
\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576: ${caseData.description || '\u0576\u0577\u057E\u0561\u056E \u0579\u0567'}`;
  }

  return `CASE DATA:
Title: ${caseData.title || 'not specified'}
Case Number: ${caseData.case_number || 'not specified'}
Type: ${caseData.case_type || 'not specified'}
Court: ${caseData.court || 'not specified'}
Facts: ${caseData.facts || 'not provided'}
Description: ${caseData.description || 'not provided'}`;
}

function getAnalysisInstruction(language: string, documentType: string, fileCount: number): string {
  if (language === 'ru') {
    return `\u041F\u0420\u041E\u0410\u041D\u0410\u041B\u0418\u0417\u0418\u0420\u0423\u0419\u0422\u0415 ${fileCount} \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442(\u043E\u0432) \u0438 \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u044C\u0442\u0435 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0434\u043B\u044F \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u044F ${documentType === 'appeal' ? '\u0430\u043F\u0435\u043B\u043B\u044F\u0446\u0438\u043E\u043D\u043D\u043E\u0439 \u0436\u0430\u043B\u043E\u0431\u044B' : '\u043A\u0430\u0441\u0441\u0430\u0446\u0438\u043E\u043D\u043D\u043E\u0439 \u0436\u0430\u043B\u043E\u0431\u044B'}.

\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435:
1. \u0424\u0410\u041A\u0422\u042B \u0414\u0415\u041B\u0410: \u043A\u043B\u044E\u0447\u0435\u0432\u044B\u0435 \u043E\u0431\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430, \u0434\u0430\u0442\u044B, \u0441\u0442\u043E\u0440\u043E\u043D\u044B
2. \u0420\u0415\u0428\u0415\u041D\u0418\u0415 \u0421\u0423\u0414\u0410: \u0441\u0443\u0442\u044C \u0440\u0435\u0448\u0435\u043D\u0438\u044F, \u0440\u0435\u0437\u043E\u043B\u044E\u0442\u0438\u0432\u043D\u0430\u044F \u0447\u0430\u0441\u0442\u044C
3. \u041D\u0410\u0420\u0423\u0428\u0415\u041D\u0418\u042F: \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0435 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0438\u044F \u0437\u0430\u043A\u043E\u043D\u0430 \u0441\u043E \u0441\u0441\u044B\u043B\u043A\u0430\u043C\u0438 \u043D\u0430 \u0441\u0442\u0430\u0442\u044C\u0438
4. \u0410\u0420\u0413\u0423\u041C\u0415\u041D\u0422\u042B: \u043E\u0441\u043D\u043E\u0432\u0430\u043D\u0438\u044F \u0434\u043B\u044F \u043E\u0442\u043C\u0435\u043D\u044B/\u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0440\u0435\u0448\u0435\u043D\u0438\u044F
5. \u0422\u0420\u0415\u0411\u041E\u0412\u0410\u041D\u0418\u042F: \u0447\u0442\u043E \u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0443 \u0432\u044B\u0448\u0435\u0441\u0442\u043E\u044F\u0449\u0435\u0433\u043E \u0441\u0443\u0434\u0430

\u042D\u0442\u043E\u0442 \u0430\u043D\u0430\u043B\u0438\u0437 \u0431\u0443\u0434\u0435\u0442 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D \u0434\u043B\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0436\u0430\u043B\u043E\u0431\u044B.`;
  }
  
  if (language === 'hy') {
    return `\u054E\u0535\u0550\u053C\u0548\u0552\u0535\u0554 ${fileCount} \u0586\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569(\u0565\u0580) \u0587 \u057A\u0561\u057F\u0580\u0561\u057D\u057F\u0565\u0584 \u056F\u0561\u057C\u0578\u0582\u0581\u057E\u0561\u056E\u0584\u0561\u0575\u056B\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576 ${documentType === 'appeal' ? '\u0561\u057A\u0565\u056C\u0575\u0561\u0581\u056B\u0578\u0576 \u0562\u0578\u0572\u0578\u0584\u056B' : '\u057E\u0573\u057C\u0561\u0575\u056B\u0576 \u0562\u0578\u0572\u0578\u0584\u056B'} \u0570\u0561\u0574\u0561\u0580\u0589

\u0546\u0565\u0580\u0561\u057C\u0565\u0584\u055D
1. \u0533\u0548\u0550\u053E\u0538 \u0553\u0531\u054D\u054F\u0535\u0550: \u0570\u056B\u0574\u0576\u0561\u056F\u0561\u0576 \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580, \u0561\u0574\u057D\u0561\u0569\u057E\u0565\u0580, \u056F\u0578\u0572\u0574\u0565\u0580
2. \u0534\u0531\u054F\u0531\u054E\u0539\u0548\u053C: \u0578\u0580\u0578\u0577\u0574\u0561\u0576 \u0567\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568, \u0565\u0566\u0580\u0561\u0563\u056B\u0580 \u0574\u0561\u057D\u0568
3. \u053D\u0531\u053D\u054F\u0548\u0552\u0544\u0546\u0535\u0550: \u0585\u0580\u0565\u0576\u0584\u056B \u056F\u0578\u0576\u056F\u0580\u0565\u057F \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580 \u0570\u0578\u0564\u057E\u0561\u056E\u0576\u0565\u0580\u0578\u057E
4. \u0553\u0531\u054D\u054F\u0531\u0550\u053F\u0546\u0535\u0550: \u0578\u0580\u0578\u0577\u0574\u0561\u0576 \u0562\u0565\u056F\u0561\u0576\u0574\u0561\u0576/\u0583\u0578\u0583\u0578\u056D\u0574\u0561\u0576 \u0570\u056B\u0574\u0584\u0565\u0580
5. \u054A\u0531\u0540\u0531\u0546\u054B\u0546\u0535\u0550: \u056B\u0576\u0579 \u056D\u0576\u0564\u0580\u0565\u056C \u057E\u0565\u0580\u0561\u0564\u0561\u057D \u0561\u057F\u0575\u0561\u0576\u056B\u0581

\u054D\u0561 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u056F\u0585\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u057E\u056B \u0562\u0578\u0572\u0578\u0584\u056B \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u0574\u0561\u0576 \u0570\u0561\u0574\u0561\u0580\u0589`;
  }

  return `ANALYZE ${fileCount} document(s) and prepare a structured analysis for drafting a ${documentType === 'appeal' ? 'appeal complaint' : 'cassation complaint'}.

Include:
1. CASE FACTS: key circumstances, dates, parties
2. COURT DECISION: essence of the decision, operative part
3. VIOLATIONS: specific legal violations with article references
4. ARGUMENTS: grounds for reversal/modification
5. DEMANDS: what to request from the higher court

This analysis will be used to generate the complaint.`;
}
