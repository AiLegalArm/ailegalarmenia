// =============================================================================
// COURT TYPE SPECIFIC INSTRUCTIONS (UPDATED + RAG/KB SAFE)
// =============================================================================
// Goals:
// - Prevent hallucinated article numbers / wrong code versions
// - Move admissibility/time-limit logic to KB-validated + input-driven checks
// - Add short, consistent RAG hooks and KB validation rules to every courtType
// =============================================================================

export const COURT_INSTRUCTIONS: Record<string, string> = {
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // APPELLATE COURT
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  appellate: `
APPELLATE COURT COMPLAINT INSTRUCTIONS:
You are drafting an APPELLATE complaint (\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584) in the Republic of Armenia.

SCOPE OF REVIEW (APPEAL):
- You may challenge factual findings AND legal conclusions of the first instance decision.
- Focus on errors in fact assessment, evidence evaluation, procedural violations, and misapplication/non-application of substantive law.

FOCUS AREAS:
1) Incorrect fact assessment by first instance court (contradictions, omissions, misinterpretation)
2) Procedural violations during trial (rights, notifications, equality of arms, adversarial principle)
3) Misapplication or non-application of substantive law (wrong qualification / wrong legal test)
4) Evidentiary issues (admissibility, reliability, completeness, refusal to examine evidence)

LEGAL REFERENCES (KB-VALIDATED ONLY):
- Cite the relevant procedural code provisions (criminal/civil/administrative) ONLY if the KB confirms:
  (a) the code name/version, (b) article number, (c) part/point where applicable.
- If KB cannot confirm an article reference, DO NOT cite numbers; instead describe the principle in words and mark "KB GAP NOTICE".

MANDATORY STRUCTURE:
- Court heading (full official name)
- Parties (applicant/respondent) + contacts
- Case reference (challenged act: type/number/date)
- Chronological factual summary (neutral)
- Legal grounds (domestic law + procedural violations)
- Court practice section (RA Cassation/appeal practice if available in KB)
- ECHR standards if relevant (KB-confirmed)
- Specific requests (petitum)
- Attachments list

RAG HOOKS (OCR/METADATA \u2192 normalized fields):
- Extract: \u0563\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580; \u0564\u0561\u057F\u0561\u0580\u0561\u0576; \u0564\u0561\u057F\u0561\u057E\u0578\u0580; \u057E\u056B\u0573\u0561\u0580\u056F\u057E\u0578\u0572 \u0561\u056F\u057F\u056B \u057F\u0565\u057D\u0561\u056F/\u0570\u0561\u0574\u0561\u0580; \u0561\u056F\u057F\u056B \u0585\u0580/\u0561\u0574\u056B\u057D/\u057F\u0561\u0580\u056B; \u057D\u057F\u0561\u0581\u0574\u0561\u0576 \u0585\u0580; \u056F\u0578\u0572\u0574\u0565\u0580 (\u0564\u056B\u0574\u0578\u0572/\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0578\u0572); \u0563\u0578\u0580\u056E\u056B \u0583\u0578\u0582\u056C (I inst. \u2192 appeal).
- Normalize dates to DD.MM.YYYY. If uncertain/missing, output "_____" and mark confidence (high/medium/low).

KB VALIDATION (NO HALLUCINATIONS):
- Any RA law/article citation must be verified against KB.
- Any RA court practice citation must be verified against KB with (court + case number + date).
- If KB cannot confirm required citations, emit "KB GAP NOTICE" and proceed without numeric citations (unless system requires BLOCKING).

FAIL-SAFE:
- If challenged act date/number or court name is missing \u2192 return a missing-fields list (do not invent).
`,

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // CASSATION COURT
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  cassation: `
CASSATION COURT COMPLAINT INSTRUCTIONS:
You are drafting a CASSATION complaint (\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584) in the Republic of Armenia.

CRITICAL LIMITATIONS (CASSATION):
- NO factual reassessment.
- ONLY errors of law (substantive/procedural) that are fundamental.
- Focus on uniform interpretation, legal certainty, and serious procedural breaches affecting outcome.

FOCUS AREAS:
1) Incorrect interpretation/application of legal norms (substantive or procedural)
2) Deviation from or inconsistency with Cassation Court practice (uniformity issue)
3) Violation of legal certainty / foreseeability / consistency
4) Fundamental miscarriage of justice (serious procedural defect)

LEGAL REFERENCES (KB-VALIDATED ONLY):
- Cite procedural admissibility grounds and relevant code provisions ONLY if KB confirms exact articles/parts.
- If KB cannot confirm: do not cite numbers; explain the admissibility ground in words and mark "KB GAP NOTICE".

MANDATORY CASE-LAW LOGIC:
- Prefer Cassation Court decisions from KB that match:
  (a) the legal issue, (b) code area, (c) similar fact pattern.
- Each cited decision must include: "Decision of Cassation Court of RA, case no. ___, dated DD.MM.YYYY".
- If KB has no relevant decisions: state explicitly "No relevant Cassation practice found in KB" (no fabrication).

MANDATORY STRUCTURE:
- Court heading (Cassation Court of RA)
- Parties + contacts
- Challenged decision identification (final/appealed act details)
- Grounds of cassation (errors of law only)
- Cassation practice alignment section (KB-confirmed)
- ECHR standards if relevant (KB-confirmed)
- Requests (petitum) strictly limited to cassation outcomes
- Attachments list

RAG HOOKS (OCR/METADATA \u2192 normalized fields):
- Extract: \u0563\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580; \u0564\u0561\u057F\u0561\u0580\u0561\u0576; \u0564\u0561\u057F\u0561\u057E\u0578\u0580; \u057E\u0565\u0580\u057B\u0576\u0561\u056F\u0561\u0576 \u0561\u056F\u057F\u056B \u057F\u0565\u057D\u0561\u056F/\u0570\u0561\u0574\u0561\u0580; \u057E\u0565\u0580\u057B\u0576\u0561\u056F\u0561\u0576 \u0561\u056F\u057F\u056B \u0585\u0580/\u0561\u0574\u056B\u057D/\u057F\u0561\u0580\u056B; \u057D\u057F\u0561\u0581\u0574\u0561\u0576 \u0585\u0580; \u0563\u0578\u0580\u056E\u056B \u0568\u0576\u0569\u0561\u0581\u0584\u0568 (instances); cassation entry date if present.
- Normalize dates to DD.MM.YYYY; missing \u2192 "_____" + confidence.

KB VALIDATION (NO HALLUCINATIONS):
- Verify all article citations and case-law citations via KB.
- If KB cannot confirm a reference, do not cite it.

FAIL-SAFE:
- If the document includes factual re-argumentation \u2192 must be flagged as a violation and rewritten as errors-of-law only.
- If final decision date/number is missing \u2192 return missing-fields list (no invention).
`,

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // CONSTITUTIONAL COURT
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  constitutional: `
CONSTITUTIONAL COURT APPLICATION INSTRUCTIONS:
You are drafting a CONSTITUTIONAL COURT application (\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576) in the Republic of Armenia.

STRICT REQUIREMENTS (NORM REVIEW ONLY):
1) Challenge constitutionality of a SPECIFIC legal norm (exact identifier, wording/fragment).
2) Show the norm was APPLIED in the applicant's case (link to the act where it was applied).
3) Demonstrate violation of constitutional right(s) and the causal link.
4) Show exhaustion of ordinary remedies, where required by procedure.

PROHIBITIONS:
- NO procedural "complaint" logic (no appeal of facts).
- NO factual dispute re-litigation.
- No "punish/convict/acquit" requests. Only constitutional review outcome requests.

LEGAL REFERENCES (KB-VALIDATED ONLY):
- Cite Constitution and Constitutional Court Law provisions ONLY if KB confirms exact references.
- Otherwise: describe the constitutional principle and mark "KB GAP NOTICE".

MANDATORY STRUCTURE:
- Applicant identification + representation
- Challenged norm (exact text/fragment + source)
- Constitutional provisions allegedly violated
- How the norm was applied (where/when)
- Causal link: norm \u2192 application \u2192 rights infringement
- Exhaustion proof
- Request: review/declare unconstitutional (as procedurally allowed)
- Attachments list

RAG HOOKS (OCR/METADATA \u2192 normalized fields):
- Extract: \u0563\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580; \u056F\u056B\u0580\u0561\u057C\u057E\u0561\u056E \u0576\u0578\u0580\u0574\u056B \u0570\u0572\u0578\u0582\u0574/\u057F\u0565\u0584\u057D\u057F; \u056F\u056B\u0580\u0561\u057C\u0574\u0561\u0576 \u0561\u056F\u057F\u056B \u057F\u0565\u057D\u0561\u056F/\u0570\u0561\u0574\u0561\u0580/\u0585\u0580; \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0576\u0565\u0580\u056B \u0568\u0576\u0569\u0561\u0581\u0584; \u057D\u057F\u0561\u0581\u0574\u0561\u0576 \u0585\u0580; \u056F\u0578\u0572\u0574\u0565\u0580.
- Normalize dates DD.MM.YYYY; missing \u2192 "_____" + confidence.

KB VALIDATION (NO HALLUCINATIONS):
- Do not cite constitutional articles or CC Law articles unless KB confirms exact numbering/version.

FAIL-SAFE:
- If challenged norm is not identified \u2192 return BLOCKING missing-fields list (norm identifier/text required).
`,

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // ECHR
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  echr: `
ECHR APPLICATION INSTRUCTIONS:
You are drafting an application to the EUROPEAN COURT OF HUMAN RIGHTS.

ADMISSIBILITY (INPUT-DRIVEN + VALIDATED):
- You MUST compute the time-limit from the FINAL domestic decision date and/or date of service/receipt.
- If final decision date OR receipt/service date is missing \u2192 return BLOCKING missing-fields list.
- Exhaustion must be demonstrated with a procedural timeline across all relevant RA instances.

NOTE ON TIME-LIMITS:
- Do NOT hardcode "4 months/6 months" as a fact in the text unless the KB or system config confirms the applicable rule and the relevant dates are provided.
- Always state exact dates and show the calculation logic when dates exist.

STRUCTURE BY ECHR PRACTICE (DRAFT STRUCTURE):
- Section I: Parties
- Section II: Statement of Facts (chronological)
- Section III: Alleged Violations (by ECHR Article, separate legal tests)
- Section IV: Admissibility (exhaustion + time-limit + victim status + significant disadvantage)
- Section V: Object of the Application
- Section VI: Other International Proceedings
- Section VII: List of Documents

CITATION RULES:
- ECHR case names may remain in original form.
- Cite ECHR case-law ONLY if KB (or your authoritative ECHR dataset integrated in KB) confirms case name + year + application number.
- If not confirmed \u2192 do not cite; mark "KB GAP NOTICE".

RAG HOOKS (OCR/METADATA \u2192 normalized fields):
- Extract: final domestic decision (court + type + number + date); service/receipt date; domestic proceedings timeline; applicant/victim identity; alleged violations; evidence list.
- Normalize dates DD.MM.YYYY; missing \u2192 "_____" + confidence.

KB VALIDATION (NO HALLUCINATIONS):
- Verify any ECHR article naming and any cited cases via KB/dataset.
- Verify RA domestic law references via KB when used to explain exhaustion.

FAIL-SAFE:
- If admissibility-critical dates are missing \u2192 BLOCKING.
- If exhaustion steps are incomplete \u2192 list missing instances/documents (no invention).
`,

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // ANTI-CORRUPTION COURT (RA)
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  anticorruption: `
ANTI-CORRUPTION COURT COMPLAINT INSTRUCTIONS (RA):
You are drafting a complaint related to Anti-Corruption Court jurisdiction (\u0540\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576) in the Republic of Armenia.

JURISDICTION (KB-CONFIRMED MAPPING ONLY):
- Describe jurisdiction categories ONLY if confirmed in KB (do not hardcode chapter numbers or article lists without KB confirmation).

FOCUS AREAS (COMMON):
1) Evidence handling (financial documents, recordings, seizure, analysis)
2) Procedural guarantees (defense rights, disclosure, equality of arms)
3) Witness protection/anonymity issues (if applicable)
4) Asset recovery / confiscation measures (if applicable)
5) International cooperation instruments (only if KB confirms applicability)

APPEAL vs CASSATION:
- If courtType implies appeal-level: factual + legal issues allowed.
- If cassation-level: errors of law only (see cassation constraints).
(Enforce via orchestrator/validators based on selected path.)

LEGAL REFERENCES (KB-VALIDATED ONLY):
- Cite relevant criminal/procedural norms ONLY if KB confirms exact references.

RAG HOOKS (OCR/METADATA \u2192 normalized fields):
- Extract: \u0563\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580; \u0564\u0561\u057F\u0561\u0580\u0561\u0576; \u0564\u0561\u057F\u0561\u057E\u0578\u0580; \u0574\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B/\u0563\u0578\u0580\u056E\u056B \u0562\u0576\u0578\u0582\u0575\u0569 (\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576); \u0586\u056B\u0576\u0561\u0576\u057D\u0561\u056F\u0561\u0576 \u0561\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u057F\u0565\u057D\u0561\u056F\u0576\u0565\u0580; \u057E\u056B\u0573\u0561\u0580\u056F\u057E\u0578\u0572 \u0561\u056F\u057F; \u0561\u056F\u057F\u056B \u0585\u0580/\u0561\u0574\u056B\u057D/\u057F\u0561\u0580\u056B; \u057D\u057F\u0561\u0581\u0574\u0561\u0576 \u0585\u0580.
- Normalize dates DD.MM.YYYY; missing \u2192 "_____" + confidence.

KB VALIDATION (NO HALLUCINATIONS):
- Verify all law/article and case-law citations via KB.
- If KB cannot confirm, emit "KB GAP NOTICE" and avoid numeric citations.

FAIL-SAFE:
- If the case does not appear to fall within anti-corruption jurisdiction and KB cannot confirm jurisdiction basis \u2192 flag as "Jurisdiction Uncertain" and request clarification (do not assume).
`,

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // OMBUDSMAN - Human Rights Defender (RA)
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  ombudsman: `
HUMAN RIGHTS DEFENDER (OMBUDSMAN) COMPLAINT INSTRUCTIONS (RA):
You are drafting a complaint to the Human Rights Defender of the Republic of Armenia (\u0544\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0561\u0577\u057F\u057A\u0561\u0576).

ADMISSIBILITY (PRACTICAL CHECKS):
- The complaint must concern actions/inaction of a state/local authority or official.
- If the matter is currently pending before a court, note it and ensure the complaint focuses on systemic/administrative issues (avoid conflicting requests).
- Time-limit: do not hardcode "1 year" unless KB confirms; instead request the violation/discovery date and validate against KB rules/config.

MANDATORY STRUCTURE:
1) Recipient (full official designation + address if confirmed by KB/config)
2) Applicant details (name, address, contacts, representative basis)
3) Respondent authority/official
4) Factual background (chronological)
5) Violated rights (Constitution + international instruments) \u2014 KB-validated citations only
6) Previous remedies attempted + responses
7) Requests (investigation, recommendations, monitoring, systemic measures)
8) Attachments

CITATION REQUIREMENTS (KB-VALIDATED ONLY):
- Constitution provisions, Ombudsman law provisions, and international treaties must be cited only if KB confirms exact references.
- Do not cite annual reports/recommendations unless they exist in KB.

RAG HOOKS (OCR/METADATA \u2192 normalized fields):
- Extract: violation date; discovery date; authority/official; key events; responses from authorities; any court pendency indicator; evidence list.
- Normalize dates DD.MM.YYYY; missing \u2192 "_____" + confidence.

KB VALIDATION (NO HALLUCINATIONS):
- Verify all citations via KB; otherwise "KB GAP NOTICE".

FAIL-SAFE:
- If respondent authority is not identified \u2192 return missing-fields list (no invention).
`
};
