// =============================================================================
// PROMPTS AGGREGATOR - Central export for all analysis prompts
// =============================================================================

import { BASE_SYSTEM_PROMPT, ANALYSIS_TYPES, type AnalysisType } from '../system.ts';
import { DEFENSE_PROMPT } from './defense.ts';
import { PROSECUTION_PROMPT } from './prosecution.ts';
import { JUDGE_PROMPT } from './judge.ts';
import { AGGREGATOR_PROMPT } from './aggregator.ts';
import { EVIDENCE_PROMPT } from './evidence.ts';
import { QUALIFICATION_PROMPT } from './qualification.ts';
import { PROCEDURAL_PROMPT } from './procedural.ts';
import { SUBSTANTIVE_PROMPT } from './substantive.ts';
import { RIGHTS_PROMPT } from './rights.ts';
import { APPEAL_PROMPT } from './appeal.ts';

// Re-export types
export type { AnalysisType };
export { ANALYSIS_TYPES };

// Re-export appeal prompt for direct use
export { APPEAL_PROMPT };

// Prompt registry mapping analysis types to their specific prompts
export const PROMPT_REGISTRY = {
  defense_analysis: DEFENSE_PROMPT,
  prosecution_analysis: PROSECUTION_PROMPT,
  judge_analysis: JUDGE_PROMPT,
  aggregator: AGGREGATOR_PROMPT,
  evidence_admissibility: EVIDENCE_PROMPT,
  charge_qualification: QUALIFICATION_PROMPT,
  procedural_violations: PROCEDURAL_PROMPT,
  substantive_law_violations: SUBSTANTIVE_PROMPT,
  fair_trial_and_rights: RIGHTS_PROMPT,
} satisfies Record<AnalysisType, string>;

// Analysis type labels in Armenian (for UI display)
export const ANALYSIS_TYPE_LABELS = {
  defense_analysis: '\u054A\u0561\u0577\u057F\u057A\u0561\u0576\u0561\u056F\u0561\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
  prosecution_analysis: '\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
  judge_analysis: '\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
  aggregator: '\u0540\u0561\u0574\u0561\u0564\u0580\u057E\u0561\u056E \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
  evidence_admissibility: '\u0531\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056B \u0561\u0576\u0569\u0578\u0582\u0575\u056C\u0561\u057F\u0580\u0565\u056C\u056B\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
  charge_qualification: '\u0544\u0565\u0572\u0561\u0564\u0580\u0561\u0576\u0584\u056B \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576',
  procedural_violations: '\u0534\u0561\u057F\u0561\u057E\u0561\u0580\u0561\u056F\u0561\u0576 \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580',
  substantive_law_violations: '\u0546\u0575\u0578\u0582\u0569\u0561\u056F\u0561\u0576 \u0576\u0578\u0580\u0574\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580',
  fair_trial_and_rights: '\u0531\u0580\u0564\u0561\u0580 \u0564\u0561\u057F\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0587 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u056D\u0561\u056D\u057F\u0578\u0582\u0574\u0576\u0565\u0580',
} satisfies Record<AnalysisType, string>;

/**
 * Get the full system prompt for a given analysis type
 */
export function getFullPrompt(analysisType: AnalysisType): string {
  const specificPrompt = PROMPT_REGISTRY[analysisType];
  if (!specificPrompt) {
    // Should be unreachable due to `satisfies`, but kept for runtime safety.
    throw new Error(`PROMPT_REGISTRY missing key: ${String(analysisType)}`);
  }
  return `${BASE_SYSTEM_PROMPT}\n\n---\n\n${specificPrompt}`;
}

/**
 * Get full appeal prompt with base system prompt
 */
export function getAppealPrompt(): string {
  return `${BASE_SYSTEM_PROMPT}\n\n---\n\n${APPEAL_PROMPT}`;
}

/**
 * Validate if a string is a valid analysis type
 */
export function isValidAnalysisType(type: string): type is AnalysisType {
  return ANALYSIS_TYPES.includes(type as AnalysisType);
}

/**
 * Get previous analyses for aggregator context
 */
export function formatPreviousAnalyses(
  analyses: Array<{ role: AnalysisType; analysis: string }>
): string {
  if (!analyses.length) return '';
  return analyses
    .map(a => {
      const label = ANALYSIS_TYPE_LABELS[a.role];
      return `### ${label}\n${a.analysis}`;
    })
    .join('\n\n---\n\n');
}
