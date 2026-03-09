// =============================================================================
// RAG SEARCH HELPERS FOR COMPLAINT GENERATION
// Search/formatting logic lives in _shared/rag-search.ts (dualSearch, formatKBContext, formatPracticeContext)
// This file only contains complaint-generation-specific query building utilities.
// =============================================================================

// Build search query based on court type and category
export function buildSearchQuery(
  courtType: string, 
  category: string
): string[] {
  const searchTerms: string[] = [];
  
  if (courtType === 'ombudsman') {
    searchTerms.push('\u0574\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580', '\u057A\u0561\u0577\u057F\u057A\u0561\u0576', '\u0585\u0574\u0562\u0578\u0582\u0564\u057D\u0574\u0565\u0576');
  } else if (courtType === 'anticorruption') {
    searchTerms.push('\u0570\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0561', '\u056F\u0561\u0577\u0561\u057C\u0584', '\u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0585\u0580\u0565\u0576\u057D\u0563\u056B\u0580\u0584');
  } else if (courtType === 'cassation') {
    searchTerms.push('\u057E\u0573\u057C\u0561\u0562\u0565\u056F', '\u0562\u0578\u0572\u0578\u0584', '\u056F\u0561\u057D\u0561\u0581\u056B\u0578\u0576', category);
  } else if (courtType === 'constitutional') {
    searchTerms.push('\u057D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576', '\u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584', '\u057D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576');
  } else if (courtType === 'echr') {
    searchTerms.push('ECHR', '\u0535\u054D\u054A\u0540', 'Convention', '\u0535\u057E\u0580\u0578\u057A\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576');
  } else if (courtType === 'appellate') {
    searchTerms.push('\u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579', '\u0561\u057A\u0565\u056C\u0575\u0561\u0581\u056B\u0578\u0576', category);
  } else {
    searchTerms.push('\u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579', category);
  }
  
  return searchTerms;
}

export function mapCourtTypeToPracticeCategory(courtType: string): string | undefined {
  const mapping: Record<string, string> = {
    'appellate': 'appeals',
    'cassation': 'cassation',
    'constitutional': 'constitutional',
    'echr': 'echr',
    'anticorruption': 'criminal',
    'ombudsman': 'human_rights'
  };
  return mapping[courtType];
}
