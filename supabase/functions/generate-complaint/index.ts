import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callText } from "../_shared/openai-router.ts";

import { SYSTEM_PROMPT, COURT_INSTRUCTIONS, LANGUAGE_INSTRUCTIONS } from "./prompts/index.ts";
import { validateRequest } from "./validators.ts";
import { dualSearch } from "../_shared/rag-search.ts";
import { parseReferencesText, buildUserSourcesBlock } from "../_shared/reference-sources.ts";
import { buildSearchQuery, mapCourtTypeToPracticeCategory } from "./rag-search.ts";
import { redactForLog } from "../_shared/pii-redactor.ts";
import { log, err } from "../_shared/safe-logger.ts";

// =============================================================================
// CORS HEADERS (wildcard for browser compatibility)
// =============================================================================

import { handleCors } from "../_shared/edge-security.ts";

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  // === CORS via centralized handler ===
  const corsResult = handleCors(req);
  if (corsResult.errorResponse) return corsResult.errorResponse;
  const corsHeaders = corsResult.corsHeaders!;

  try {
    // === AUTH GUARD (Audit Fix: Stage 2/5 — Critical) ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // === END AUTH GUARD ===

    // === RATE LIMITING (P0) ===
    const supabaseServiceUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseServiceUrl, supabaseServiceRoleKey);
    const { checkRateLimits } = await import("../_shared/rate-limiter.ts");
    const rateCheck = await checkRateLimits(serviceClient, user.id, "generate-complaint");
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateCheck.reason, message: rateCheck.message, retry_after_seconds: rateCheck.reason === "hourly_limit_exceeded" ? 3600 : undefined }),
        { status: rateCheck.status || 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // === END RATE LIMITING ===

    const body = await req.json();
    const request = validateRequest(body);
    const anonymize = body.anonymize === true;
    const referencesText: string = typeof body.referencesText === "string" ? body.referencesText : "";

    // === FIX 1 (P0): Resolve referenceDate for temporal RAG ===
    let referenceDate: string | null = null;
    const rawCaseDate = typeof body.caseDate === "string" ? body.caseDate.trim() : "";
    if (rawCaseDate && /^\d{4}-\d{2}-\d{2}/.test(rawCaseDate)) {
      referenceDate = rawCaseDate.substring(0, 10);
    }
    const bodyCaseId = typeof body.caseId === "string" ? body.caseId : null;
    if (!referenceDate && bodyCaseId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const lookupClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      });
      const { data: dateRow } = await lookupClient
        .from("cases")
        .select("court_date")
        .eq("id", bodyCaseId)
        .maybeSingle();
      if (dateRow?.court_date) {
        referenceDate = String(dateRow.court_date).substring(0, 10);
      }
    }
    if (!referenceDate) {
      return new Response(
        JSON.stringify({
          error: "referenceDate_required",
          message: "caseDate or caseId (with cases.court_date) is required for temporal legal retrieval",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    log("generate-complaint", "Resolved referenceDate", { referenceDate });

    // Parse user-selected sources (optional)
    let userSourcesBlock = "";
    if (referencesText.trim()) {
      const { refs } = parseReferencesText(referencesText);
      const capped = refs.slice(0, 10);
      userSourcesBlock = buildUserSourcesBlock(capped);
      if (refs.length > 10) {
        userSourcesBlock += "\nNOTE: Only first 10 of " + refs.length + " user-selected sources included due to token budget.\n";
      }
      log("generate-complaint", "User sources parsed", { count: capped.length, total: refs.length });
    }

    // Search Knowledge Base for relevant legal context
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    
    let kbContext = "";
    let legalPracticeContext = "";

    // ─── Precedent Guard: structured precedent registry ───
    interface RetrievedPrecedent {
      id: string;
      court_type: string;
      title: string;
      decision_date: string | null;
      source_name: string | null;
      quotes: string[];           // max 2, each ≤300 chars
    }
    let retrievedPrecedents: RetrievedPrecedent[] = [];
    
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const searchTerms = buildSearchQuery(request.courtType, request.category);
      const practiceCategory = mapCourtTypeToPracticeCategory(request.courtType);
      
      const rag = await dualSearch({
        supabase,
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_SERVICE_KEY,
        query: searchTerms.join(' '),
        category: practiceCategory,
        referenceDate,
        kbLimit: 5,
        practiceLimit: 3,
        kbSnippetLength: 2500,
        fullPracticeText: false,
      });
      
      kbContext = rag.kbContext;
      legalPracticeContext = rag.practiceContext;

      // Build structured precedent list from practice results (max 6)
      // SAFETY: only include precedents that have at least one usable quote
      retrievedPrecedents = (rag.practiceResults || []).slice(0, 5).map((r) => {
        const fullText = r.content_text || r.content_snippet || r.legal_reasoning_summary || "";
        const sentences = fullText
          .split(/(?<=[.!?\u0589\u0964])\s+/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length >= 30 && s.length <= 300);
        const quotes = sentences.slice(0, 2);

        return {
          id: r.id,
          court_type: r.court_type || "unknown",
          title: r.title,
          decision_date: r.decision_date || null,
          source_name: r.court_name || null,
          quotes,
        };
      }).filter((p) => p.quotes.length > 0);
      
      log("generate-complaint", "RAG context", {
        kbLen: kbContext.length,
        practiceLen: legalPracticeContext.length,
        precedentsFound: retrievedPrecedents.length,
      });
    }

    // Compose the full prompt
    const courtInstruction = COURT_INSTRUCTIONS[request.courtType] || '';
    const languageInstruction = LANGUAGE_INSTRUCTIONS[request.language] || LANGUAGE_INSTRUCTIONS.hy;

    // ─── Build Precedent Guard block ───
    let precedentGuardBlock: string;
    if (retrievedPrecedents.length > 0) {
      const entries = retrievedPrecedents.map((p, i) => {
        const quotesBlock = p.quotes.map((q, qi) => `  Quote ${qi + 1}: "${q}"`).join("\n");
        return `${i + 1}. [ID: ${p.id}] ${p.title}\n   Court: ${p.court_type}\n${quotesBlock}`;
      }).join("\n\n");

      precedentGuardBlock = `
=== PRECEDENT GUARD (MANDATORY — SINGLE SOURCE OF TRUTH) ===
RETRIEVED_PRECEDENTS (${retrievedPrecedents.length} found):

${entries}

STRICT RULES:
1. You may ONLY cite precedents listed above under RETRIEVED_PRECEDENTS.
2. For each cited precedent you MUST include: title, court type, and 1-2 short quotes (<=300 chars) taken VERBATIM from the quotes listed above.
3. PARAPHRASING IS FORBIDDEN. If you cannot use a verbatim quote from above, you MUST NOT cite that precedent.
4. Do NOT invent, fabricate, or hallucinate ANY case names, numbers, dates, or quotes not present above.
5. Maximum precedents to cite: 6. Maximum quotes per precedent: 2.
6. The "ANALOGOUS COURT PRACTICE" section below (if present) is NON-CITABLE background context only. You MUST NOT extract case names, numbers, or quotes from it. Citations MUST come exclusively from RETRIEVED_PRECEDENTS above.
7. At the END of your output, include a deterministic section:
   --- PRECEDENTS CITED ---
   [List only the IDs of precedents you actually cited, one per line, e.g.: "ID: <uuid>"]
   If none cited, output: "NONE"
   --- END PRECEDENTS CITED ---
=== END PRECEDENT GUARD ===`;
    } else {
      precedentGuardBlock = `
=== PRECEDENT GUARD (MANDATORY — SINGLE SOURCE OF TRUTH) ===
RETRIEVED_PRECEDENTS: NONE FOUND.
You MUST NOT cite any court precedents (Cassation or ECHR).
Instead, include a "KB GAP NOTICE" section explaining that no relevant precedents were found in the knowledge base.
Do NOT invent any case names, numbers, dates, or quotes.
At the END of your output, include:
--- PRECEDENTS CITED ---
NONE
--- END PRECEDENTS CITED ---
=== END PRECEDENT GUARD ===`;
    }

    const userPrompt = `${courtInstruction}

${languageInstruction}

---

COMPLAINT TYPE: ${request.complaintType}
CATEGORY: ${request.category}
COURT: ${request.courtType.toUpperCase()}

---

UPLOADED DOCUMENT CONTENT (extracted text for analysis):

${request.extractedText}

---

${kbContext ? `RELEVANT LEGAL SOURCES FROM KNOWLEDGE BASE:

${kbContext}

---` : 'No relevant sources found in Knowledge Base.'}

${legalPracticeContext ? `ANALOGOUS COURT PRACTICE (NON-CITABLE BACKGROUND — for argumentation patterns only, NOT for direct citation):

${legalPracticeContext}

NOTE: The above section is supplementary context. Do NOT cite case names, numbers, or quotes from this section. All citations MUST come from the RETRIEVED_PRECEDENTS registry in the PRECEDENT GUARD block.

---` : ''}

${precedentGuardBlock}

${userSourcesBlock}

Based on the above document content, legal sources, and analogous court practice, draft a complete judicial complaint ready for filing.

Follow the strict template structure. If critical information is missing, state what is needed before drafting.
Use the court practice examples above to strengthen legal argumentation with relevant precedents.
${userSourcesBlock ? "When user-selected sources are provided, you MUST cite them by docId and chunkIndex in your analysis.\n" : ""}REMINDER: Only cite precedents from the RETRIEVED_PRECEDENTS list above. Paraphrasing is forbidden — use verbatim quotes only. Any citation not traceable to that list is a violation. End your output with the "PRECEDENTS CITED" section.`;

    log("generate-complaint", "Generating complaint", { courtType: request.courtType, language: request.language, textLen: request.extractedText.length });

    // Use centralized OpenAI router — no direct fetch calls allowed
    const routerResult = await callText(
      "generate-complaint",
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      { timeoutMs: 280000 }
    );
    let generatedContent = routerResult.text;

    // Optional: redact PII from AI output when user requests anonymized draft
    if (anonymize && generatedContent) {
      const { redactAIOutput } = await import("../_shared/pii-redactor.ts");
      generatedContent = redactAIOutput(generatedContent);
      log("generate-complaint", "Anonymized output");
    }

    log("generate-complaint", "Complaint generated", { len: generatedContent.length });

    // === PRECEDENT GUARD: Runtime Validator ===
    const allowedIds = new Set(retrievedPrecedents.map((p) => p.id));
    const citedBlockMatch = generatedContent.match(
      /---\s*PRECEDENTS CITED\s*---\s*([\s\S]*?)\s*---\s*END PRECEDENTS CITED\s*---/i
    );

    let citedIds: string[] = [];
    if (citedBlockMatch) {
      const blockContent = citedBlockMatch[1].trim();
      if (blockContent.toUpperCase() !== "NONE") {
        // Extract IDs — supports "ID: <uuid>" lines
        citedIds = [...blockContent.matchAll(/ID:\s*([0-9a-f-]{36})/gi)].map((m) => m[1]);
      }
    }

    // Validate: every cited ID must be in the allowed set, and count <= 6
    const invalidIds = citedIds.filter((id) => !allowedIds.has(id));
    if (invalidIds.length > 0 || citedIds.length > 6) {
      err("generate-complaint", "PRECEDENT_GUARD_VIOLATION", undefined, {
        citedIds,
        invalidIds,
        allowedIds: [...allowedIds],
        count: citedIds.length,
      });
      return new Response(
        JSON.stringify({
          error: "PRECEDENT_GUARD_VIOLATION",
          details: {
            citedIds,
            allowedIds: [...allowedIds],
            invalidIds,
            message: "AI output cited precedents not in the retrieved registry. Content withheld.",
          },
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // === END PRECEDENT GUARD VALIDATOR ===

    return new Response(
      JSON.stringify({ 
        content: generatedContent,
        tokensUsed: routerResult.usage?.total_tokens || 0,
        courtType: request.courtType,
        category: request.category,
        ragSourcesUsed: kbContext.length > 0 || legalPracticeContext.length > 0,
        legalPracticeUsed: legalPracticeContext.length > 0,
        anonymized: anonymize,
        retrievedPrecedents: retrievedPrecedents.map((p) => ({
          id: p.id,
          court_type: p.court_type,
          title: p.title,
          quotes: p.quotes,
        })),
        precedentCount: retrievedPrecedents.length,
        citedPrecedentIds: citedIds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    err("generate-complaint", "Unhandled error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
