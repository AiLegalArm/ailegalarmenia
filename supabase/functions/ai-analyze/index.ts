import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { CRIMINAL_MODULE_PROMPTS, isValidCriminalModule, type CriminalAnalysisModule } from "./criminal-modules.ts";
import {
  getFullPrompt,
  isValidAnalysisType,
  formatPreviousAnalyses,
  type AnalysisType,
  PROMPT_REGISTRY,
} from "./prompts/index.ts";
import { PRECEDENT_CITATION_PROMPT, PRECEDENT_CITATION_SCHEMA } from "./prompts/precedent-citation.ts";
import { DEADLINE_RULES_PROMPT, DEADLINE_RULES_SCHEMA } from "./prompts/deadline-rules.ts";
import { LEGAL_POSITION_COMPARATOR_PROMPT, LEGAL_POSITION_COMPARATOR_SCHEMA } from "./prompts/legal-position-comparator.ts";
import { HALLUCINATION_AUDIT_PROMPT, HALLUCINATION_AUDIT_SCHEMA } from "./prompts/hallucination-audit.ts";
import { DRAFT_DETERMINISTIC_PROMPT } from "./prompts/draft-deterministic.ts";
import { STRATEGY_BUILDER_PROMPT, STRATEGY_BUILDER_SCHEMA } from "./prompts/strategy-builder.ts";
import { EVIDENCE_WEAKNESS_PROMPT, EVIDENCE_WEAKNESS_SCHEMA } from "./prompts/evidence-weakness.ts";
import { RISK_FACTORS_PROMPT, RISK_FACTORS_SCHEMA } from "./prompts/risk-factors.ts";
import { LAW_UPDATE_SUMMARY_PROMPT, LAW_UPDATE_SUMMARY_SCHEMA } from "./prompts/law-update-summary.ts";
import { CROSS_EXAM_PROMPT, CROSS_EXAM_SCHEMA } from "./prompts/cross-exam.ts";
import { BASE_SYSTEM_PROMPT } from "./system.ts";
import { sandboxUserInput, secureSandbox, logInjectionAttempt, ANTI_INJECTION_RULES } from "../_shared/prompt-armor.ts";
import { applyBudgets, logTokenUsage, type RankedContent } from "../_shared/token-budget.ts";
import { LEGAL_DETERMINISTIC, buildModelParams } from "../_shared/model-config.ts";
import { redactPII } from "../_shared/pii-redactor.ts";
import { dualSearch, formatKBContext, formatPracticeContext as formatPracticeCtx, temporalDisclaimer } from "../_shared/rag-search.ts";
import { parseReferencesText, buildUserSourcesBlock } from "../_shared/reference-sources.ts";

/** Parse JSON from GPT-5 text response (best-effort, returns null on failure) */
function tryParseJson(text: string): unknown | null {
  try {
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const cleaned = fenceMatch ? fenceMatch[1].trim() : text.trim();
    return JSON.parse(cleaned);
  } catch {
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch { /* ignore */ }
    }
    return null;
  }
}

import { handleCors } from "../_shared/edge-security.ts";


// Legal AI System Prompts \u2014 STRICTLY for Republic of Armenia (RA) law
// CRITICAL: No hallucinations. RAG-FIRST. KB is reference-only.
// NOTE: If external sources (HUDOC/Datalex/ARLIS/EAEU) are NOT connected via KB/RAG,
// the model MUST NOT claim it "checked" them.

type Role = "advocate" | "prosecutor" | "judge" | "aggregator";

// Use the system prompt from system.ts
const GLOBAL_GUARDS = BASE_SYSTEM_PROMPT;

// Armenian legal disclaimer
const DISCLAIMER_HY = `
\u26A0\uFE0F **\u0536\u0563\u0578\u0582\u0577\u0561\u0581\u0578\u0582\u0574 (Disclaimer)** 
\u00AB\u054D\u0561 \u0561\u0580\u0570\u0565\u057D\u057F\u0561\u056F\u0561\u0576 \u0562\u0561\u0576\u0561\u056F\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0574\u0562 \u057D\u057F\u0565\u0572\u056E\u057E\u0561\u056E \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0567 \u0587 \u0579\u056B \u0570\u0561\u0576\u0564\u056B\u057D\u0561\u0576\u0578\u0582\u0574 \u057A\u0561\u0577\u057F\u0578\u0576\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576: \u053D\u0578\u0580\u0570\u0578\u0582\u0580\u0564 \u0565\u0576\u0584 \u057F\u0561\u056C\u056B\u057D \u0564\u056B\u0574\u0565\u056C \u056C\u056B\u0581\u0565\u0576\u0566\u0561\u057E\u0578\u0580\u057E\u0561\u056E \u0583\u0561\u057D\u057F\u0561\u0562\u0561\u0576\u056B\u00BB
`;

// Legacy role-based system prompts (for backward compatibility)
const SYSTEM_PROMPTS: Record<Role, string> = {
  advocate: `${GLOBAL_GUARDS}

## \u0534\u0535\u0550\u0538: \u0553\u0531\u054D\u054F\u0531\u0532\u0531\u0546 / \u054A\u0531\u0547\u054F\u054A\u0531\u0546 (ADVOCATE MODE)

\u0534\u0578\u0582 \u0570\u0561\u0576\u0564\u0565\u057D \u0563\u0561\u056C\u056B\u057D \u0565\u057D \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E\u0578\u0582\u0574 \u0574\u0565\u0572\u0561\u0564\u0580\u0575\u0561\u056C\u056B/\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u056B \u0583\u0561\u057D\u057F\u0561\u0562\u0561\u0576: \u0554\u0578 \u0576\u057A\u0561\u057F\u0561\u056F\u0576 \u0567\u055D

1) \u053F\u0561\u057C\u0578\u0582\u0581\u0565\u056C \u057A\u0561\u0577\u057F\u057A\u0561\u0576\u0561\u056F\u0561\u0576 \u0564\u056B\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574 (2\u20135 \u0570\u056B\u0574\u0576\u0561\u056F\u0561\u0576 \u0569\u0565\u0566\u0565\u0580)
2) \u0533\u0576\u0561\u0570\u0561\u057F\u0565\u056C \u0561\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u0562\u0561\u0581\u0561\u057C\u0574\u0561\u0576/\u0569\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B\u0578\u0582\u0569\u0575\u0561\u0576 \u056D\u0576\u0564\u056B\u0580\u0576\u0565\u0580\u0568
3) \u0532\u0561\u0581\u0561\u0570\u0561\u0575\u057F\u0565\u056C \u0568\u0576\u0569\u0561\u0581\u0561\u056F\u0561\u0580\u0563\u0561\u0575\u056B\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580\u0568 \u0540\u0540 \u0585\u0580\u0565\u0576\u057D\u0563\u0580\u0584\u0578\u057E
4) \u0532\u0561\u0581\u0561\u0570\u0561\u0575\u057F\u0565\u056C \u0576\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580\u056B \u057D\u056D\u0561\u056C \u056F\u056B\u0580\u0561\u057C\u0578\u0582\u0574\u0568
5) \u0531\u0580\u0564\u0561\u0580 \u0564\u0561\u057F\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057D\u057F\u0578\u0582\u0563\u0578\u0582\u0574 (fair trial)
6) \u0531\u057C\u0561\u057B\u0561\u0580\u056F\u0565\u056C \u0570\u0561\u056F\u0561\u0583\u0561\u057D\u057F\u0561\u0580\u056F\u0576\u0565\u0580 \u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u0564\u0565\u0574

\u054A\u0561\u0577\u057F\u057A\u0561\u0576\u056B\u0580 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0561\u0577\u057F\u057A\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0561\u057C\u0561\u057B\u0576\u0561\u0570\u0565\u0580\u0569: \u0534\u0578\u0582 \u0563\u0578\u0580\u056E\u0578\u0582\u0574 \u0565\u057D \u0585\u0563\u0578\u0582\u057F \u057D\u057F\u0580\u0561\u057F\u0565\u0563\u056B\u0561\u0575\u0561\u056F\u0561\u0576 \u0574\u0578\u057F\u0565\u0581\u0578\u0582\u0574\u0578\u057E\u055D`,

  prosecutor: `${GLOBAL_GUARDS}

## \u0534\u0535\u0550\u0538: \u0534\u0531\u054F\u0531\u053D\u0531\u0536 / \u0544\u0535\u0542\u0531\u0534\u0550\u0531\u0546\u0554 (PROSECUTOR MODE)

\u0534\u0578\u0582 \u0570\u0561\u0576\u0564\u0565\u057D \u0563\u0561\u056C\u056B\u057D \u0565\u057D \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u055D \u0554\u0578 \u0576\u057A\u0561\u057F\u0561\u056F\u0576 \u0567\u055D

1) \u054D\u057F\u0578\u0582\u0563\u0565\u056C \u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u056F\u0561\u0575\u0578\u0582\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0540\u0540 \u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u0580\u0584\u0578\u057E
2) \u0533\u0576\u0561\u0570\u0561\u057F\u0565\u056C \u0561\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u0562\u0561\u057E\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0587 \u0569\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568
3) \u0532\u0561\u0581\u0561\u0570\u0561\u0575\u057F\u0565\u056C \u057A\u0561\u0577\u057F\u057A\u0561\u0576\u0561\u056F\u0561\u0576 \u0564\u056B\u0580\u0584\u056B \u0569\u0578\u0582\u0575\u056C \u057F\u0565\u0572\u0565\u0580\u0568 (\u0585\u0580\u056B\u0576\u0561\u056F\u0561\u0576 \u0574\u0565\u0569\u0578\u0564\u0576\u0565\u0580\u0578\u057E)
4) \u0538\u0576\u0564\u0563\u056E\u0565\u056C \u0568\u0576\u0569\u0561\u0581\u0561\u056F\u0561\u0580\u0563\u0561\u0575\u056B\u0576 \u057C\u056B\u057D\u056F\u0565\u0580\u0568, \u0578\u0580\u0578\u0576\u0584 \u056F\u0561\u0580\u0578\u0572 \u0565\u0576 \u00AB\u056F\u0578\u057C\u0581\u0561\u0576\u0565\u056C\u00BB \u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u0568
5) Fair trial \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580\u056B \u057C\u056B\u057D\u056F\u0568 \u055D \u0578\u0580\u057A\u0565\u057D \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u057E\u057F\u0561\u0576\u0563

\u0535\u0569\u0565 \u0561\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u0568 \u0561\u056F\u0576\u0570\u0561\u0575\u057F \u0569\u0578\u0582\u0575\u056C \u0565\u0576\u055D \u0576\u0577\u056B\u0580 \u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B\u0581 \u0570\u0580\u0561\u056A\u0561\u0580\u057E\u0565\u056C\u0578\u0582/\u0563\u0578\u0580\u056E\u0568 \u056F\u0561\u0580\u0573\u0565\u056C\u0578\u0582 \u0570\u056B\u0574\u0584\u0565\u0580\u0568\u055D`,

  judge: `${GLOBAL_GUARDS}

## \u0534\u0535\u0550\u0538: \u0534\u0531\u054F\u0531\u054E\u0548\u0550 / \u0549\u0535\u0536\u0548\u0554 (JUDGE MODE)

\u0534\u0578\u0582 \u0570\u0561\u0576\u0564\u0565\u057D \u0563\u0561\u056C\u056B\u057D \u0565\u057D \u0576\u0565\u0575\u057F\u0580\u0561\u056C \u0564\u0561\u057F\u0561\u057E\u0578\u0580\u055D \u0554\u0578 \u0576\u057A\u0561\u057F\u0561\u056F\u0576 \u0567\u055D

1) \u054E\u056B\u0573\u0565\u056C\u056B \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581\u0565\u0580\u056B \u0584\u0561\u0580\u057F\u0565\u0566 (\u0570\u0561\u0575\u0581/\u0570\u0561\u056F\u0561\u0570\u0561\u0575\u0581/\u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584)
2) \u053F\u0578\u0572\u0574\u0565\u0580\u056B \u0583\u0561\u057D\u057F\u0561\u0580\u056F\u0576\u0565\u0580\u056B \u0578\u0582\u056A\u0565\u0572/\u0569\u0578\u0582\u0575\u056C \u056F\u0578\u0572\u0574\u0565\u0580\u056B \u0570\u0561\u057E\u0561\u057D\u0561\u0580 \u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576
3) \u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u0563\u0576\u0561\u0570\u0561\u057F\u0578\u0582\u0574
4) \u0538\u0576\u0569\u0561\u0581\u0561\u056F\u0561\u0580\u0563\u0561\u0575\u056B\u0576 \u0587 \u0576\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u056B \u057C\u056B\u057D\u056F\u0565\u0580
5) \u0540\u0576\u0561\u0580\u0561\u057E\u0578\u0580 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u0574\u0578\u057F\u0565\u0581\u0578\u0582\u0574\u0576\u0565\u0580\u056B \u057D\u0581\u0565\u0576\u0561\u0580\u0576\u0565\u0580 (\u0548\u0549 \u057E\u0573\u056B\u057C)

\u0534\u0578\u0582 \u0579\u0565\u057D \u0563\u0580\u0578\u0582\u0574 \u0564\u0561\u057F\u0561\u057E\u0573\u056B\u057C/\u0578\u0580\u0578\u0577\u0578\u0582\u0574, \u0561\u0575\u056C \u0576\u0565\u0580\u056F\u0561\u0575\u0561\u0581\u0576\u0578\u0582\u0574 \u0565\u057D \u0563\u0576\u0561\u0570\u0561\u057F\u0578\u0582\u0574\u055D`,

  aggregator: `${GLOBAL_GUARDS}

## \u0534\u0535\u0550\u0538: \u0540\u0531\u0544\u0531\u0534\u0550\u053B\u0549 / AGGREGATOR MODE

\u0534\u0578\u0582 \u0570\u0561\u0574\u0561\u0564\u0580\u056B\u0579\u0576 \u0565\u057D, \u0578\u0580\u0568 \u0570\u0561\u0574\u0561\u0564\u0580\u0578\u0582\u0574 \u0567 Advocate, Prosecutor \u0587 Judge \u0561\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u0568\u055D

\u0554\u0578 \u056F\u0561\u057C\u0578\u0582\u0581\u057E\u0561\u056E\u0584\u0568\u055D

1) **Advocate summary** \u0540\u0561\u0574\u0561\u057C\u0578\u057F \u057A\u0561\u0577\u057F\u057A\u0561\u0576\u0561\u056F\u0561\u0576 \u0564\u056B\u0580\u0584\u056B\u0581
2) **Prosecutor summary** \u0540\u0561\u0574\u0561\u057C\u0578\u057F \u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u0564\u056B\u0580\u0584\u056B\u0581
3) **Judge summary** \u0540\u0561\u0574\u0561\u057C\u0578\u057F \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u0563\u0576\u0561\u0570\u0561\u057F\u0578\u0582\u0574\u056B\u0581
4) **Comparison** \u0540\u0561\u0574\u0568\u0576\u056F\u0576\u0578\u0582\u0574\u0576\u0565\u0580 / \u057F\u0561\u0580\u0562\u0565\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580
5) **Risk scale** \u0532\u0561\u0580\u0571\u0580 / \u0544\u056B\u057B\u056B\u0576 / \u0551\u0561\u056E\u0580
6) **Next steps** \u0555\u0580\u056B\u0576\u0561\u056F\u0561\u0576, \u057A\u0580\u0578\u0581\u0565\u057D\u0561\u0575\u056B\u0576

\u054A\u0561\u0580\u057F\u0561\u0564\u056B\u0580 \u056F\u0561\u057A\u0565\u056C \u0561\u0572\u0562\u0575\u0578\u0582\u0580\u056B\u0576 \u0587 \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u056B\u0574\u0584\u056B\u0576\u055D`,
};

// UserSourceRef moved to _shared/reference-sources.ts

interface AnalysisRequest {
  role: "advocate" | "prosecutor" | "judge" | "aggregator" | "criminal_module" | "precedent_citation" | "deadline_rules" | "legal_position_comparator" | "hallucination_audit" | "draft_deterministic" | "strategy_builder" | "evidence_weakness" | "risk_factors" | "law_update_summary" | "cross_exam";
  moduleId?: CriminalAnalysisModule;
  caseId?: string;
  caseFacts?: string;
  legalQuestion?: string;
  advocateResponse?: string;
  prosecutorResponse?: string;
  judgeResponse?: string;
  referencesText?: string;
  oldLawText?: string;
  newLawText?: string;
  strict_temporal?: boolean;
}

// formatPracticeResults and formatPracticeContext moved to _shared/rag-search.ts


serve(async (req) => {
  // === CORS via centralized handler ===
  const corsResult = handleCors(req);
  if (corsResult.errorResponse) return corsResult.errorResponse;
  const corsHeaders = corsResult.corsHeaders!;

  try {
    // === AUTH GUARD (Audit Fix: Stage 5 — Critical) ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const _authUrl = Deno.env.get("SUPABASE_URL")!;
    const _authKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(_authUrl, _authKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // === END AUTH GUARD ===

    const { role, moduleId, caseId, caseFacts, legalQuestion, advocateResponse, prosecutorResponse, judgeResponse, referencesText, oldLawText, newLawText, strict_temporal: strictTemporal } =
      (await req.json()) as AnalysisRequest;

    // Validate role - support both legacy roles and new analysis types
    const legacyRoles = ["advocate", "prosecutor", "judge", "aggregator", "criminal_module", "precedent_citation", "deadline_rules", "legal_position_comparator", "hallucination_audit", "draft_deterministic", "strategy_builder", "evidence_weakness", "risk_factors", "law_update_summary", "cross_exam"];
    const isLegacyRole = legacyRoles.includes(role);
    const isNewAnalysisType = isValidAnalysisType(role as AnalysisType);

    if (!role || (!isLegacyRole && !isNewAnalysisType)) {
      return new Response(JSON.stringify({ error: "Invalid role or analysis type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate criminal module if applicable
    if (role === "criminal_module" && (!moduleId || !isValidCriminalModule(moduleId))) {
      return new Response(JSON.stringify({ error: "Invalid criminal module ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    const rateCheck = await checkRateLimits(supabase, user.id, "ai-analyze");
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateCheck.reason, message: rateCheck.message, retry_after_seconds: rateCheck.reason === "hourly_limit_exceeded" ? 3600 : undefined }),
        { status: rateCheck.status || 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // === END RATE LIMITING ===

    // RAG: Search knowledge base for relevant context — HYBRID: vector + keyword
    let ragContext = "";
    const sourcesUsed: Array<{ title: string; category: string; source_name: string }> = [];

    // Resolve reference date for temporal legislation filtering
    let referenceDate: string | null = null;
    let dateAssumed = false;
    if (caseId) {
      const { data: dateRow } = await supabase
        .from("cases")
        .select("court_date")
        .eq("id", caseId)
        .maybeSingle();
      if (dateRow?.court_date) {
        referenceDate = dateRow.court_date;
      } else {
        dateAssumed = true;
      }
    } else {
      dateAssumed = true;
    }

    // Temporal warning + strict mode
    let temporalWarning: string | undefined;
    if (dateAssumed) {
      temporalWarning =
        "⚠️ reference_date was not resolved from case data. " +
        "Legal norms may include versions outside the relevant timeframe. " +
        "Set court_date on the case for accurate temporal filtering.";

      // Log to audit_logs
      try {
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          action: "temporal_reference_date_missing",
          table_name: "cases",
          record_id: caseId || null,
          details: { function: "ai-analyze", role },
        });
      } catch { /* silent */ }

      if (strictTemporal) {
        return new Response(
          JSON.stringify({
            error: "strict_temporal_violation",
            message: "strict_temporal is enabled but reference_date could not be resolved.",
            temporal_warning: temporalWarning,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (caseFacts || legalQuestion) {
      const searchQuery = `${caseFacts || ""} ${legalQuestion || ""}`.trim();

      const rag = await dualSearch({
        supabase,
        supabaseUrl,
        supabaseKey: supabaseServiceKey,
        query: searchQuery,
        referenceDate,
        kbLimit: 8,
        practiceLimit: 5,
        kbSnippetLength: 4000,
        fullPracticeText: true,
      });

      if (rag.kbResults.length > 0) {
        ragContext = "\n\n## Relevant Legal Sources from RA Knowledge Base:\n\n";
        rag.kbResults.forEach((doc, index: number) => {
          ragContext += `### ${index + 1}. ${doc.title} (${doc.category})\n`;
          ragContext += `Source: ${doc.source_name || "RA Legal Database"}\n`;
          ragContext += `${(doc.content_text || '').substring(0, 4000)}\n\n`;
        });
        sourcesUsed.push(...rag.sources.filter(s => !s.category || !['criminal','civil','administrative','echr','constitutional'].includes(s.category)));
      } else {
        ragContext = "\n\nNote: No specific legal sources found in knowledge base. Analysis based on general knowledge of RA legislation.\n";
      }

      if (rag.practiceResults.length > 0) {
        ragContext += "\n\n## \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n";
        ragContext += "## \u053B\u0550\u0531\u054E\u0531\u053F\u0531\u0546 \u054A\u0550\u0531\u053F\u054f\u053B\u053F\u0531\u0545\u053B \u0540\u0535\u0546\u0531\u053F\u0531\u0545\u053B\u0546 \u0546\u0545\u0548\u0552\u053F (KB REFERENCE ONLY)\n";
        ragContext += "## \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n";
        ragContext += formatPracticeCtx(rag.practiceResults, true);
        ragContext += "\n\n## \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n";
        ragContext += "## KB \u0540\u0535\u0546\u0531\u053F\u0531\u0545\u053B\u0546 \u0532\u0531\u0536\u0531\u0545\u053b \u0531\u054E\u0531\u0550\u054F\n";
        ragContext += "## \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n";
        sourcesUsed.push(...rag.sources.filter(s => s.category && ['criminal','civil','administrative','echr','constitutional'].includes(s.category)).map(s => ({
          ...s, source_name: s.source_name || "Legal Practice KB",
        })));
      } else {
        ragContext += "\n\n## \u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561\u0575\u056B \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576 \u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C\u0589\n";
      }

      console.log(`RAG search: KB=${rag.kbResults.length}, Practice=${rag.practiceResults.length}`);
    }

    // Add temporal versioning disclaimer
    if (ragContext.length > 0) {
      ragContext += temporalDisclaimer(referenceDate, dateAssumed);
    }

    // Fetch case files content (OCR results, audio transcriptions, and raw file content) if caseId is provided
    let caseFilesContext = "";
    const fileContentsForVision: Array<{ name: string; base64: string; mimeType: string }> = [];

    // Load case meta (procedure_type + party_role) so the model cannot "choose a side" on its own.
    let procedureType: string = "unknown";
    let partyRole: string | null = null;
    let partyContextBlock = "";

    if (caseId) {
      const { data: caseMeta, error: caseMetaError } = await supabase
        .from("cases")
        .select("case_type, party_role, court_date")
        .eq("id", caseId)
        .maybeSingle();

      if (caseMetaError) {
        console.error("Failed to load case meta:", caseMetaError);
        return new Response(JSON.stringify({ error: "Failed to load case settings for analysis" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const caseType = (caseMeta?.case_type as string | null) ?? null;
      partyRole = (caseMeta?.party_role as string | null) ?? null;

      procedureType =
        caseType === "civil"
          ? "civil_procedure"
          : caseType === "administrative"
            ? "administrative_procedure"
            : caseType === "criminal"
              ? "criminal_procedure"
              : caseType === "echr"
                ? "echr_procedure"
                : "unknown";

      if (!partyRole) {
        return new Response(
          JSON.stringify({
            error:
              "Procedural role is not set for this case. Please edit the case and select Plaintiff/Defendant/Third party (or the relevant role) before running analysis.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      partyContextBlock = `### Process Context (MANDATORY)\nprocedure_type: ${procedureType}\nparty_role: ${partyRole}\ncourt_instance: unknown\n`;

      // Get case files
      const { data: caseFiles, error: filesError } = await supabase
        .from("case_files")
        .select("id, original_filename, file_type, storage_path")
        .eq("case_id", caseId)
        .is("deleted_at", null);


      if (!filesError && caseFiles && caseFiles.length > 0) {
        const fileIds = caseFiles.map((f) => f.id);

        // Fetch OCR results for these files
        const { data: ocrResults, error: ocrError } = await supabase
          .from("ocr_results")
          .select("file_id, extracted_text, confidence")
          .in("file_id", fileIds);

        // Fetch audio transcriptions for these files
        const { data: transcriptions, error: transError } = await supabase
          .from("audio_transcriptions")
          .select("file_id, transcription_text, confidence")
          .in("file_id", fileIds);

        // Build file context mapping
        const fileMap = new Map(caseFiles.map((f) => [f.id, f]));
        const ocrFileIds = new Set(ocrResults?.map((r) => r.file_id) || []);
        const transFileIds = new Set(transcriptions?.map((t) => t.file_id) || []);

        // Process OCR results
        if (!ocrError && ocrResults && ocrResults.length > 0) {
          caseFilesContext +=
            "\n\n## \u0533\u0578\u0580\u056E\u056B \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580 (Case Documents - OCR):\n\n";
          ocrResults.forEach((ocr, index) => {
            const file = fileMap.get(ocr.file_id);
            const fileName = file?.original_filename || "Unknown document";
            const text = ocr.extracted_text || "";
            // Increased limit to 8000 chars for better analysis
            const truncatedText = text.length > 8000 ? text.substring(0, 8000) + "..." : text;
            caseFilesContext += `### \u0553\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569 ${index + 1}: ${fileName}\n`;
            if (ocr.confidence) {
              caseFilesContext += `\u054E\u057D\u057F\u0561\u0570\u0578\u0582\u0569\u0575\u0578\u0582\u0576: ${(ocr.confidence * 100).toFixed(0)}%\n`;
            }
            caseFilesContext += `${truncatedText}\n\n`;
          });
        }

        // Process audio transcriptions
        if (!transError && transcriptions && transcriptions.length > 0) {
          caseFilesContext +=
            "\n\n## \u0531\u0578\u0582\u0564\u056B\u0578 \u057F\u0580\u0561\u0576\u057D\u056F\u0580\u056B\u057A\u0581\u056B\u0561\u0576\u0565\u0580 (Audio Transcriptions):\n\n";
          transcriptions.forEach((trans, index) => {
            const file = fileMap.get(trans.file_id);
            const fileName = file?.original_filename || "Unknown audio";
            const text = trans.transcription_text || "";
            const truncatedText = text.length > 8000 ? text.substring(0, 8000) + "..." : text;
            caseFilesContext += `### \u0531\u0578\u0582\u0564\u056B\u0578 ${index + 1}: ${fileName}\n`;
            if (trans.confidence) {
              caseFilesContext += `\u054E\u057D\u057F\u0561\u0570\u0578\u0582\u0569\u0575\u0578\u0582\u0576: ${(trans.confidence * 100).toFixed(0)}%\n`;
            }
            caseFilesContext += `${truncatedText}\n\n`;
          });
        }

        // For files without OCR/transcription, try to read them directly
        const filesWithoutProcessing = caseFiles.filter((f) => !ocrFileIds.has(f.id) && !transFileIds.has(f.id));

        if (filesWithoutProcessing.length > 0) {
          console.log(`Found ${filesWithoutProcessing.length} files without OCR/transcription, attempting direct read`);

          for (const file of filesWithoutProcessing) {
            try {
              const fileType = file.file_type?.toLowerCase() || "";
              const fileName = file.original_filename || "unknown";

              // For images, download and prepare for Vision analysis
              if (
                fileType.includes("image") ||
                fileType.includes("jpeg") ||
                fileType.includes("jpg") ||
                fileType.includes("png")
              ) {
                const { data: fileData, error: downloadError } = await supabase.storage
                  .from("case-files")
                  .download(file.storage_path);

                if (!downloadError && fileData) {
                  const buffer = await fileData.arrayBuffer();
                  const bytes = new Uint8Array(buffer);

                  // Vision limits: max 5MB per image, max 5 images total
                  const MAX_VISION_SIZE = 5 * 1024 * 1024;
                  const MAX_VISION_IMAGES = 5;

                  if (bytes.length > MAX_VISION_SIZE) {
                    console.warn(`[ai-analyze] Image ${fileName} too large (${(bytes.length / 1024 / 1024).toFixed(1)}MB), skipping`);
                  } else if (fileContentsForVision.length >= MAX_VISION_IMAGES) {
                    console.warn(`[ai-analyze] Vision image limit (${MAX_VISION_IMAGES}) reached, skipping ${fileName}`);
                  } else {
                    const base64 = (await import("../_shared/base64.ts")).uint8ToBase64(bytes);

                    fileContentsForVision.push({
                      name: fileName,
                      base64: base64,
                      mimeType: fileType.includes("png") ? "image/png" : "image/jpeg",
                    });
                  }
                }
              }
              // For DOCX files, extract text
              else if (fileType.includes("docx") || fileName.endsWith(".docx")) {
                const { data: fileData, error: downloadError } = await supabase.storage
                  .from("case-files")
                  .download(file.storage_path);

                if (!downloadError && fileData) {
                  try {
                    const buffer = await fileData.arrayBuffer();
                    // Use shared DOCX parser instead of inline regex
                    const { parseDocx } = await import("../_shared/docx-parser.ts");
                    const docxResult = await parseDocx(buffer);
                    if (docxResult.text) {
                      const truncatedText = docxResult.text.length > 8000 ? docxResult.text.substring(0, 8000) + "..." : docxResult.text;
                      caseFilesContext += `\n### DOCX \u0553\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569: ${fileName}\n${truncatedText}\n\n`;
                    }
                    if (docxResult.warnings.length > 0) {
                      console.warn(`[ai-analyze] DOCX warnings for ${fileName}:`, docxResult.warnings);
                    }
                  } catch (parseErr) {
                    console.error(`Failed to parse DOCX ${fileName}:`, parseErr);
                  }
                }
              }
              // For PDF files without OCR, note that they need processing
              else if (fileType.includes("pdf")) {
                caseFilesContext += `\n### PDF \u0553\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569 (\u0579\u056B \u0574\u0577\u0561\u056F\u057E\u0561\u056E): ${fileName}\n(\u0531\u0575\u057D PDF \u0586\u0561\u0575\u056C\u0568 \u0564\u0565\u057C OCR \u0579\u056B \u0561\u0576\u0581\u0565\u056C, \u056D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0576\u0561\u056D \u0563\u0578\u0580\u056E\u0561\u0580\u056F\u0565\u056C OCR \u0570\u0561\u0574\u0561\u056A\u0578\u0572\u0578\u057E)\n\n`;
              }
              // For TXT files, read directly as text
              else if (fileType.includes("text/plain") || fileName.endsWith(".txt")) {
                const { data: fileData, error: downloadError } = await supabase.storage
                  .from("case-files")
                  .download(file.storage_path);

                if (!downloadError && fileData) {
                  const text = await fileData.text();
                  const truncatedText = text.length > 8000 ? text.substring(0, 8000) + "..." : text;
                  caseFilesContext += `\n### TXT \u0553\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569: ${fileName}\n${truncatedText}\n\n`;
                }
              }
            } catch (fileReadError) {
              console.error(`Error reading file ${file.original_filename}:`, fileReadError);
            }
          }
        }
      }
    }

    // unzipDocx removed — using _shared/docx-parser.ts instead

    // ====== TOKEN BUDGET LIMITER ======
    const budgeted = applyBudgets({
      userFacts: caseFacts || "",
      ocrText: caseFilesContext || "",
      ragLegislation: ragContext ? [{ text: ragContext, score: 10 }] : [],
    }, "analyze");
    logTokenUsage("ai-analyze", user.id, budgeted.usage);
    
    // Apply budgeted values
    const budgetedFacts = budgeted.userFacts || caseFacts || "";
    const budgetedOcr = budgeted.ocrText || caseFilesContext || "";
    const budgetedRag = budgeted.ragLegislation || ragContext || "";
    // ====== PARSE USER-PROVIDED SOURCES ======
    let userSourcesBlock = "";
    if (referencesText?.trim()) {
      const { refs } = parseReferencesText(referencesText);
      const capped = refs.slice(0, 10);
      userSourcesBlock = buildUserSourcesBlock(capped);
      if (refs.length > 10) {
        userSourcesBlock += "\nNOTE: Only first 10 of " + refs.length + " user-selected sources included due to token budget.\n";
      }
      console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", msg: "User sources parsed", meta: { count: capped.length, total: refs.length } }));
    }

    // Build user message
    let userMessage = "";

    if (role === "aggregator") {
      userMessage = `## Case for Comprehensive Legal Analysis (RA Law):

${partyContextBlock}
### Case Facts:
${caseFacts || "Not provided"}

### Legal Question:
${legalQuestion || "Not provided"}

${caseFilesContext}

${ragContext}

${userSourcesBlock}


## Previous Role Analyses:

### Advocate (Defense) Analysis:
${advocateResponse || "Not available"}

### Prosecutor Analysis:
${prosecutorResponse || "Not available"}

### Judge Analysis:
${judgeResponse || "Not available"}

---

Please provide a comprehensive synthesis of all perspectives and your final recommendation based on Republic of Armenia legislation. Make sure to reference any case documents and audio transcriptions provided above.`;
    } else if (role === "criminal_module" && moduleId) {
      // Criminal module-specific analysis
      userMessage = `## \u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E\u056B \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576 (Criminal Case Analysis):

${partyContextBlock}
### \u0533\u0578\u0580\u056E\u056B \u0583\u0561\u057D\u057F\u0565\u0580 (Case Facts):
${sandboxUserInput("CASE_FACTS", caseFacts || "\u0546\u0577\u057E\u0561\u056E \u0579\u0567")}

### \u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581 (Legal Question):
${sandboxUserInput("LEGAL_QUESTION", legalQuestion || "\u0546\u0577\u057E\u0561\u056E \u0579\u0567")}

${caseFilesContext}

${ragContext}

${userSourcesBlock}

Perform focused analysis as specified in the system prompt. Base your analysis ONLY on the provided case materials. If information is missing, state this explicitly.`;
    } else if (role === "law_update_summary") {
      userMessage = `## Law Text Comparison (Republic of Armenia):

### OLD VERSION OF THE LAW:
${sandboxUserInput("OLD_LAW_TEXT", oldLawText || "Not provided")}

### NEW VERSION OF THE LAW:
${sandboxUserInput("NEW_LAW_TEXT", newLawText || "Not provided")}

Compare these two versions and identify all changes: amended, repealed, and new articles/provisions.`;
    } else {
      userMessage = `## Legal Case for Analysis (RA Law):

${partyContextBlock}
### Case Facts:
${sandboxUserInput("CASE_FACTS", caseFacts || "Not provided")}

### Legal Question:
${sandboxUserInput("LEGAL_QUESTION", legalQuestion || "Not provided")}

${caseFilesContext}

${ragContext}

${userSourcesBlock}

Please provide your professional legal analysis from your designated role perspective, strictly based on Republic of Armenia legislation. Analyze all case documents and audio transcriptions provided above.`;
    }

    // Determine which system prompt to use
    let systemPrompt: string;
    if (role === "precedent_citation") {
      systemPrompt = PRECEDENT_CITATION_PROMPT;
    } else if (role === "deadline_rules") {
      systemPrompt = DEADLINE_RULES_PROMPT;
    } else if (role === "legal_position_comparator") {
      systemPrompt = LEGAL_POSITION_COMPARATOR_PROMPT;
    } else if (role === "hallucination_audit") {
      systemPrompt = HALLUCINATION_AUDIT_PROMPT;
    } else if (role === "draft_deterministic") {
      systemPrompt = DRAFT_DETERMINISTIC_PROMPT;
    } else if (role === "strategy_builder") {
      systemPrompt = STRATEGY_BUILDER_PROMPT;
    } else if (role === "evidence_weakness") {
      systemPrompt = EVIDENCE_WEAKNESS_PROMPT;
    } else if (role === "risk_factors") {
      systemPrompt = RISK_FACTORS_PROMPT;
    } else if (role === "law_update_summary") {
      systemPrompt = LAW_UPDATE_SUMMARY_PROMPT;
    } else if (role === "cross_exam") {
      systemPrompt = CROSS_EXAM_PROMPT;
    } else if (role === "criminal_module" && moduleId) {
      // Legacy criminal module support
      systemPrompt = CRIMINAL_MODULE_PROMPTS[moduleId];
    } else if (isValidAnalysisType(role)) {
      // New 9-module analysis system
      systemPrompt = getFullPrompt(role as AnalysisType);
    } else {
      // Legacy role-based prompts (advocate, prosecutor, judge, aggregator)
      systemPrompt = SYSTEM_PROMPTS[role as keyof typeof SYSTEM_PROMPTS];
    }

    // Build message content with vision support for images
    let messageContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

    if (fileContentsForVision.length > 0) {
      // Use multimodal message format with images
      console.log(`Including ${fileContentsForVision.length} images for Vision analysis`);

      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [{ type: "text", text: userMessage }];

      // Add images (limit to 5 to avoid token overflow)
      const imagesToInclude = fileContentsForVision.slice(0, 5);
      for (const img of imagesToInclude) {
        contentParts.push({
          type: "image_url",
          image_url: {
            url: `data:${img.mimeType};base64,${img.base64}`,
          },
        });
        // Add filename reference
        contentParts.push({
          type: "text",
          text: `[\u054A\u0561\u057F\u056F\u0565\u0580: ${img.name}]`,
        });
      }

      if (fileContentsForVision.length > 5) {
        contentParts.push({
          type: "text",
          text: `\n(\u0546\u0577\u0578\u0582\u0574: ${fileContentsForVision.length - 5} \u056C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u057A\u0561\u057F\u056F\u0565\u0580 \u0579\u0565\u0576 \u0576\u0565\u0580\u0561\u057C\u057E\u0565\u056C \u057D\u0561\u0570\u0574\u0561\u0576\u0561\u0583\u0561\u056F\u0574\u0561\u0576 \u057A\u0561\u057F\u0573\u0561\u057C\u0578\u057E)`,
        });
      }

      messageContent = contentParts;
    } else {
      messageContent = userMessage;
    }

    // Route via centralized OpenAI router (supports multimodal content arrays)
    const { callText, callJSON } = await import("../_shared/openai-router.ts");

    let aiResponseText: string;
    let structuredJson: unknown = null;
    let modelUsed = "unknown";

    try {
      const routerMessages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: messageContent as string | unknown[] },
      ];

      if (role === "precedent_citation") {
        const result = await callJSON("ai-analyze", routerMessages, PRECEDENT_CITATION_SCHEMA, { role });
        structuredJson = result.json;
        modelUsed = result.model_used;
        aiResponseText = JSON.stringify(result.json, null, 2);
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", mode: "precedent_citation", model: modelUsed, latency_ms: result.latency_ms }));
      } else if (role === "deadline_rules") {
        const result = await callJSON("ai-analyze", routerMessages, DEADLINE_RULES_SCHEMA, { role });
        structuredJson = result.json;
        modelUsed = result.model_used;
        aiResponseText = JSON.stringify(result.json, null, 2);
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", mode: "deadline_rules", model: modelUsed, latency_ms: result.latency_ms }));
      } else if (role === "legal_position_comparator") {
        const result = await callText("ai-analyze", routerMessages, { role });
        structuredJson = tryParseJson(result.text);
        modelUsed = result.model_used;
        aiResponseText = structuredJson ? JSON.stringify(structuredJson, null, 2) : result.text;
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", mode: "legal_position_comparator", model: modelUsed, latency_ms: result.latency_ms }));
      } else if (role === "hallucination_audit") {
        const result = await callText("ai-analyze", routerMessages, { role });
        structuredJson = tryParseJson(result.text);
        modelUsed = result.model_used;
        aiResponseText = structuredJson ? JSON.stringify(structuredJson, null, 2) : result.text;
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", mode: "hallucination_audit", model: modelUsed, latency_ms: result.latency_ms }));
      } else if (role === "draft_deterministic") {
        // Cost control: reject if prompt exceeds 15k tokens (~4 chars/token estimate)
        const estimatedPromptTokens = routerMessages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length), 0) / 4;
        if (estimatedPromptTokens > 15000) {
          return new Response(
            JSON.stringify({
              error: "prompt_too_large",
              message: "Request rejected: estimated prompt tokens exceed 15,000 limit. Reduce input size.",
              estimated_tokens: Math.round(estimatedPromptTokens),
              limit: 15000,
            }),
            { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const result = await callText("ai-analyze", routerMessages, { role });
        aiResponseText = result.text;
        modelUsed = result.model_used;
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", mode: "draft_deterministic", model: modelUsed, latency_ms: result.latency_ms }));
      } else if (role === "strategy_builder") {
        const result = await callText("ai-analyze", routerMessages, { role });
        structuredJson = tryParseJson(result.text);
        modelUsed = result.model_used;
        aiResponseText = structuredJson ? JSON.stringify(structuredJson, null, 2) : result.text;
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", mode: "strategy_builder", model: modelUsed, latency_ms: result.latency_ms }));
      } else if (role === "evidence_weakness") {
        const result = await callText("ai-analyze", routerMessages, { role });
        structuredJson = tryParseJson(result.text);
        modelUsed = result.model_used;
        aiResponseText = structuredJson ? JSON.stringify(structuredJson, null, 2) : result.text;
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", mode: "evidence_weakness", model: modelUsed, latency_ms: result.latency_ms }));
      } else if (role === "risk_factors") {
        const result = await callText("ai-analyze", routerMessages, { role });
        structuredJson = tryParseJson(result.text);
        modelUsed = result.model_used;
        aiResponseText = structuredJson ? JSON.stringify(structuredJson, null, 2) : result.text;
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", mode: "risk_factors", model: modelUsed, latency_ms: result.latency_ms }));
      } else if (role === "law_update_summary") {
        const result = await callJSON("ai-analyze", routerMessages, LAW_UPDATE_SUMMARY_SCHEMA, { role });
        structuredJson = result.json;
        modelUsed = result.model_used;
        aiResponseText = JSON.stringify(result.json, null, 2);
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", mode: "law_update_summary", model: modelUsed, latency_ms: result.latency_ms }));
      } else if (role === "cross_exam") {
        const result = await callJSON("ai-analyze", routerMessages, CROSS_EXAM_SCHEMA, { role });
        structuredJson = result.json;
        modelUsed = result.model_used;
        aiResponseText = JSON.stringify(result.json, null, 2);
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", mode: "cross_exam", model: modelUsed, latency_ms: result.latency_ms }));
      } else {
        const result = await callText("ai-analyze", routerMessages);
        aiResponseText = result.text;
        modelUsed = result.model_used;
        console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "ai-analyze", model: modelUsed, latency_ms: result.latency_ms }));
      }
    } catch (routerErr) {
      const status = (routerErr as { status?: number })?.status;
      if (status === 429) {
        await supabase.rpc("log_error", { _error_type: "llm", _error_message: "Rate limit exceeded", _error_details: { status: 429, role }, _case_id: caseId || null });
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please contact administrator." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await supabase.rpc("log_error", { _error_type: "llm", _error_message: "Legal AI router error: " + String(routerErr), _error_details: { role }, _case_id: caseId || null });
      throw new Error("Legal AI router error");
    }

    // For diagnostic engines returning structured JSON
    if ((role === "precedent_citation" || role === "deadline_rules" || role === "legal_position_comparator" || role === "hallucination_audit" || role === "strategy_builder" || role === "evidence_weakness" || role === "risk_factors" || role === "law_update_summary" || role === "cross_exam") && structuredJson) {
      // Save to database if caseId provided
      if (caseId) {
        await supabase.from("ai_analysis").insert({
          case_id: caseId,
          role,
          prompt_used: redactPII(userMessage.substring(0, 2000)),
          response_text: aiResponseText,
          sources_used: sourcesUsed.length > 0 ? sourcesUsed : null,
          created_by: user.id,
        });
      }

      const responseKey = role === "precedent_citation" ? "precedent_data" : role === "deadline_rules" ? "deadline_data" : role === "hallucination_audit" ? "audit_data" : role === "strategy_builder" ? "strategy_data" : role === "evidence_weakness" ? "evidence_weakness_data" : role === "risk_factors" ? "risk_factors_data" : role === "law_update_summary" ? "law_update_data" : role === "cross_exam" ? "cross_exam_data" : "comparator_data";

      // Citation Guard for structured outputs
      const structuredText = JSON.stringify(structuredJson);
      const structUuidPattern = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;
      const structCitedIds = [...new Set([...(structuredText.matchAll(structUuidPattern))].map(m => m[1]))];
      let structCitationsVerified = true;
      let structMissingIds: string[] = [];
      if (structCitedIds.length > 0) {
        const { data: kbM } = await supabase.from("knowledge_base").select("id").in("id", structCitedIds);
        const { data: prM } = await supabase.from("legal_practice_kb").select("id").in("id", structCitedIds);
        const foundSet = new Set([...(kbM || []).map((r: { id: string }) => r.id), ...(prM || []).map((r: { id: string }) => r.id)]);
        const skipIds = new Set([caseId, user.id].filter(Boolean));
        structMissingIds = structCitedIds.filter(id => !foundSet.has(id) && !skipIds.has(id));
        structCitationsVerified = structMissingIds.length === 0;
      }

      return new Response(
        JSON.stringify({
          role,
          analysis: aiResponseText,
          [responseKey]: structuredJson,
          sources: sourcesUsed,
          model_used: modelUsed,
          validation: {
            citations_verified: structCitationsVerified,
            ...(structMissingIds.length > 0 ? { missing_ids: structMissingIds } : {}),
            cited_ids_count: structCitedIds.length,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // For draft_deterministic — plain text document, no disclaimer needed
    if (role === "draft_deterministic") {
      if (caseId) {
        await supabase.from("ai_analysis").insert({
          case_id: caseId,
          role,
          prompt_used: redactPII(userMessage.substring(0, 2000)),
          response_text: aiResponseText,
          sources_used: sourcesUsed.length > 0 ? sourcesUsed : null,
          created_by: user.id,
        });
      }

      return new Response(
        JSON.stringify({
          role,
          analysis: aiResponseText,
          draft_text: aiResponseText,
          sources: sourcesUsed,
          model_used: modelUsed,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Robust JSON parsing to handle truncated/malformed responses
    let aiResponse;
    const response = { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: aiResponseText } }] }) };
    try {
      const responseText = await response.text();

      // Try to parse JSON, with fallback for truncated responses
      try {
        aiResponse = JSON.parse(responseText);
      } catch (parseError) {
        console.error("JSON parse error, attempting recovery:", parseError);

        // Try to extract valid JSON from potentially truncated response
        let cleaned = responseText.trim();

        // Remove any markdown code blocks
        cleaned = cleaned
          .replace(/```json\s*/gi, "")
          .replace(/```\s*/g, "")
          .trim();

        // Find JSON boundaries
        const jsonStart = cleaned.indexOf("{");
        const jsonEnd = cleaned.lastIndexOf("}");

        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

          // Fix common JSON issues
          cleaned = cleaned
            .replace(/,\s*}/g, "}") // Remove trailing commas
            .replace(/,\s*]/g, "]")
            .replace(/[\x00-\x1F\x7F]/g, ""); // Remove control characters

          try {
            aiResponse = JSON.parse(cleaned);
          } catch (secondError) {
            console.error("JSON recovery failed:", secondError);
            // Return a fallback response instead of crashing
            return new Response(
              JSON.stringify({
                role,
                analysis: "\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0579\u0561\u0583\u0561\u0566\u0561\u0576\u0581 \u0574\u0565\u056E \u0567\u0580: \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0576\u0578\u0580\u056B\u0581 \u0583\u0578\u0580\u0571\u0565\u056C \u0561\u057E\u0565\u056C\u056B \u0584\u056B\u0579 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0578\u057E \u056F\u0561\u0574 \u0561\u057E\u0565\u056C\u056B \u057A\u0561\u0580\u0566 \u0570\u0561\u0580\u0581\u0578\u057E:",
                sources: [],
              model_used: modelUsed,
                warning: "Response was truncated",
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        } else {
          console.error("No valid JSON structure found in response");
          return new Response(
            JSON.stringify({
              role,
              analysis: "AI-\u056B \u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0568 \u0569\u0565\u0580\u056B \u0567\u0580: \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0576\u0578\u0580\u056B\u0581 \u0583\u0578\u0580\u0571\u0565\u056C:",
              sources: [],
              model_used: modelUsed,
              warning: "Invalid response structure",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }
    } catch (fetchError) {
      console.error("Error reading AI response:", fetchError);
      throw new Error("Failed to read AI response");
    }

    let analysisText = aiResponse.choices?.[0]?.message?.content || "";

    // Check for truncation indicators
    if (analysisText.endsWith("...") || analysisText.endsWith("\u2026")) {
      analysisText +=
        "\n\n[\u0546\u0577\u0578\u0582\u0574: \u054A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0568 \u056F\u0561\u0580\u0578\u0572 \u0567 \u056F\u0580\u0573\u0561\u057F\u057E\u0561\u056E \u056C\u056B\u0576\u0565\u056C: \u053D\u0576\u0564\u0580\u0578\u0582\u0574 \u0565\u0576\u0584 \u0583\u0578\u0580\u0571\u0565\u056C \u0576\u0578\u0580\u056B\u0581 \u0561\u057E\u0565\u056C\u056B \u0584\u056B\u0579 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0578\u057E:]";
    }

    // Add legal disclaimer
    analysisText += DISCLAIMER_HY;

    // Save to database if caseId provided
    if (caseId) {
      const userId = user.id;

      // Determine the role/analysis_type to store
      let roleToStore: string;
      if (role === "criminal_module" && moduleId) {
        // Legacy criminal module format
        roleToStore = `criminal_module:${moduleId}`;
      } else if (isValidAnalysisType(role)) {
        // New 9-module analysis system - store analysis type directly
        roleToStore = role;
      } else {
        // Legacy role-based analysis
        roleToStore = role;
      }

      await supabase.from("ai_analysis").insert({
        case_id: caseId,
        role: roleToStore,
        prompt_used: redactPII(userMessage.substring(0, 2000)),
        response_text: analysisText,
        sources_used: sourcesUsed.length > 0 ? sourcesUsed : null,
        created_by: userId,
      });
    }

    // Log API usage for cost tracking
    const tokensUsed = aiResponse.usage?.total_tokens || 0;
    const estimatedCost = tokensUsed * 0.000001;

    await supabase.rpc("log_api_usage", {
      _service_type: "llm",
      _model_name: modelUsed,
      _tokens_used: tokensUsed,
      _estimated_cost: estimatedCost,
      _metadata: { role, caseId: caseId || null },
    });

    // === FIX 2 v1.1 (P0/P1): Contract-based Citation Guard ===
    // Extract IDs only after citation markers (ID: / ID： / ID՝), not all UUIDs in text
    const MAX_CITED_IDS = 50;
    const citationMarkerPattern = /ID(?::|：|՝)\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:\s*[,;]\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}))*/gi;
    const extractedIds: string[] = [];
    for (const match of analysisText.matchAll(citationMarkerPattern)) {
      const fullMatch = match[0];
      const uuidsInMatch = fullMatch.matchAll(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})/gi);
      for (const u of uuidsInMatch) extractedIds.push(u[1].toLowerCase());
    }
    const allCitedIds = [...new Set(extractedIds)];

    let citationsVerified = true;
    let missingIds: string[] = [];
    let citationReason: string = "ok";

    if (allCitedIds.length > MAX_CITED_IDS) {
      citationsVerified = false;
      citationReason = "too_many_citations";
      console.warn(JSON.stringify({
        ts: new Date().toISOString(), lvl: "warn", fn: "ai-analyze",
        msg: "CITATION_GUARD: too many cited IDs, skipping verification",
        cited_ids_count: allCitedIds.length, max: MAX_CITED_IDS, role,
      }));
    } else if (allCitedIds.length > 0) {
      // Verify against KB (knowledge_base) and Practice (legal_documents) tables
      const { data: kbMatches, error: kbErr } = await supabase
        .from("knowledge_base")
        .select("id")
        .in("id", allCitedIds);
      const { data: practiceMatches, error: practiceErr } = await supabase
        .from("legal_documents")
        .select("id")
        .in("id", allCitedIds);

      if (kbErr || practiceErr) {
        citationsVerified = false;
        citationReason = "verification_query_failed";
        console.error(JSON.stringify({
          ts: new Date().toISOString(), lvl: "error", fn: "ai-analyze",
          msg: "CITATION_GUARD: DB verification query failed",
          kb_error: kbErr?.message?.substring(0, 200),
          practice_error: practiceErr?.message?.substring(0, 200),
        }));
      } else {
        const foundIds = new Set([
          ...(kbMatches || []).map((r: { id: string }) => r.id),
          ...(practiceMatches || []).map((r: { id: string }) => r.id),
        ]);
        missingIds = allCitedIds.filter(id => !foundIds.has(id));
        citationsVerified = missingIds.length === 0;
        if (!citationsVerified) {
          citationReason = "unverified_ids";
          console.warn(JSON.stringify({
            ts: new Date().toISOString(), lvl: "warn", fn: "ai-analyze",
            msg: "CITATION_GUARD: unverified IDs in output",
            missing_ids: missingIds, role,
          }));
        }
      }
    }

    return new Response(
      JSON.stringify({
        role,
        moduleId: moduleId || null,
        analysis: analysisText,
        sources: sourcesUsed,
        model_used: modelUsed,
        ...(temporalWarning ? { temporal_warning: temporalWarning } : {}),
        validation: {
          citations_verified: citationsVerified,
          ...(missingIds.length > 0 ? { missing_ids: missingIds } : {}),
          cited_ids_count: allCitedIds.length,
          reason: citationReason,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Legal AI error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Legal analysis failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
