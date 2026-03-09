// =============================================================================
// RAG SEARCH HELPERS FOR DOCUMENT GENERATION
// Search/formatting logic lives in _shared/rag-search.ts (dualSearch, formatKBContext, formatPracticeContext)
// This file only contains document-generation-specific query building utilities.
// =============================================================================

// Build search query based on document category and template
export function buildSearchQuery(
  category: string, 
  templateName: string
): string[] {
  const searchTerms: string[] = [];
  
  if (category === 'civil') {
    searchTerms.push('\u0563\u0580\u0561\u0581\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576', '\u0413\u041F\u041A \u0420\u0410', '\u0413\u041A \u0420\u0410');
  } else if (category === 'criminal') {
    searchTerms.push('\u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576', '\u0423\u041F\u041A \u0420\u0410', '\u0423\u041A \u0420\u0410');
  } else if (category === 'administrative') {
    searchTerms.push('\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576', '\u0412\u0414\u041A \u0420\u0410');
  } else if (category === 'echr') {
    searchTerms.push('ECHR', '\u0535\u054D\u054A\u0540', 'Convention', '\u0415\u0421\u041F\u0427');
  }
  
  searchTerms.push(templateName);
  return searchTerms;
}

export function mapCategoryToPracticeCategory(category: string): string | undefined {
  const mapping: Record<string, string> = {
    'civil': 'civil',
    'criminal': 'criminal',
    'administrative': 'administrative',
    'echr': 'echr'
  };
  return mapping[category];
}
