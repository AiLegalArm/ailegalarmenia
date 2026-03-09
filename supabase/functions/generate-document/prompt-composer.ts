// =============================================================================
// PROMPT COMPOSER - Layered Prompt Architecture
// =============================================================================
// Composes the final prompt from modular layers:
// MASTER_SYSTEM_PROMPT + ROLE_PROMPT + JURISDICTION_PROMPT + DOCUMENT_PROMPT
// =============================================================================

import { SYSTEM_PROMPTS } from "./system-prompts.ts";
import { 
  LegalRole, 
  getRolePrompt, 
  getRoleValidationErrors,
  ROLE_CONFIGS 
} from "./prompts/role-prompts.ts";

// =============================================================================
// JURISDICTION-SPECIFIC PROMPTS
// =============================================================================

const JURISDICTION_PROMPTS: Record<string, string> = {
  criminal: `
JURISDICTION: CRIMINAL LAW OF THE REPUBLIC OF ARMENIA

APPLICABLE CODES:
- Criminal Code of RA (\u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u056B\u0580\u0584)
- Criminal Procedure Code of RA (\u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u056B\u0580\u0584)

PROCEDURAL FRAMEWORK:
- Appeals: Articles 376-390 CPC RA
- Cassation: Articles 404-414 CPC RA
- Habeas Corpus: Article 6 ECHR + CPC RA provisions

KEY PRINCIPLES:
- Presumption of innocence (Article 21 CPC RA)
- Right to defense (Article 20 CPC RA)
- Prohibition of torture and inhuman treatment
- Right to fair trial (Article 6 ECHR)

DEADLINES:
- Appeal: 15 days from decision announcement
- Cassation: 1 month from appellate decision
`,

  civil: `
JURISDICTION: CIVIL LAW OF THE REPUBLIC OF ARMENIA

APPLICABLE CODES:
- Civil Code of RA (\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u056B\u0580\u0584)
- Civil Procedure Code of RA (\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u056B\u0580\u0584)

PROCEDURAL FRAMEWORK:
- Appeals: Articles 379-394 CPC RA
- Cassation: Articles 395-408 CPC RA
- Interim measures: Articles 97-107 CPC RA

KEY PRINCIPLES:
- Dispositivity (parties control the dispute)
- Adversarial proceedings
- Equality of parties
- Right to be heard

DEADLINES:
- Appeal: 1 month from decision
- Cassation: 3 months from appellate decision
`,

  administrative: `
JURISDICTION: ADMINISTRATIVE LAW OF THE REPUBLIC OF ARMENIA

APPLICABLE CODES:
- Administrative Procedure Code of RA (\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u056B\u0580\u0584)
- Law on Fundamentals of Administration and Administrative Procedure

PROCEDURAL FRAMEWORK:
- Administrative claims: Articles 65-79 APC RA
- Appeals: Articles 118-127 APC RA
- Cassation: Articles 128-136 APC RA

KEY PRINCIPLES:
- Legality of administrative acts
- Proportionality
- Protection against abuse of discretion
- Right to good administration

DEADLINES:
- Challenge of administrative act: 2 months
- Appeal: 1 month from decision
- Cassation: 1 month from appellate decision
`,

  echr: `
JURISDICTION: EUROPEAN COURT OF HUMAN RIGHTS

APPLICABLE INSTRUMENTS:
- European Convention on Human Rights
- Protocols to the Convention
- Rules of Court

PROCEDURAL FRAMEWORK:
- Individual applications: Article 34 ECHR
- Interim measures: Rule 39
- Exhaustion of domestic remedies requirement

KEY PRINCIPLES:
- Subsidiarity
- Margin of appreciation
- Effective remedy (Article 13)
- Prohibition of abuse of rights

DEADLINES:
- Application: 4 months from final domestic decision
- Rule 39 requests: urgent, no fixed deadline
`
};

// =============================================================================
// PROMPT COMPOSITION LOGIC
// =============================================================================

export interface PromptCompositionParams {
  language: string;
  role?: LegalRole;
  jurisdiction?: string;
  documentPrompt: string;
  userContext: string;
}

export interface ComposedPrompt {
  systemPrompt: string;
  userPrompt: string;
  validationErrors: string[];
}

/**
 * Composes the complete prompt from modular layers
 * 
 * Architecture:
 * ┌─────────────────────────────────────┐
 * │     MASTER SYSTEM PROMPT           │ ← Base (language-specific)
 * ├─────────────────────────────────────┤
 * │     ROLE PROMPT (optional)          │ ← Legal strategy layer
 * ├─────────────────────────────────────┤
 * │     JURISDICTION PROMPT             │ ← Procedural codes
 * ├─────────────────────────────────────┤
 * │     DOCUMENT PROMPT                 │ ← Specific template
 * ├─────────────────────────────────────┤
 * │     USER CONTEXT                    │ ← Facts + question
 * └─────────────────────────────────────┘
 */
export function composePrompt(params: PromptCompositionParams): ComposedPrompt {
  const { language, role, jurisdiction, documentPrompt, userContext } = params;
  
  const validationErrors: string[] = [];
  
  // Layer 1: Master System Prompt (NEVER removed)
  const masterPrompt = SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.hy;
  
  // Layer 2: Role Prompt (optional, adds legal strategy)
  let rolePromptSection = '';
  if (role) {
    // Validate role-document compatibility
    const roleErrors = getRoleValidationErrors(role, documentPrompt);
    validationErrors.push(...roleErrors);
    
    if (roleErrors.length === 0) {
      rolePromptSection = `
// =============================================================================
// ROLE-SPECIFIC INSTRUCTIONS
// =============================================================================
${getRolePrompt(role)}

ROLE VALIDATION:
- You are acting as: ${role.toUpperCase()}
- Tone: ${ROLE_CONFIGS[role]?.toneGuidelines || 'Professional'}
- Allowed document types: ${ROLE_CONFIGS[role]?.allowedDocumentTypes.join(', ') || 'General'}
`;
    }
  }
  
  // Layer 3: Jurisdiction Prompt
  let jurisdictionPromptSection = '';
  if (jurisdiction && JURISDICTION_PROMPTS[jurisdiction]) {
    jurisdictionPromptSection = `
// =============================================================================
// JURISDICTION-SPECIFIC RULES
// =============================================================================
${JURISDICTION_PROMPTS[jurisdiction]}
`;
  }
  
  // Compose final system prompt
  const systemPrompt = `${masterPrompt}
${rolePromptSection}
${jurisdictionPromptSection}

// =============================================================================
// CROSS-ROLE VALIDATION RULES
// =============================================================================
CRITICAL PROHIBITIONS:
1. Judges and aggregators MUST NOT generate procedural documents (appeals, complaints, motions)
2. No role may use another role's legal logic
3. No mixing of procedural codes across jurisdictions
4. No emotional language in judge or prosecutor outputs
5. All roles must maintain Armenian-only output for documents

ROLE INTEGRITY CHECK:
${role === 'judge' ? '- YOU ARE A JUDGE: No requests, no petitions, assessment only' : ''}
${role === 'aggregator' ? '- YOU ARE AN AGGREGATOR: No advocacy, no document drafting' : ''}
${role === 'prosecutor' ? '- YOU ARE A PROSECUTOR: No defense arguments, public interest focus' : ''}
${role === 'lawyer' ? '- YOU ARE A LAWYER: Advocate for client, challenge opposing arguments' : ''}
`;

  // User prompt remains as provided
  const userPrompt = `${documentPrompt}

${userContext}`;

  return {
    systemPrompt,
    userPrompt,
    validationErrors
  };
}

/**
 * Validates the composed prompt before sending to AI
 */
export function validateComposedPrompt(composed: ComposedPrompt): boolean {
  return composed.validationErrors.length === 0;
}

/**
 * Gets appropriate jurisdiction from category
 */
export function getJurisdictionFromCategory(category: string): string {
  const categoryLower = category.toLowerCase();
  
  if (categoryLower.includes('criminal') || categoryLower.includes('\u0584\u0580\u0565\u0561\u056F\u0561\u0576')) {
    return 'criminal';
  }
  if (categoryLower.includes('civil') || categoryLower.includes('\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576')) {
    return 'civil';
  }
  if (categoryLower.includes('administrative') || categoryLower.includes('\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576')) {
    return 'administrative';
  }
  if (categoryLower.includes('echr') || categoryLower.includes('european')) {
    return 'echr';
  }
  
  return 'general';
}
