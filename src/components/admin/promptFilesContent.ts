// =============================================================================
// RAW CONTENT OF PROMPT FILES (auto-updates via Vite HMR)
// =============================================================================

// NOTE: We import as raw text so the frontend can preview/edit/copy prompt files
// without executing any Deno/edge-function code.

import aiDefense from "../../../supabase/functions/ai-analyze/prompts/defense.ts?raw";
import aiProsecution from "../../../supabase/functions/ai-analyze/prompts/prosecution.ts?raw";
import aiJudge from "../../../supabase/functions/ai-analyze/prompts/judge.ts?raw";
import aiAggregator from "../../../supabase/functions/ai-analyze/prompts/aggregator.ts?raw";
import aiEvidence from "../../../supabase/functions/ai-analyze/prompts/evidence.ts?raw";
import aiProcedural from "../../../supabase/functions/ai-analyze/prompts/procedural.ts?raw";
import aiQualification from "../../../supabase/functions/ai-analyze/prompts/qualification.ts?raw";
import aiRights from "../../../supabase/functions/ai-analyze/prompts/rights.ts?raw";
import aiSubstantive from "../../../supabase/functions/ai-analyze/prompts/substantive.ts?raw";
import aiSystem from "../../../supabase/functions/ai-analyze/system.ts?raw";
import aiLegalPracticeKb from "../../../supabase/functions/ai-analyze/legal-practice-kb.ts?raw";

import docGeneral from "../../../supabase/functions/generate-document/prompts/general.ts?raw";
import docCivil from "../../../supabase/functions/generate-document/prompts/civil.ts?raw";
import docCriminal from "../../../supabase/functions/generate-document/prompts/criminal.ts?raw";
import docAdministrative from "../../../supabase/functions/generate-document/prompts/administrative.ts?raw";
import docEchr from "../../../supabase/functions/generate-document/prompts/echr.ts?raw";
import docFallback from "../../../supabase/functions/generate-document/prompts/fallback.ts?raw";
import docRolePrompts from "../../../supabase/functions/generate-document/prompts/role-prompts.ts?raw";
import docSystemPrompts from "../../../supabase/functions/generate-document/system-prompts.ts?raw";

import complaintSystem from "../../../supabase/functions/generate-complaint/prompts/system-prompt.ts?raw";
import complaintCourt from "../../../supabase/functions/generate-complaint/prompts/court-instructions.ts?raw";
import complaintLanguage from "../../../supabase/functions/generate-complaint/prompts/language-instructions.ts?raw";

import legalChatIndex from "../../../supabase/functions/legal-chat/index.ts?raw";
import ocrProcessIndex from "../../../supabase/functions/ocr-process/index.ts?raw";
import audioTranscribeIndex from "../../../supabase/functions/audio-transcribe/index.ts?raw";
import extractCaseFieldsIndex from "../../../supabase/functions/extract-case-fields/index.ts?raw";

import initialPrompts from "../../../src/data/initialPrompts.ts?raw";

export const PROMPT_FILE_CONTENTS: Record<string, string> = {
  "supabase/functions/ai-analyze/prompts/defense.ts": aiDefense,
  "supabase/functions/ai-analyze/prompts/prosecution.ts": aiProsecution,
  "supabase/functions/ai-analyze/prompts/judge.ts": aiJudge,
  "supabase/functions/ai-analyze/prompts/aggregator.ts": aiAggregator,
  "supabase/functions/ai-analyze/prompts/evidence.ts": aiEvidence,
  "supabase/functions/ai-analyze/prompts/procedural.ts": aiProcedural,
  "supabase/functions/ai-analyze/prompts/qualification.ts": aiQualification,
  "supabase/functions/ai-analyze/prompts/rights.ts": aiRights,
  "supabase/functions/ai-analyze/prompts/substantive.ts": aiSubstantive,
  "supabase/functions/ai-analyze/system.ts": aiSystem,
  "supabase/functions/ai-analyze/legal-practice-kb.ts": aiLegalPracticeKb,

  "supabase/functions/generate-document/prompts/general.ts": docGeneral,
  "supabase/functions/generate-document/prompts/civil.ts": docCivil,
  "supabase/functions/generate-document/prompts/criminal.ts": docCriminal,
  "supabase/functions/generate-document/prompts/administrative.ts": docAdministrative,
  "supabase/functions/generate-document/prompts/echr.ts": docEchr,
  "supabase/functions/generate-document/prompts/fallback.ts": docFallback,
  "supabase/functions/generate-document/prompts/role-prompts.ts": docRolePrompts,
  "supabase/functions/generate-document/system-prompts.ts": docSystemPrompts,

  "supabase/functions/generate-complaint/prompts/system-prompt.ts": complaintSystem,
  "supabase/functions/generate-complaint/prompts/court-instructions.ts": complaintCourt,
  "supabase/functions/generate-complaint/prompts/language-instructions.ts": complaintLanguage,

  "supabase/functions/legal-chat/index.ts": legalChatIndex,
  "supabase/functions/ocr-process/index.ts": ocrProcessIndex,
  "supabase/functions/audio-transcribe/index.ts": audioTranscribeIndex,
  "supabase/functions/extract-case-fields/index.ts": extractCaseFieldsIndex,

  "src/data/initialPrompts.ts": initialPrompts,
};
