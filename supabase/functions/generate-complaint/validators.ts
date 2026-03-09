// =============================================================================
// REQUEST VALIDATION
// =============================================================================

export interface GenerateComplaintRequest {
  courtType: 'appellate' | 'cassation' | 'constitutional' | 'echr' | 'anticorruption' | 'ombudsman';
  category: 'criminal' | 'civil' | 'administrative' | 'anticorruption' | 'constitutional' | 'echr' | 'ombudsman';
  complaintType: string;
  extractedText: string;
  language: 'hy' | 'ru' | 'en';
  ragContext?: string;
}

export function validateRequest(body: unknown): GenerateComplaintRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body');
  }

  const req = body as GenerateComplaintRequest;

  if (!req.courtType || !['appellate', 'cassation', 'constitutional', 'echr', 'anticorruption', 'ombudsman'].includes(req.courtType)) {
    throw new Error('Invalid court type');
  }

  if (!req.extractedText || req.extractedText.trim().length < 50) {
    throw new Error('Insufficient document text for analysis');
  }

  if (!req.language) {
    req.language = 'hy';
  }

  return req;
}
