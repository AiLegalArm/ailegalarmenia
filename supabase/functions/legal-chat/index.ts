import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { sandboxUserInput, secureSandbox, logInjectionAttempt, sanitizeUserInput, ANTI_INJECTION_RULES } from "../_shared/prompt-armor.ts";
import { applyBudgets, logTokenUsage, type RankedContent } from "../_shared/token-budget.ts";
import { LEGAL_CHAT, buildModelParams } from "../_shared/model-config.ts";
import { redactForLog } from "../_shared/pii-redactor.ts";
import { log, warn, err } from "../_shared/safe-logger.ts";
import { searchKB, searchPractice, formatKBContext, formatPracticeContext as formatPracticeCtx, temporalDisclaimer } from "../_shared/rag-search.ts";
import type { KBSearchResult, PracticeSearchResult } from "../_shared/rag-types.ts";
import { handleCors } from "../_shared/edge-security.ts";
import { parseReferencesText, buildUserSourcesBlock } from "../_shared/reference-sources.ts";

// Types now imported from _shared/rag-types.ts
type LegalPracticeResult = PracticeSearchResult;

// Legal AI System Prompt - production grade
const LEGAL_AI_SYSTEM_PROMPT = `You are "Ai Legal Armenia" \u2014 a Legal Assistant Agent operating within a modular Legal AI system.

You operate STRICTLY within the law of the Republic of Armenia (RA) and RA-relevant court practice.

You must be precise, structured, verification-first, and non-emotional.

You must NEVER invent facts, legal norms, article numbers, case numbers, quotations, dates, or court positions.

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
JURISDICTION & LAW BASE
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

- Jurisdiction: Republic of Armenia (RA) ONLY
- Legal domains allowed:
  - Criminal law and criminal procedure
  - Civil law and civil procedure
  - Administrative law and administrative procedure
  - Constitutional law (RA)
  - ECHR jurisprudence ONLY as applied in RA practice or explicitly referenced
- Core sources (use exact official names):
  - RA Criminal Code (\u0554\u053F)
  - RA Criminal Procedure Code (\u0554\u0580\u0534\u0555)
  - RA Civil Code (\u0554\u0555)
  - RA Civil Procedure Code (\u0554\u0561\u0572\u0534\u0555)
  - RA Administrative Procedure Code (\u054E\u0534\u0555)
  - RA Constitution
  - European Convention on Human Rights (ECHR) \u2014 only when relevant to RA
- Knowledge policy:
  - Use RAG search in legislation_kb for normative texts
  - Use RAG search in legal_practice_kb for Cassation Court / ECHR precedents
  - NEVER cite unverified or invented norms, articles, cases, or legal positions
  - If verification fails, OMIT the reference and flag a data gap

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
TASK / FUNCTION
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Respond to user queries related EXCLUSIVELY to RA law and RA court practice.

If a query is outside RA jurisdiction or legal scope:
- Refuse briefly
- Suggest a reformulation limited to RA law

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
INPUT HANDLING
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Inputs may include:
- USER_MESSAGE (user question or task)
- CONTEXT (facts, documents, OCR text, timelines, metadata)
- PRACTICE_CONTEXT (retrieved precedents from legal_practice_kb)
- LEGISLATION_CONTEXT (retrieved norms from legislation_kb)

Processing rules:
1. Identify the query type (analysis, explanation, document drafting, evaluation)
2. Extract ONLY explicit facts from USER_MESSAGE and CONTEXT
3. Identify applicable RA norms and verify them via RAG
4. Identify relevant court practice ONLY if available in PRACTICE_CONTEXT
5. Detect missing or insufficient data

Data gaps handling:
- If information is insufficient \u2192 ask for clarification
- Mark gaps explicitly as: DATA_GAP or REQUIRED_DATA_GAP
- Do NOT assume or fill gaps yourself

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
LEGAL LOGIC (MANDATORY ORDER)
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

Always reason in the following sequence:
(A) Explicit facts (from USER_MESSAGE / CONTEXT)
(B) Applicable legal norms (verified via LEGISLATION_CONTEXT or RAG)
(C) Relevant court practice (from PRACTICE_CONTEXT, if available)
(D) Legal analysis / application
(E) Resulting output (analysis, checklist, draft structure, recommendations)

Restrictions:
- Separate facts from legal evaluation
- No moral judgments or emotional language
- No outcome predictions beyond verified practice
- No statements of certainty where law or facts are ambiguous

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
COURT PRACTICE RULES
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

If court practice is applicable and available:
- Include a section titled EXACTLY:
  \u00AB\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB):\u00BB
- For each case, list ONLY if present in PRACTICE_CONTEXT:
  - Court name
  - Case number (if available)
  - Date (if available)
  - Legal principle / position
  - Issue it supports

If no practice is available:
- State EXACTLY:
  \u00AB\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB): \u0570\u0561\u057D\u0561\u0576\u0565\u056C\u056B \u0579\u0567 \u057F\u0580\u0561\u0574\u0561\u0564\u0580\u057E\u0561\u056E \u0570\u0561\u0574\u0561\u057F\u0565\u0584\u057D\u057F\u0578\u0582\u0574\u00BB

Never invent or generalize court positions.

STRUCTURED CITATION RULES ([PRACTICE] BLOCK ONLY):
- Use citations ONLY from [PRACTICE] blocks provided in PRACTICE_CONTEXT.
- Extract Case, Date, CaseNo, ID, Court fields from each [PRACTICE] block.
- NEVER invent paragraph numbers, section numbers, or anchors not present in the [PRACTICE] block.
- When Source field = "ECHR" (or practice_category/court_type = echr), always use "ECHR" as the court label in citations.
- If the Excerpt is in English, you may translate it for the output language, but do NOT add any content beyond what the Excerpt contains.
- Citation format:
  If Date AND ID exist: (\u054F\u0565\u0301\u057D\u0589 <Source>, <Case>, <Date>, ID:<ID>)
  If Date missing:      (\u054F\u0565\u0301\u057D\u0589 <Source>, <Case>, ID:<ID>)
  If only Case exists:  (\u054F\u0565\u0301\u057D\u0589 <Case>)
- RA Cassation example: (\u054F\u0565\u0301\u057D\u0589 RA, <Case>, <Date>, ID:<ID>)
- ECHR example: (\u054F\u0565\u0301\u057D\u0589 ECHR, <Case>, <Date>, ID:<ID>)

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
CHAT PRECEDENT MODE
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

When answering legal questions, follow this precedent protocol:

Step 1: Determine whether precedent is relevant to the question.
Step 2: If relevant, retrieve precedent_units from PRACTICE_CONTEXT and insert:
  - Case reference (court name, case number, date)
  - Holding summary (rule_text)
  - Exact quote (\u226425 words, original language)
  - Anchor reference (paragraph/page if available in [PRACTICE] block)
  - Applicability explanation (why this precedent applies)

Step 3: Distinguish precedent authority:
  - Binding RA precedent (\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0564\u0561\u057F\u0561\u0580\u0561\u0576 / \u054D\u0534) \u2192 mark as BINDING
  - Constitutional interpretation (\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576) \u2192 mark as CONSTITUTIONAL
  - Persuasive ECHR (\u0535\u053D\u053D\u0534) \u2192 mark as PERSUASIVE

If no precedent found in PRACTICE_CONTEXT:
  - State: \u00AB\u0540\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 \u0579\u056B \u0570\u0561\u0575\u057F\u0576\u0561\u0562\u0565\u0580\u057E\u0565\u056C\u00BB
  - Rely on statutory analysis only

NEVER answer precedent-based questions without citation from PRACTICE_CONTEXT.

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
OUTPUT FORMAT & LANGUAGE POLICY
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

- Default output language: Armenian (hy)
- Switch to Russian or English ONLY if the user explicitly requests it
- Preserve original language of quotations (HY / RU / EN)
- Use an official, legal, structured style with clear section headers
- Preserve citations and quotations exactly as written in sources

Mandatory disclaimer (ALWAYS at the end):
\u00AB\u0536\u0563\u0578\u0582\u0577\u0561\u0581\u0578\u0582\u0574: \u054D\u0578\u0582\u0575\u0576 \u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0568 \u057D\u057F\u0565\u0572\u056E\u057E\u0565\u056C \u0567 \u0531\u0532-\u056B \u0574\u056B\u057B\u0578\u0581\u0578\u057E \u0587 \u0579\u056B \u0570\u0561\u0576\u0564\u056B\u057D\u0561\u0576\u0578\u0582\u0574 \u057A\u0561\u0577\u057F\u0578\u0576\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0589 \u053D\u0578\u0580\u0570\u0578\u0582\u0580\u0564 \u0567 \u057F\u0580\u057E\u0578\u0582\u0574 \u0564\u056B\u0574\u0565\u056C \u056C\u056B\u0581\u0565\u0576\u0566\u0561\u057E\u0578\u0580\u057E\u0561\u056E \u0583\u0561\u057D\u057F\u0561\u0562\u0561\u0576\u056B\u0589\u00BB

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
COMMUNICATION STYLE (MANDATORY)
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

- Be CONCISE and TO THE POINT. Answer the question directly without unnecessary preamble, filler, or repetition.
- Do NOT restate the user's question back to them.
- Do NOT add generic introductions like "This is a good question" or "Let me explain".
- Do NOT pad responses with obvious or commonly known information.
- Every sentence must add legal value. If it does not add value, remove it.
- Get straight to the legal analysis, norms, and practical answer.
- Prefer short structured answers over long essays.
- No filler phrases, no repetitive summaries, no verbose transitions.

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
QUALITY CONTROL (NON-NEGOTIABLE)
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

- Anti-hallucination: Base responses exclusively on provided inputs and RAG-verified data
- Validation: Verify every cited norm or case; if unverifiable, omit and flag
- Completeness: Address all parts of the query or explicitly request missing data
- Scope enforcement: Do not answer non-RA legal questions
- Consistency: Use official terminology and exact legal names

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
PLACEHOLDERS (FOR ORCHESTRATION)
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

LEGISLATION_CONTEXT: {CONTEXT}

PRACTICE_CONTEXT: {PRACTICE_CONTEXT}

USER_MESSAGE: {USER_MESSAGE}
${ANTI_INJECTION_RULES}`;

// Greeting message for new conversations
const GREETING_MESSAGE = `\u0532\u0561\u0580\u0587 \u0541\u0565\u0566\u0589 \u0535\u057D Ai Legal Armenia-\u056B \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0585\u0563\u0576\u0561\u056F\u0561\u0576\u0576 \u0565\u0574\u0589 
\u053F\u0561\u0580\u0578\u0572 \u0565\u0574 \u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0565\u056C \u0574\u056B\u0561\u0575\u0576 \u0540\u0540 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u056B\u0576 \u057E\u0565\u0580\u0561\u0562\u0565\u0580\u0578\u0572 \u0570\u0561\u0580\u0581\u0565\u0580\u056B\u0576 \u0587 \u0570\u0561\u0580\u0581\u0565\u0580\u056B\u0576 Ai Legal Armenia \u056E\u0580\u0561\u0563\u0580\u056B \u0574\u0561\u057D\u056B\u0576\u055D 
\u0570\u056B\u0574\u0576\u057E\u0565\u056C\u0578\u057E \u0562\u0561\u0581\u0561\u057C\u0561\u057A\u0565\u057D \u0563\u056B\u057F\u0565\u056C\u056B\u0584\u0576\u0565\u0580\u056B \u0562\u0561\u0566\u0561\u0575\u056B \u057E\u0580\u0561\u0589

\u053B\u0576\u0579\u057A\u0565\u055E\u057D \u056F\u0561\u0580\u0578\u0572 \u0565\u0574 \u0585\u0563\u0576\u0565\u056C \u0541\u0565\u0566\u0589`;

const FN = "legal-chat";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    // === AUTH GUARD (Prevent Anonymous Access) ===
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await sb.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // === END AUTH GUARD ===

    const reqBody = await req.json();
    const { message, conversationHistory, caseDate } = reqBody;
    const referencesText: string = typeof reqBody.referencesText === "string" ? reqBody.referencesText : "";

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // FIX A: Cap message length to prevent abuse
    const MAX_MESSAGE_LENGTH = 5000;
    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Message too long" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // === RATE LIMITING (P0) ===
    const { checkRateLimits } = await import("../_shared/rate-limiter.ts");
    const rateCheck = await checkRateLimits(supabase, user.id, "legal-chat");
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateCheck.reason, message: rateCheck.message, retry_after_seconds: rateCheck.reason === "hourly_limit_exceeded" ? 3600 : undefined }),
        { status: rateCheck.status || 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // === END RATE LIMITING ===

    // FIX C: Reuse user.id from auth guard above (removed duplicate authHeader/getUser)
    const userId = user.id;

    log(FN, "Chat request", { userId, messageLen: message.length });

    // Search knowledge base + legal practice (RAG) — via shared module
    const referenceDate: string | null = (caseDate && typeof caseDate === "string") ? caseDate : null;
    const dateAssumed = !referenceDate;
    const strictTemporal = !!(reqBody.strict_temporal);

    // Temporal warning + strict mode
    let temporalWarning: string | undefined;
    if (dateAssumed) {
      temporalWarning =
        "⚠️ reference_date was not resolved. Legal norms may include versions outside the relevant timeframe.";
      try {
        await supabase.from("audit_logs").insert({
          user_id: userId,
          action: "temporal_reference_date_missing",
          table_name: "cases",
          details: { function: "legal-chat" },
        });
      } catch { /* silent */ }

      if (strictTemporal) {
        return new Response(
          JSON.stringify({
            error: "strict_temporal_violation",
            message: "strict_temporal enabled but reference_date could not be resolved.",
            temporal_warning: temporalWarning,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    let kbContext = "";
    let practiceContext = "";

    try {
      const kbResult = await searchKB({
        supabase, supabaseUrl, supabaseKey: supabaseServiceKey,
        query: message, referenceDate, limit: 8, snippetLength: 4000,
      });

      if (kbResult.results.length > 0) {
        log(FN, "KB context ready", { docs: kbResult.results.length });
        kbContext = formatKBContext(kbResult.results, 4000);
        kbContext += temporalDisclaimer(referenceDate, dateAssumed);
      } else {
        log(FN, "No KB results found");
      }
    } catch (searchErr) {
      err(FN, "KB search failed", searchErr);
    }

    try {
      const practiceResult = await searchPractice({
        supabase, supabaseUrl, supabaseKey: supabaseServiceKey,
        query: message, limit: 5,
      });

      if (practiceResult.results.length > 0) {
        log(FN, "Practice results", { count: practiceResult.results.length });
        practiceContext = formatPracticeCtx(practiceResult.results, true);
      } else {
        log(FN, "No practice results found");
      }
    } catch (practiceErr) {
      err(FN, "Practice search failed", practiceErr);
    }

    // ====== TOKEN BUDGET LIMITER ======
    const budgeted = applyBudgets({
      userFacts: message,
      ragLegislation: kbContext ? [{ text: kbContext, score: 10 }] : [],
      ragPractice: practiceContext ? [{ text: practiceContext, score: 10 }] : [],
    }, "chat");
    logTokenUsage("legal-chat", userId, budgeted.usage);

    // Pre-scan user message for injection attempts
    const messageScan = sanitizeUserInput(message);
    if (messageScan.injectionDetected) {
      logInjectionAttempt("legal-chat", "USER_MESSAGE", messageScan);
    }

    // Parse user-selected sources (optional, no extra fetch)
    let userSourcesBlock = "";
    if (referencesText.trim()) {
      const { refs } = parseReferencesText(referencesText);
      const capped = refs.slice(0, 10);
      userSourcesBlock = buildUserSourcesBlock(capped);
      if (refs.length > 10) {
        userSourcesBlock += "\nNOTE: Only first 10 of " + refs.length + " user-selected sources included due to token budget.\n";
      }
      log(FN, "User sources parsed", { count: capped.length, total: refs.length });
    }

    let systemPromptWithContext = LEGAL_AI_SYSTEM_PROMPT
      .replace("{CONTEXT}", budgeted.ragLegislation || "\u0533\u056B\u057F\u0565\u056C\u056B\u0584\u0576\u0565\u0580\u056B \u0562\u0561\u0566\u0561\u0575\u0578\u0582\u0574 \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576 \u057F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0579\u056B \u0563\u057F\u0576\u057E\u0565\u056C\u0589")
      .replace("{PRACTICE_CONTEXT}", budgeted.ragPractice || "\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561\u0575\u056B \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576 \u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C\u0589")
      .replace("{USER_MESSAGE}", secureSandbox("USER_MESSAGE", messageScan.sanitizedText, "legal-chat").output);

    if (userSourcesBlock) {
      systemPromptWithContext += "\n\n" + userSourcesBlock +
        "\nWhen user-selected sources are provided above, you MUST cite them by docId and chunkIndex. Do NOT fetch additional data for these sources; use only the provided snippets.\n";
    }

    // Build messages array with conversation history
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPromptWithContext }
    ];

    // FIX B: Add conversation history with caps to prevent token abuse
    const MAX_HISTORY_MESSAGES = 30;
    const MAX_CONTENT_LENGTH = 5000;
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const safeHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
      for (const msg of safeHistory) {
        if (
          (msg.role === "user" || msg.role === "assistant") &&
          typeof msg.content === "string"
        ) {
          messages.push({ role: msg.role, content: msg.content.substring(0, MAX_CONTENT_LENGTH) });
        }
      }
    }

    // Add current message
    messages.push({ role: "user", content: message });

    // NOTE: legal-chat uses streaming — bypass via centralized helper.
    const { callStreamBypass } = await import("../_shared/gateway-bypass.ts");
    const { getModelConfig: _getModelConfig } = await import("../_shared/openai-router.ts");
    const chatModelCfg = _getModelConfig("legal-chat");

    const streamResult = await callStreamBypass(messages, {
      functionName: "legal-chat",
      bypassReason: "streaming",
      timeoutMs: 90000,
    });
    const response = streamResult.response;

    if (!response.ok) {
      err(FN, "AI Gateway error", undefined, { status: response.status });

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "\u0540\u0561\u0580\u0581\u0578\u0582\u0574\u0576\u0565\u0580\u056B \u057D\u0561\u0570\u0574\u0561\u0576\u0568 \u0563\u0565\u0580\u0561\u0566\u0561\u0576\u0581\u057E\u0565\u0581\u0589 \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0583\u0578\u0580\u0571\u0565\u056C \u0561\u057E\u0565\u056C\u056B \u0578\u0582\u0577\u0589" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "\u0540\u0561\u0577\u057E\u056B \u0574\u056B\u057B\u0578\u0581\u0576\u0565\u0580\u0568 \u057D\u057A\u0561\u057C\u057E\u0565\u056C \u0565\u0576\u0589" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "\u054D\u056D\u0561\u056C \u0561\u057C\u0561\u057B\u0561\u0581\u0561\u057E\u0589 \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0576\u0578\u0580\u056B\u0581\u0589" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log API usage — bounded estimate for budget tracking (streaming has no usage metadata)
    const estimatedInputTokens = Math.ceil(
      messages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0) / 4
    );
    // Bounded output estimate: cap at model max_tokens to prevent unbounded drift
    const OUTPUT_TOKEN_CAP = chatModelCfg.max_tokens; // from MODEL_MAP
    const estimatedOutputTokens = OUTPUT_TOKEN_CAP; // worst-case bound
    const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens;
    try {
      await supabase.rpc("log_api_usage", {
        _service_type: "legal_chat",
        _model_name: streamResult.model_used,
        _tokens_used: estimatedTotalTokens,
        _estimated_cost: null,
        _metadata: {
          message_length: message.length,
          has_context: !!kbContext,
          has_practice: !!practiceContext,
          request_id: streamResult.request_id,
          cost_estimated: true,
          input_tokens_estimated: true,
          streaming_estimation: {
            method: "chars/4",
            bounded: true,
            input_tokens_est: estimatedInputTokens,
            output_tokens_est: estimatedOutputTokens,
            output_cap: OUTPUT_TOKEN_CAP,
          },
        },
      });
    } catch (logErr) {
      err(FN, "Failed to log API usage", logErr);
    }

    // Return streaming response
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    err(FN, "Unhandled error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// sanitizeForPostgrest moved to _shared/rag-search.ts
