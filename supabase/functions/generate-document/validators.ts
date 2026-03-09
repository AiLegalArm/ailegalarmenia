// =============================================================================
// REQUEST VALIDATORS
// =============================================================================

import { LegalRole, getRoleValidationErrors } from "./prompts/role-prompts.ts";

export interface GenerateDocumentRequest {
  templateId?: string;
  templateName: string;
  category: string;
  subcategory?: string;
  role?: LegalRole; // NEW: Role-based document generation
  caseData?: {
    title?: string;
    case_number?: string;
    case_type?: string;
    court?: string;
    facts?: string;
    legal_question?: string;
    description?: string;
    notes?: string;
  };
  sourceText?: string;
  fileExtractedText?: string;
  recipientName?: string;
  recipientPosition?: string;
  recipientOrganization?: string;
  recipientAddress?: string;
  recipientPhones?: string[];
  recipientEmail?: string;
  senderName?: string;
  senderAddress?: string;
  senderContact?: string;
  additionalFields?: Record<string, unknown>;
  language?: string;
}

// Valid roles for document generation
const VALID_ROLES: LegalRole[] = ['lawyer', 'prosecutor', 'judge', 'aggregator'];

export function validateRequest(body: unknown): GenerateDocumentRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body');
  }

  const request = body as GenerateDocumentRequest;

  if (!request.templateName || typeof request.templateName !== 'string') {
    throw new Error('Template name is required');
  }

  if (!request.category || typeof request.category !== 'string') {
    throw new Error('Category is required');
  }

  // Normalize language
  const validLanguages = ['hy', 'ru', 'en'];
  if (request.language && !validLanguages.includes(request.language)) {
    request.language = 'hy'; // Default to Armenian
  }

  // Validate role if provided
  if (request.role) {
    if (!VALID_ROLES.includes(request.role)) {
      throw new Error(`Invalid role: ${request.role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    }
    
    // Validate role-document compatibility
    const roleErrors = getRoleValidationErrors(request.role, request.templateName);
    if (roleErrors.length > 0) {
      throw new Error(`Role validation failed: ${roleErrors.join('; ')}`);
    }
  }

  return request;
}

export function buildRecipientInfo(request: GenerateDocumentRequest): string {
  const parts: string[] = [];
  
  if (request.recipientOrganization) {
    parts.push(`Organization: ${request.recipientOrganization}`);
  }
  if (request.recipientAddress) {
    parts.push(`Address: ${request.recipientAddress}`);
  }
  if (request.recipientPhones && request.recipientPhones.length > 0) {
    const phones = Array.isArray(request.recipientPhones) 
      ? request.recipientPhones.join(', ') 
      : request.recipientPhones;
    parts.push(`Phone: ${phones}`);
  }
  if (request.recipientEmail) {
    parts.push(`Email: ${request.recipientEmail}`);
  }
  if (request.recipientPosition) {
    parts.push(`Position: ${request.recipientPosition}`);
  }
  if (request.recipientName) {
    parts.push(`Name: ${request.recipientName}`);
  }
  
  return parts.length > 0 
    ? parts.join('\n') 
    : 'Not specified - use appropriate placeholder';
}

export function buildSenderInfo(request: GenerateDocumentRequest): string {
  const parts: string[] = [];
  
  if (request.senderName) {
    parts.push(`Name: ${request.senderName}`);
  }
  if (request.senderAddress) {
    parts.push(`Address: ${request.senderAddress}`);
  }
  if (request.senderContact) {
    parts.push(`Contact: ${request.senderContact}`);
  }
  
  return parts.length > 0 
    ? parts.join('\n') 
    : 'Not specified - use appropriate placeholder';
}

export function buildContextText(request: GenerateDocumentRequest): string {
  let contextText = "";
  
  if (request.sourceText) {
    contextText = `USER DESCRIPTION OF SITUATION:\n${request.sourceText}\n\n`;
  }

  if (request.fileExtractedText) {
    contextText += `EXTRACTED TEXT FROM UPLOADED FILE (AI ANALYZED):\n${request.fileExtractedText}\n\n`;
  }
  
  if (request.caseData) {
    const cd = request.caseData;
    contextText += `CASE DATA:
Case Title: ${cd.title || 'Not specified'}
Case Number: ${cd.case_number || 'Not specified'}
Case Type: ${cd.case_type || 'Not specified'}
Court: ${cd.court || 'Not specified'}
Facts: ${cd.facts || 'Not provided'}
Legal Question: ${cd.legal_question || 'Not provided'}
Description: ${cd.description || 'Not provided'}
Notes: ${cd.notes || 'Not provided'}`;
  }

  if (!contextText.trim()) {
    contextText = "No specific case context provided. Generate a template document with placeholder fields marked as [______].";
  }

  return contextText;
}

export function getLanguageNote(language: string): string {
  switch (language) {
    case 'hy':
      return 'Output the entire document in Armenian only. No Russian or English text.';
    case 'ru':
      return 'Output the entire document in Russian only. No Armenian or English text (except proper names of Armenian institutions).';
    case 'en':
      return 'Output the entire document in English only. No Armenian or Russian text (except proper names of Armenian institutions).';
    default:
      return 'Output the entire document in Armenian only. No Russian or English text.';
  }
}
