// =============================================================================
// COMPLAINT WIZARD TYPES
// =============================================================================

export type ComplaintCategory = 
  | "criminal" 
  | "civil" 
  | "administrative" 
  | "anticorruption" 
  | "constitutional" 
  | "echr"
  | "ombudsman";

export interface ComplaintType {
  id: string;
  labelHy: string;
  labelRu: string;
  labelEn: string;
  category: ComplaintCategory;
  templateId: string;
}

export interface UploadedFile {
  id: string;
  file: File;
  status: "pending" | "processing" | "success" | "error";
  extractedText: string;
  errorMessage?: string;
}

export interface WizardState {
  step: number;
  category: ComplaintCategory | null;
  complaintType: ComplaintType | null;
  files: UploadedFile[];
  additionalInfo: string;
  respondentInfo: string;
  isProcessing: boolean;
  isGenerating: boolean;
  generatedContent: string;
}

export type CourtType = 
  | "appellate" 
  | "cassation" 
  | "constitutional" 
  | "echr" 
  | "anticorruption"
  | "ombudsman";

export interface GenerateComplaintParams {
  courtType: CourtType;
  category: ComplaintCategory;
  complaintType: string;
  extractedText: string;
  language: "hy" | "ru" | "en";
}
