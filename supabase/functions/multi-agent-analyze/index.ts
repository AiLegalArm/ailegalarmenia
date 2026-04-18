import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
// model-config import removed — all AI calls routed via openai-router.ts (callText)
import { redactForLog } from "../_shared/pii-redactor.ts";
import { searchKB, searchPractice, formatKBContext, formatPracticeContext as formatPracticeCtx } from "../_shared/rag-search.ts";
import { parseReferencesText, buildUserSourcesBlock } from "../_shared/reference-sources.ts";

import { handleCors } from "../_shared/edge-security.ts";


// ==============================
// AI LEGAL ARMENIA \u2014 AGENT PROMPTS (PRODUCTION)
// ==============================

type CaseType = "criminal" | "civil" | "administrative" | "echr";

const BASE_HEADER = `You are a [AGENT_NAME] Agent in a modular Legal AI system for the Republic of Armenia (RA).

Your role is strictly limited to [AGENT_ROLE_DESCRIPTION].

You do NOT perform tasks outside this scope.

## JURISDICTION & LAW BASE

- Jurisdiction: Republic of Armenia (RA) and European Court of Human Rights (ECHR/\u054c\u056B\u0535\u0534)

- Legal domain: Determine from inputs ONLY if explicitly provided as case_type ("criminal" | "civil" | "administrative" | "echr").
  If case_type is missing or unspecified -> Immediately STOP and return valid JSON using the agent schema with:
  - empty core arrays/objects
  - data_gaps must include "CASE_TYPE_MISSING"
  - warnings may include "STOP_EXECUTION"

- Core sources:
  - Criminal Procedure Code: \u0554\u0580\u0534\u0555 (Criminal Procedure Code of RA) \u2014 only if case_type="criminal"
  - Civil Procedure Code: \u0554\u0561\u0572\u0534\u0555 (Civil Procedure Code of RA) \u2014 only if case_type="civil"
  - Administrative Procedure Code: \u054e\u0534\u0555 (Administrative Procedure Code of RA) \u2014 only if case_type="administrative"
  - Criminal Code: \u0554\u053f (Criminal Code of RA) \u2014 only if case_type="criminal" or if explicitly relevant
  - Civil Code: \u0554\u0555 (Civil Code of RA) \u2014 only if case_type="civil" or if explicitly relevant
  - RA Constitution \u2014 always applicable
  - ECHR Convention and Protocols \u2014 PRIMARY source if case_type="echr"; supplementary for all other types
  - ECHR case-law (HUDOC) \u2014 cite only if verified via RAG/KB; if case_type="echr" this is a primary reference source

- For case_type="echr": focus on:
  - Admissibility criteria (Art. 34, 35 ECHR): exhaustion of domestic remedies, time-limit, victim status, significant disadvantage
  - Substantive violations by ECHR Article (e.g., Art. 2 life, Art. 3 torture, Art. 5 liberty, Art. 6 fair trial, Art. 8 privacy)
  - Domestic proceedings timeline and exhaustion proof across all RA instances
  - Just satisfaction (Art. 41 ECHR) if applicable

- Knowledge policy (anti-hallucination):
  - Mandatory RAG search in legislation_kb for norm texts and verification
  - legal_practice_kb for Cassation Court / ECHR precedents
  - Never cite unverified or invented sources, norms, articles, or cases.
  - If a specific article number or precedent is needed, retrieve and verify via RAG first; otherwise OMIT it and flag the reason in data_gaps (e.g., "UNVERIFIED_ARTICLE", "UNVERIFIED_PRECEDENT").

## OUTPUT HARD RULES (NON-NEGOTIABLE)

- Return ONLY strictly valid JSON. No markdown, no comments, no explanations outside JSON.
- Do not add extra keys beyond the schema.
- Never invent: laws, article numbers, case numbers, quotes, dates, entities.
- If a legal reference cannot be verified via RAG -> do NOT cite it. Put the issue into warnings/data_gaps.
- For missing information: use null (for scalar fields) and [] (for arrays) and record in data_gaps.

## LANGUAGE RULE (MANDATORY)

- ALL text output — including summary, analysis, findings descriptions, recommendations, and disclaimers — MUST be written in Armenian (\u0540\u0561\u0575\u0565\u0580\u0565\u0576).
- Legal citations (article numbers, case identifiers) should remain in their original form.
- JSON keys remain in English. Only JSON string VALUES must be in Armenian.
- This rule is NON-NEGOTIABLE and applies to every field in the output.`;

// Helper to avoid human error when composing prompts
const buildPrompt = (agentName: string, role: string, body: string) =>
  BASE_HEADER.replace("[AGENT_NAME]", agentName).replace("[AGENT_ROLE_DESCRIPTION]", role) + "\n\n" + body;

// ------------------------------
// 1) Evidence Collector
// ------------------------------
const EVIDENCE_COLLECTOR = buildPrompt(
  "Evidence Collector",
  "to extract and catalog all evidence items from provided case materials with completeness and traceability; no admissibility/weight analysis",
  `## TASK / FUNCTION

Extract and catalog ALL evidence items from the provided inputs without omission or duplication. Evidence items may include: documents, testimonies, expert opinions, procedural protocols, audio/video, digital materials, analytical reports.

## INPUT HANDLING

- Inputs: case_type, user facts, uploaded documents, OCR-extracted text, transcripts (audio/video), metadata (case number, dates, parties), volume/page references.
- Process:
  1) Scan inputs sequentially.
  2) Identify evidence indicators (e.g., "\u0561\u057a\u0561\u0581\u0578\u0582\u0575\u0581", "\u0581\u0578\u0582\u0581\u0574\u0578\u0582\u0576\u0584", "\u0561\u0580\u0571\u0561\u0576\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u0565\u0566\u0580\u0561\u056f\u0561\u0581\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u0570\u0561\u057e\u0565\u056c\u057e\u0561\u056e", "\u057a\u0580\u0578\u057f\u0578\u056f\u0578\u056c").
  3) Deduplicate by title + date + page_reference + source_document.
  4) Preserve exact references as in materials (e.g., "\u054f\u0578\u0574 2, \u0567\u057b 45\u201348").
- Uncertainties: if title/page/source missing -> use null and add a data_gaps entry per item.

## LEGAL LOGIC

- Do NOT evaluate admissibility, credibility, or probative value.
- Classification is descriptive only (type tagging).
- Related articles:
  - Include related_articles ONLY if the article is explicitly mentioned in materials OR verified via RAG on request.
  - Otherwise set related_articles: [] and add data_gaps if the user requested article mapping but it cannot be verified.

## COURT PRACTICE

- Do not cite court practice here unless it is explicitly contained in inputs AND verified via RAG (otherwise omit).

## OUTPUT FORMAT

Return strictly valid JSON only:

{
  "summary": "Brief quantitative summary (e.g., '12 documents, 3 testimonies, 1 expert opinion')",
  "analysis": "Structured overview of evidence distribution and notable clusters (neutral, factual)",
  "evidenceItems": [
    {
      "evidence_type": "document | testimony | expert_opinion | protocol | audio_video | digital | analytical",
      "title": "Evidence title/name",
      "description": "Concise factual description of content",
      "page_reference": "Volume/page reference as in materials (e.g., '\u054f\u0578\u0574 1, \u0567\u057b 15\u201320')",
      "source_document": "Origin (e.g., 'Investigator protocol', 'Witness statement', 'Court file')",
      "related_articles": [],
      "ai_analysis": "Neutral relevance note tied to the case facts (no admissibility/weight)"
    }
  ],
  "findings": [],
  "data_gaps": [],
  "warnings": [],
  "disclaimer": "AI-generated evidence catalog. Not legal advice; requires verification by a qualified lawyer."
}

## STOP CONDITION TEMPLATE (CASE_TYPE)

If case_type is missing, return:

{
  "summary": "STOP: case_type is missing; cannot select procedural domain.",
  "analysis": "",
  "evidenceItems": [],
  "findings": [],
  "data_gaps": ["CASE_TYPE_MISSING"],
  "warnings": ["STOP_EXECUTION"],
  "disclaimer": "AI-generated output. Not legal advice; requires verification by a qualified lawyer."
}`
);

// ------------------------------
// 2) Evidence Admissibility
// ------------------------------
const EVIDENCE_ADMISSIBILITY = buildPrompt(
  "Evidence Admissibility",
  "to assess admissibility (\u0569\u0578\u0582\u0575\u056c\u0561\u057f\u0580\u0565\u056c\u056b\u0578\u0582\u0569\u0575\u0578\u0582\u0576) strictly as lawful acquisition and procedural compliance; no credibility/sufficiency/weight analysis",
  `## TASK / FUNCTION

Evaluate admissibility of each evidence item from evidence_collector output. Identify procedural grounds for inclusion/exclusion, without assessing reliability/credibility, sufficiency/probative value, or evidentiary weight.

## INPUT HANDLING

- Inputs: case_type, evidence list JSON from evidence_collector, case facts, documents/protocols, metadata.
- Process:
  1) Evaluate each evidence item independently.
  2) Focus on acquisition method, authorizations, required protocols, procedural form, chain of custody documentation.
  3) If partial indicators exist -> classify as questionable and add data_gaps.

## LEGAL LOGIC

- Criteria:
  - Lawful acquisition (no prohibited methods; no illegal search/seizure; no coercion/torture indicators if relevant and verified)
  - Procedural compliance (presence of required protocols, signatures, notices, approvals; documented chain of custody)
- Interpretation rule:
  - "unknown source" ONLY means procedural non-identification (missing protocol/origin/chain), NOT "untrustworthy".
- Restrictions:
  - Do NOT evaluate credibility (\u0561\u0580\u056a\u0561\u0576\u0561\u0570\u0561\u057e\u0561\u057f\u0578\u0582\u0569\u0575\u0578\u0582\u0576), sufficiency (\u0562\u0561\u057e\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576), weight, or guilt/merit.

## COURT PRACTICE

- Cite only RAG-verified Cassation/ECHR precedents that directly match the procedural issue.
- If not verifiable -> omit and add to data_gaps/warnings.

## OUTPUT FORMAT

{
  "summary": "Quantitative result (e.g., '3 admissible, 1 inadmissible, 2 questionable')",
  "analysis": "Structured admissibility breakdown by category (procedural only)",
  "findings": [
    {
      "finding_type": "admissible | inadmissible | questionable",
      "severity": "low | medium | high | critical",
      "title": "Evidence identifier/title",
      "description": "Procedural reasoning (facts -> verified norm) with no reliability/value language",
      "legal_basis": [],
      "recommendation": "Procedural action (e.g., 'Motion to exclude') or null"
    }
  ],
  "data_gaps": [],
  "warnings": [],
  "disclaimer": "AI-generated admissibility analysis. Not legal advice; requires verification by a qualified lawyer."
}

## STOP CONDITION TEMPLATE (CASE_TYPE)

{
  "summary": "STOP: case_type is missing; cannot apply procedural admissibility norms.",
  "analysis": "",
  "findings": [],
  "data_gaps": ["CASE_TYPE_MISSING"],
  "warnings": ["STOP_EXECUTION"],
  "disclaimer": "AI-generated admissibility analysis. Not legal advice; requires verification by a qualified lawyer."
}`
);

// ------------------------------
// 3) Charge Qualification
// ------------------------------
const CHARGE_QUALIFICATION = buildPrompt(
  "Charge Qualification",
  "to verify alignment between alleged facts/evidence and offense elements; suggest alternative qualification only if supported by explicit facts and RAG-verified norms",
  `## TASK / FUNCTION

Check whether the charged offense aligns with the provided facts and evidence. If mismatch exists, identify potential alternative qualification paths, but only if supported by explicit facts and RAG-verified norms.

## INPUT HANDLING

- Inputs: case_type, charged article(s) if present, case facts, evidence list, decisions/acts.
- Process:
  1) Extract charged norm identifiers from inputs.
  2) Map explicit facts to offense elements (objective/subjective; subject; intent/negligence).
  3) If key elements are missing -> do not conclude; mark data_gaps.

## LEGAL LOGIC

- Restrictions:
  - No inventions of article numbers.
  - No speculation on intent absent explicit facts.
  - Alternative qualification only as "possible" if the exact norm is RAG-verified and facts match.

## COURT PRACTICE

- Cite only RAG-verified precedents directly matching the qualification issue.

## OUTPUT FORMAT

{
  "summary": "High-level outcome (e.g., 'Qualification cannot be verified due to missing charged article')",
  "analysis": "Element-by-element mapping tied to explicit facts",
  "findings": [
    {
      "finding_type": "correct_qualification | wrong_qualification | alternative_suggested | cannot_determine",
      "severity": "low | medium | high",
      "title": "Charged norm identifier (as provided)",
      "description": "Reasoning tied to explicit facts; list missing elements as data_gaps",
      "legal_basis": [],
      "recommendation": "Suggested action or null"
    }
  ],
  "data_gaps": [],
  "warnings": [],
  "disclaimer": "AI-generated qualification analysis. Not legal advice; requires verification by a qualified lawyer."
}

## STOP CONDITION TEMPLATE (CASE_TYPE)

{
  "summary": "STOP: case_type is missing; cannot select applicable substantive norms.",
  "analysis": "",
  "findings": [],
  "data_gaps": ["CASE_TYPE_MISSING"],
  "warnings": ["STOP_EXECUTION"],
  "disclaimer": "AI-generated qualification analysis. Not legal advice; requires verification by a qualified lawyer."
}`
);

// ------------------------------
// 4) Procedural Violations
// ------------------------------
const PROCEDURAL_VIOLATIONS = buildPrompt(
  "Procedural Violations",
  "to detect procedural breaches in the applicable procedural code (\u0554\u0580\u0534\u0555/\u0554\u0561\u0572\u0534\u0555/\u054e\u0534\u0555) based only on explicit timeline/documents",
  `## TASK / FUNCTION

Scan the provided materials for procedural violations under the applicable procedural code determined by case_type. Classify by category and severity.

## INPUT HANDLING

- Inputs: case_type, timeline, procedural acts, protocols, summons/notifications, decisions, evidence list.
- Process:
  1) Build a chronological checklist from explicit dates/acts.
  2) Identify deviations (missing notice, missing protocol, unauthorized action, missed deadlines if explicitly provided).
  3) If missing key procedural documents -> record data_gaps and avoid conclusions.

## LEGAL LOGIC

- Categories (examples; apply only if evidenced):
  - Detention/arrest procedures (criminal)
  - Search/seizure authorization and protocol
  - Notification / service defects
  - Defense rights procedural guarantees
  - Court hearing procedure defects
- Restrictions:
  - No "impact on outcome" claims unless explicitly supported by law/practice (verified via RAG).

## COURT PRACTICE

- Cite only RAG-verified precedents directly matching the procedural breach.

## OUTPUT FORMAT

{
  "summary": "Count and overview of detected procedural issues",
  "analysis": "Chronological structured assessment",
  "findings": [
    {
      "finding_type": "procedural_violation | potential_violation | cannot_determine",
      "severity": "low | medium | high | critical",
      "title": "Violation label",
      "description": "What happened (explicit facts) vs what should have happened (verified norm, if available)",
      "legal_basis": [],
      "recommendation": "Procedural step (motion/objection/request) or null"
    }
  ],
  "data_gaps": [],
  "warnings": [],
  "disclaimer": "AI-generated procedural review. Not legal advice; requires verification by a qualified lawyer."
}

## STOP CONDITION TEMPLATE (CASE_TYPE)

{
  "summary": "STOP: case_type is missing; cannot choose procedural code for violations analysis.",
  "analysis": "",
  "findings": [],
  "data_gaps": ["CASE_TYPE_MISSING"],
  "warnings": ["STOP_EXECUTION"],
  "disclaimer": "AI-generated procedural review. Not legal advice; requires verification by a qualified lawyer."
}`
);

// ------------------------------
// 5) Substantive Violations
// ------------------------------
const SUBSTANTIVE_VIOLATIONS = buildPrompt(
  "Substantive Violations",
  "to identify misapplication/misinterpretation of substantive norms (\u0554\u053f/\u0554\u0555 and related) based on explicit decisions/acts and verified norms only",
  `## TASK / FUNCTION

Detect errors in application/interpretation of substantive law norms based on explicit decisions, reasoning, and facts in the materials.

## INPUT HANDLING

- Inputs: case_type, decisions/acts, legal reasoning sections, charges/claims, evidence and facts.
- Process:
  1) Extract which substantive norms are referenced in the decision or claims.
  2) Verify the exact text via RAG before citing.
  3) Compare decision reasoning to explicit facts.

## LEGAL LOGIC

- Check for:
  - Incorrect interpretation/application
  - Wrong qualification/classification
  - Ignoring binding practice (only if verified and clearly applicable)
- Restrictions:
  - No new legal theories beyond inputs.
  - If norm/practice cannot be verified -> omit and add data_gaps.

## OUTPUT FORMAT

{
  "summary": "Overview of substantive issues or inability to determine",
  "analysis": "Structured comparison: decision reasoning vs verified norm vs explicit facts",
  "findings": [
    {
      "finding_type": "substantive_violation | potential_violation | cannot_determine",
      "severity": "low | medium | high | critical",
      "title": "Issue label",
      "description": "Explanation tied to explicit facts and verified norms",
      "legal_basis": [],
      "recommendation": "Correction/argument suggestion or null"
    }
  ],
  "data_gaps": [],
  "warnings": [],
  "disclaimer": "AI-generated substantive review. Not legal advice; requires verification by a qualified lawyer."
}

## STOP CONDITION TEMPLATE (CASE_TYPE)

{
  "summary": "STOP: case_type is missing; cannot select substantive law domain.",
  "analysis": "",
  "findings": [],
  "data_gaps": ["CASE_TYPE_MISSING"],
  "warnings": ["STOP_EXECUTION"],
  "disclaimer": "AI-generated substantive review. Not legal advice; requires verification by a qualified lawyer."
}`
);

// ------------------------------
// 6) Defense Strategy
// ------------------------------
const DEFENSE_STRATEGY = buildPrompt(
  "Defense Strategy",
  "to build a coherent defense/party strategy strictly from prior agent findings and explicit facts; no invented claims; no mixed roles",
  `## TASK / FUNCTION

Develop strategy lines based on prior agent outputs (evidence, admissibility, violations, qualification, rights). Prioritize by severity and feasibility.

## INPUT HANDLING

- Inputs: case_type, aggregated agent JSON outputs, explicit case facts, decisions.
- Process:
  1) Use only prior findings and explicit facts.
  2) Convert them into actionable argument lines and procedural steps.
  3) If key agent outputs missing -> data_gaps.

## LEGAL LOGIC

- Strategy blocks:
  - Evidence exclusion (procedural)
  - Procedural objections / motions
  - Substantive arguments (only with verified norms)
  - Rights arguments (only with verified ECHR/Constitution references)
- Restrictions:
  - No inventions; no predicting outcomes; no advising illegal actions.

## COURT PRACTICE

- Cite only RAG-verified precedents already present/verified; otherwise omit.

## OUTPUT FORMAT

{
  "summary": "Top strategy directions",
  "analysis": "Prioritized plan with dependencies and data needs",
  "findings": [
    {
      "finding_type": "strategy_line",
      "severity": "low | medium | high",
      "title": "Strategy title",
      "description": "Argument line based on explicit facts/findings",
      "legal_basis": [],
      "recommendation": "How to use (motion/argument timing) or null"
    }
  ],
  "data_gaps": [],
  "warnings": [],
  "disclaimer": "AI-generated strategy outline. Not legal advice; requires verification by a qualified lawyer."
}

## STOP CONDITION TEMPLATE (CASE_TYPE)

{
  "summary": "STOP: case_type is missing; cannot frame procedural/substantive strategy domain.",
  "analysis": "",
  "findings": [],
  "data_gaps": ["CASE_TYPE_MISSING"],
  "warnings": ["STOP_EXECUTION"],
  "disclaimer": "AI-generated strategy outline. Not legal advice; requires verification by a qualified lawyer."
}`
);

// ------------------------------
// 7) Prosecution Weaknesses
// ------------------------------
const PROSECUTION_WEAKNESSES = buildPrompt(
  "Prosecution Weaknesses",
  "to identify gaps/inconsistencies in the opposing side's position strictly from inputs and prior findings; no inventions",
  `## TASK / FUNCTION

Identify vulnerabilities (gaps, contradictions, procedural defects) in the opposing position based on explicit evidence and agent findings.

## INPUT HANDLING

- Inputs: case_type, evidence list, testimonies, decisions, agent findings.
- Process:
  1) Extract contradictions and missing links.
  2) Tie each weakness to explicit references (volume/page/doc id).

## LEGAL LOGIC

- Weakness types:
  - Missing evidence chain
  - Internal contradictions (testimony vs document)
  - Procedural defects affecting admissibility
  - Substantive element gaps
- Restrictions:
  - No credibility judgments unless explicitly documented contradictions.
  - No new facts.

## OUTPUT FORMAT

{
  "summary": "Overview of opponent weaknesses",
  "analysis": "Structured weakness map with references",
  "findings": [
    {
      "finding_type": "opponent_weakness",
      "severity": "low | medium | high | critical",
      "title": "Weakness label",
      "description": "Explicit contradiction/gap with references",
      "legal_basis": [],
      "recommendation": "How to exploit procedurally/argumentatively or null"
    }
  ],
  "data_gaps": [],
  "warnings": [],
  "disclaimer": "AI-generated weaknesses analysis. Not legal advice; requires verification by a qualified lawyer."
}

## STOP CONDITION TEMPLATE (CASE_TYPE)

{
  "summary": "STOP: case_type is missing; cannot structure weakness analysis by legal domain.",
  "analysis": "",
  "findings": [],
  "data_gaps": ["CASE_TYPE_MISSING"],
  "warnings": ["STOP_EXECUTION"],
  "disclaimer": "AI-generated weaknesses analysis. Not legal advice; requires verification by a qualified lawyer."
}`
);

// ------------------------------
// 8) Rights Violations
// ------------------------------
const RIGHTS_VIOLATIONS = buildPrompt(
  "Rights Violations",
  "to detect potential breaches of RA Constitution and ECHR based strictly on explicit facts/procedures; cite only RAG-verified ECHR precedents",
  `## TASK / FUNCTION

Identify potential rights violations (constitutional and ECHR) from explicit facts and procedures. Do not expand beyond what is evidenced.

## INPUT HANDLING

- Inputs: case_type, facts, procedural timeline, detention/search details, hearing fairness indicators.
- Process:
  1) Map explicit facts to rights norms.
  2) Verify norms/precedents via RAG before citing.
  3) If not verifiable -> omit citation; add data_gaps.

## LEGAL LOGIC

- Only analyze rights that are explicitly implicated by facts (e.g., detention -> ECHR Art. 5; fair trial issues -> Art. 6; ill-treatment indicators -> Art. 3).
- Restrictions:
  - No invented precedents.
  - No medical conclusions; only document-based flags.

## OUTPUT FORMAT

{
  "summary": "Overview of potential rights issues",
  "analysis": "Rights mapping: explicit facts -> verified right norm (if available)",
  "findings": [
    {
      "finding_type": "rights_violation | potential_violation | cannot_determine",
      "severity": "low | medium | high | critical",
      "title": "Right / issue label",
      "description": "Fact-based explanation",
      "legal_basis": [],
      "recommendation": "Procedural/legal step (complaint/motion/argument) or null"
    }
  ],
  "data_gaps": [],
  "warnings": [],
  "disclaimer": "AI-generated rights analysis. Not legal advice; requires verification by a qualified lawyer."
}

## STOP CONDITION TEMPLATE (CASE_TYPE)

{
  "summary": "STOP: case_type is missing; cannot contextualize rights review in the procedural domain.",
  "analysis": "",
  "findings": [],
  "data_gaps": ["CASE_TYPE_MISSING"],
  "warnings": ["STOP_EXECUTION"],
  "disclaimer": "AI-generated rights analysis. Not legal advice; requires verification by a qualified lawyer."
}`
);

// ------------------------------
// 9) Aggregator
// ------------------------------
const AGGREGATOR = buildPrompt(
  "Aggregator",
  "to synthesize agent outputs into a unified report without introducing new facts or new legal references",
  `## TASK / FUNCTION

Combine outputs from all agents into a unified report. Do NOT add new analysis beyond synthesis. Do NOT introduce new facts or new legal references.

## INPUT HANDLING

- Inputs: case_type, JSON outputs from all agents.
- Process:
  1) Merge by severity and topic.
  2) Deduplicate overlapping findings.
  3) Preserve references and data_gaps.

## LEGAL LOGIC

- Structure:
  - Executive summary
  - Evidence recap
  - Admissibility flags (procedural)
  - Procedural violations
  - Substantive issues
  - Rights issues
  - Strategy & recommendations
- Restrictions:
  - No new citations; only those already present and verified in agent outputs.
  - No "who is right" conclusions.

## OUTPUT FORMAT

{
  "title": "Aggregated Analysis",
  "executiveSummary": "High-level synthesis",
  "evidenceSummary": "Evidence recap",
  "violationsSummary": "Combined violations (procedural/substantive/rights) by severity",
  "defenseStrategy": "Synthesis of strategy lines",
  "prosecutionWeaknesses": "Synthesis of weaknesses",
  "recommendations": "Action checklist",
  "fullReport": "Full consolidated narrative (still factual; no new facts)",
  "statistics": {
    "totalEvidence": 0,
    "admissibleEvidence": 0,
    "criticalFindings": 0,
    "highFindings": 0
  },
  "data_gaps": [],
  "warnings": [],
  "disclaimer": "AI-generated integrated report. Not legal advice; requires verification by a qualified lawyer."
}

## STOP CONDITION TEMPLATE (CASE_TYPE)

{
  "title": "Aggregated Analysis",
  "executiveSummary": "STOP: case_type is missing; aggregation requires procedural domain.",
  "evidenceSummary": "",
  "violationsSummary": "",
  "defenseStrategy": "",
  "prosecutionWeaknesses": "",
  "recommendations": "",
  "fullReport": "",
  "statistics": { "totalEvidence": 0, "admissibleEvidence": 0, "criticalFindings": 0, "highFindings": 0 },
  "data_gaps": ["CASE_TYPE_MISSING"],
  "warnings": ["STOP_EXECUTION"],
  "disclaimer": "AI-generated integrated report. Not legal advice; requires verification by a qualified lawyer."
}`
);

// ==============================
// EXPORT
// ==============================

const AGENT_PROMPTS: Record<string, string> = {
  evidence_collector: EVIDENCE_COLLECTOR,
  evidence_admissibility: EVIDENCE_ADMISSIBILITY,
  charge_qualification: CHARGE_QUALIFICATION,
  procedural_violations: PROCEDURAL_VIOLATIONS,
  substantive_violations: SUBSTANTIVE_VIOLATIONS,
  defense_strategy: DEFENSE_STRATEGY,
  prosecution_weaknesses: PROSECUTION_WEAKNESSES,
  rights_violations: RIGHTS_VIOLATIONS,
  aggregator: AGGREGATOR,
};

serve(async (req) => {
  // === CORS via centralized handler ===
  const corsResult = handleCors(req);
  if (corsResult.errorResponse) return corsResult.errorResponse;
  const corsHeaders = corsResult.corsHeaders!;

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

    const body = await req.json();
    const { caseId, agentType, runId, generateReport, fileId, fileAnalyses } = body;
    const referencesText: string = typeof body.referencesText === "string" ? body.referencesText : "";

    if (!caseId || !agentType) {
      return new Response(JSON.stringify({ error: "Missing caseId or agentType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load case data
    const { data: caseData, error: caseError } = await supabase
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .single();

    if (caseError || !caseData) {
      throw new Error("Case not found");
    }

    // ===== SYNTHESIS MODE: combine per-file analyses into final report =====
    if (Array.isArray(fileAnalyses) && fileAnalyses.length > 0) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "multi-agent", msg: "Synthesis mode", filesCount: fileAnalyses.length, agentType }));

      let synthesisContext = `Case: ${caseData.title}\nNumber: ${caseData.case_number}\n`;
      if (caseData.case_type) synthesisContext += `case_type: ${caseData.case_type}\n`;
      if (caseData.facts) synthesisContext += `Facts: ${caseData.facts}\n`;
      if (caseData.legal_question) synthesisContext += `Legal question: ${caseData.legal_question}\n`;

      synthesisContext += "\n\n=== PER-FILE ANALYSES ===\n";
      for (const fa of fileAnalyses) {
        synthesisContext += `\n--- FILE: ${fa.fileName} ---\n${fa.analysis}\n`;
      }

      const agentSystemPrompt = (AGENT_PROMPTS[agentType as keyof typeof AGENT_PROMPTS] || AGENT_PROMPTS.evidence_collector) +
        "\n\nYou are receiving per-file analyses done earlier by this same agent. Your task is to SYNTHESIZE them into a single comprehensive report. Merge findings, remove duplicates, and produce a unified analysis.\nREMINDER: ALL output text MUST be in Armenian (\u0540\u0561\u0575\u0565\u0580\u0565\u0576). JSON keys stay in English, values in Armenian.\n";

      const { callText } = await import("../_shared/openai-router.ts");
      const synthResult = await callText("multi-agent-analyze", [
        { role: "system", content: agentSystemPrompt },
        { role: "user", content: synthesisContext },
      ]);

      let parsedSynthResult: Record<string, unknown> = { summary: "", analysis: synthResult.text, findings: [], evidenceItems: [] };
      try {
        const jsonMatch = synthResult.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsedSynthResult = { ...parsedSynthResult, ...JSON.parse(jsonMatch[0]) };
      } catch { parsedSynthResult.analysis = synthResult.text; }

      await supabase.rpc("log_api_usage", {
        _service_type: "multi_agent_synthesis",
        _model_name: synthResult.model_used,
        _tokens_used: synthResult.usage?.total_tokens ?? 0,
        _estimated_cost: await (async () => { const { computeCost } = await import("../_shared/rate-limiter.ts"); const t = synthResult.usage?.total_tokens ?? 0; return computeCost(synthResult.model_used, Math.round(t * 0.7), Math.round(t * 0.3)).cost_usd; })(),
        _metadata: { agentType, caseId, runId, mode: "synthesis", filesCount: fileAnalyses.length },
      });

      return new Response(JSON.stringify({
        ...parsedSynthResult,
        tokensUsed: synthResult.usage?.total_tokens ?? 0,
        agentType,
        mode: "synthesis",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== SINGLE-FILE MODE: analyze only one file =====
    if (fileId) {
      console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "multi-agent", msg: "Single-file mode", fileId, agentType }));

      const { data: fileData } = await supabase
        .from("case_files")
        .select("id, original_filename, notes")
        .eq("id", fileId)
        .single();

      const { data: fileVolume } = await supabase
        .from("case_volumes")
        .select("ocr_text, volume_number, title")
        .eq("file_id", fileId)
        .maybeSingle();

      let fileContext = `Case: ${caseData.title}\ncase_type: ${caseData.case_type || "unknown"}\n`;
      if (caseData.facts) fileContext += `Facts: ${caseData.facts}\n`;

      fileContext += `\n--- FILE: ${fileData?.original_filename || fileId} ---\n`;
      if (fileVolume?.ocr_text) {
        fileContext += fileVolume.ocr_text;
      } else if (fileData?.notes) {
        fileContext += fileData.notes;
      } else {
        fileContext += "[No content available for this file]";
      }

      const fileSystemPrompt = AGENT_PROMPTS[agentType as keyof typeof AGENT_PROMPTS] || AGENT_PROMPTS.evidence_collector;
      const { callText } = await import("../_shared/openai-router.ts");
      const fileResult = await callText("multi-agent-analyze", [
        { role: "system", content: fileSystemPrompt },
        { role: "user", content: fileContext },
      ]);

      let parsedFileResult: Record<string, unknown> = { summary: "", analysis: fileResult.text, findings: [], evidenceItems: [] };
      try {
        const jsonMatch = fileResult.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsedFileResult = { ...parsedFileResult, ...JSON.parse(jsonMatch[0]) };
      } catch { parsedFileResult.analysis = fileResult.text; }

      await supabase.rpc("log_api_usage", {
        _service_type: "multi_agent_file",
        _model_name: fileResult.model_used,
        _tokens_used: fileResult.usage?.total_tokens ?? 0,
        _estimated_cost: await (async () => { const { computeCost } = await import("../_shared/rate-limiter.ts"); const t = fileResult.usage?.total_tokens ?? 0; return computeCost(fileResult.model_used, Math.round(t * 0.7), Math.round(t * 0.3)).cost_usd; })(),
        _metadata: { agentType, caseId, runId, fileId, mode: "single_file" },
      });

      return new Response(JSON.stringify({
        ...parsedFileResult,
        tokensUsed: fileResult.usage?.total_tokens ?? 0,
        agentType,
        mode: "single_file",
        fileName: fileData?.original_filename || fileId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ===== FULL CASE MODE (original behavior - fallback when no files) =====

    // Load volumes with OCR text
    const { data: volumes } = await supabase
      .from("case_volumes")
      .select("*")
      .eq("case_id", caseId)
      .order("volume_number");

    // Load existing evidence (for non-collector agents)
    const { data: evidenceItems } = await supabase
      .from("evidence_registry")
      .select("*")
      .eq("case_id", caseId);

    // Load previous agent runs (for aggregator)
    const { data: previousRuns } = await supabase
      .from("agent_analysis_runs")
      .select("*")
      .eq("case_id", caseId)
      .eq("status", "completed")
      .neq("agent_type", "aggregator");

    // Build context for the agent
    let contextParts: string[] = [];

    // Add case info
    contextParts.push(`\u0533\u0548\u0550\u053e: ${caseData.title}`);
    contextParts.push(`\u0540\u0561\u0574\u0561\u0580: ${caseData.case_number}`);
    if (caseData.case_type) {
      contextParts.push(`case_type: ${caseData.case_type}`);
    }
    if (caseData.facts) {
      contextParts.push(`\u0553\u0531\u054d\u054f\u0535\u0550: ${caseData.facts}`);
    }
    if (caseData.legal_question) {
      contextParts.push(`\u053b\u0550\u0531\u054e\u0531\u053f\u0531\u0546 \u0540\u0531\u0550\u0551: ${caseData.legal_question}`);
    }

    // Add volume content
    // === Map-Reduce for large volume OCR content ===
    const { mapReduceSummarize } = await import("../_shared/map-reduce-summarizer.ts");

    if (volumes && volumes.length > 0) {
      contextParts.push("\n\u054f\u0548\u0544\u0535\u0550:");
      for (const vol of volumes) {
        contextParts.push(`\n--- \u054f\u0548\u0544 ${vol.volume_number}: ${vol.title} ---`);
        if (vol.ocr_text) {
          const mrResult = await mapReduceSummarize(vol.ocr_text);
          if (mrResult.wasReduced) {
            console.log(`[multi-agent] Volume ${vol.volume_number}: Map-Reduce ${mrResult.originalLength} -> ${mrResult.summary.length} chars`);
          }
          contextParts.push(mrResult.summary);
        }
      }
    }

    // Add existing evidence for relevant agents
    if (evidenceItems && evidenceItems.length > 0 && agentType !== "evidence_collector") {
      contextParts.push("\n\u0531\u054a\u0531\u0551\u0548\u0552\u0545\u0551\u0546\u0535\u0550\u053b \u0550\u0535\u0535\u054d\u054f\u0550:");
      for (const ev of evidenceItems) {
        contextParts.push(`- #${ev.evidence_number}: ${ev.title} (${ev.evidence_type}) - ${ev.page_reference || "N/A"}`);
      }
    }

    // Add previous analyses for aggregator
    if (agentType === "aggregator" && previousRuns && previousRuns.length > 0) {
      contextParts.push("\n\u0531\u0533\u0535\u0546\u054f\u0546\u0535\u0550\u053b \u054e\u0535\u0550\u053c\u0548\u0552\u053e\u0548\u0552\u0539\u0545\u0548\u0552\u0546\u0546\u0535\u0550:");
      for (const run of previousRuns) {
        contextParts.push(`\n--- ${run.agent_type} ---`);
        if (run.summary) {
          contextParts.push(`\u0531\u0574\u0583\u0578\u0583\u0578\u0582\u0574: ${run.summary}`);
        }
        if (run.analysis_result) {
          // Limit analysis text
          contextParts.push(run.analysis_result.substring(0, 5000));
        }
      }
    }

    // RAG: Search Knowledge Base for relevant legal context (via shared module)
    const searchQuery = `${caseData.facts || ""} ${caseData.legal_question || ""}`.trim();
    
    if (searchQuery) {
      const referenceDate = caseData.court_date || null;
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const [kbResult, practiceResult] = await Promise.all([
        searchKB({
          supabase, supabaseUrl, supabaseKey: supabaseServiceKey,
          query: searchQuery, referenceDate, limit: 3, snippetLength: 2000,
        }),
        searchPractice({
          supabase, supabaseUrl, supabaseKey: supabaseServiceKey,
          query: searchQuery, referenceDate, limit: 3,
        }),
      ]);

      if (kbResult.results.length > 0) {
        contextParts.push("\n\u053b\u0550\u0531\u054e\u0531\u053f\u0531\u0546 \u0532\u0531\u0536\u0531 (KB):");
        contextParts.push(formatKBContext(kbResult.results, 2000));
      }

      if (practiceResult.results.length > 0) {
        contextParts.push("\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
        contextParts.push("\u053b\u0550\u0531\u054e\u0531\u053f\u0531\u0546 \u054a\u0550\u0531\u053f\u054f\u053b\u053f\u0531\u0545\u053b \u0540\u0535\u0546\u0531\u053f\u0531\u0545\u053b\u0546 \u0546\u0545\u0548\u0552\u053f (KB REFERENCE ONLY)");
        contextParts.push(formatPracticeCtx(practiceResult.results, true));
        contextParts.push("\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
        contextParts.push("KB \u0540\u0535\u0546\u0531\u053f\u0531\u0545\u053b\u0546 \u0532\u0531\u0536\u0531\u0545\u053b \u0531\u054e\u0531\u0550\u054f");
        contextParts.push("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501");
      }
    }

    // Parse user-selected sources (optional)
    let userSourcesBlock = "";
    if (referencesText.trim()) {
      const { refs } = parseReferencesText(referencesText);
      const capped = refs.slice(0, 10);
      userSourcesBlock = buildUserSourcesBlock(capped);
      if (refs.length > 10) {
        userSourcesBlock += "\nNOTE: Only first 10 of " + refs.length + " user-selected sources included due to token budget.\n";
      }
      console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "multi-agent", msg: "User sources parsed", count: capped.length, total: refs.length }));
    }

    const userMessage = contextParts.join("\n") + (userSourcesBlock ? "\n" + userSourcesBlock : "");
    const systemPrompt = (AGENT_PROMPTS[agentType] || AGENT_PROMPTS.evidence_collector) +
      (userSourcesBlock ? "\n\nWhen user-selected sources are provided, you MUST cite them by docId and chunkIndex in your analysis. These sources are mandatory references.\n" : "");

    // Route via centralized OpenAI router
    const { callText } = await import("../_shared/openai-router.ts");

    let content: string;
    let tokensUsed = 0;
    let modelUsed = "unknown";
    try {
      const result = await callText("multi-agent-analyze", [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ]);
      content = result.text;
      tokensUsed = result.usage?.total_tokens ?? 0;
      modelUsed = result.model_used;
      console.log(JSON.stringify({ ts: new Date().toISOString(), lvl: "info", fn: "multi-agent", model: modelUsed, latency_ms: result.latency_ms }));
    } catch (routerErr) {
      const status = (routerErr as { status?: number })?.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI router error: ${String(routerErr)}`);
    }

    // Parse JSON response
    let parsedResult: { summary: string; analysis: string; findings: unknown[]; evidenceItems: unknown[]; [key: string]: unknown } = {
      summary: "",
      analysis: content,
      findings: [],
      evidenceItems: []
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = { ...parsedResult, ...JSON.parse(jsonMatch[0]) };
      }
    } catch (e) {
      console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "multi-agent", msg: "JSON parse failed" }));
      parsedResult.analysis = content;
    }

    // Log usage
    const { computeCost: computeMultiAgentCost } = await import("../_shared/rate-limiter.ts");
    const inputTokensEst = aiResponse.usage?.prompt_tokens || Math.round(tokensUsed * 0.7);
    const outputTokensEst = aiResponse.usage?.completion_tokens || Math.round(tokensUsed * 0.3);
    const { cost_usd: multiAgentCostUsd } = computeMultiAgentCost(modelUsed, inputTokensEst, outputTokensEst);
    await supabase.rpc("log_api_usage", {
      _service_type: "multi_agent",
      _model_name: modelUsed,
      _tokens_used: tokensUsed,
      _estimated_cost: multiAgentCostUsd,
      _metadata: { agentType, caseId, runId }
    });

    // === FIX 2 v1.1 (P0/P1): Contract-based Citation Guard ===
    const MAX_CITED_IDS = 50;
    const citationMarkerPattern = /ID(?::|：|՝)\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?:\s*[,;]\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}))*/gi;
    const extractedIds: string[] = [];
    for (const match of content.matchAll(citationMarkerPattern)) {
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
        ts: new Date().toISOString(), lvl: "warn", fn: "multi-agent",
        msg: "CITATION_GUARD: too many cited IDs, skipping verification",
        cited_ids_count: allCitedIds.length, max: MAX_CITED_IDS,
      }));
    } else if (allCitedIds.length > 0) {
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
          ts: new Date().toISOString(), lvl: "error", fn: "multi-agent",
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
            ts: new Date().toISOString(), lvl: "warn", fn: "multi-agent",
            msg: "CITATION_GUARD: unverified IDs in output",
            missing_ids: missingIds, total_cited: allCitedIds.length,
          }));
        }
      }
    }

    return new Response(JSON.stringify({
      ...parsedResult,
      tokensUsed,
      agentType,
      validation: {
        citations_verified: citationsVerified,
        ...(missingIds.length > 0 ? { missing_ids: missingIds } : {}),
        cited_ids_count: allCitedIds.length,
        reason: citationReason,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), lvl: "error", fn: "multi-agent", msg: error instanceof Error ? error.message : "Agent failed" }));
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Agent execution failed" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
