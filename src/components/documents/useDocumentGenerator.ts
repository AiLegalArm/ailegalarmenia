import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RecipientType } from "./RecipientForm";
import { UploadedFile } from "./EnhancedFileUpload";
import { validateDocumentForm, ValidationField } from "./ValidationModal";
import { FlatCourt } from "@/data/armenianCourts";
import { FlatProsecutor } from "@/data/armenianProsecutors";
import { FlatGovernmentBody } from "@/data/armenianGovernment";
import { FlatInvestigativeBody } from "@/data/armenianInvestigativeBodies";
import { FlatCommitteeService } from "@/data/armenianCommitteesServices";

interface DocumentTemplate {
  id: string;
  category: string;
  subcategory: string | null;
  name_hy: string;
  name_ru: string;
  name_en: string;
  required_fields: string[];
}

interface DynamicFieldsState {
  claimAmount: string;
  courtFee: string;
  currentMeasure: string;
  proposedAlternative: string;
  thirdParties: Array<{ id: string; fullName: string; address: string; role: string }>;
  coDefendants: Array<{ id: string; fullName: string; address: string; role: string }>;
  requirements: Array<{ id: string; text: string }>;
}

interface CaseData {
  id: string;
  title: string;
  case_number: string;
  case_type?: string;
  court?: string;
  facts?: string;
  legal_question?: string;
  description?: string;
  notes?: string;
}

export function useDocumentGenerator(
  caseData: CaseData | undefined,
  preselectedType: 'appeal' | 'cassation' | null | undefined,
  referencesText?: string
) {
  const { t, i18n } = useTranslation(["cases", "common"]);
  const { toast } = useToast();

  // Templates
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("template");

  // Form fields
  const [recipientName, setRecipientName] = useState("");
  const [recipientPosition, setRecipientPosition] = useState("");
  const [recipientOrganization, setRecipientOrganization] = useState("");
  const [recipientType, setRecipientType] = useState<RecipientType>("court");
  const [senderName, setSenderName] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderContact, setSenderContact] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [fileExtractedText, setFileExtractedText] = useState("");
  const [language, setLanguage] = useState(i18n.language);

  // Selectors data
  const [selectedCourtId, setSelectedCourtId] = useState("");
  const [selectedCourtData, setSelectedCourtData] = useState<FlatCourt | null>(null);
  const [selectedProsecutorId, setSelectedProsecutorId] = useState("");
  const [selectedProsecutorData, setSelectedProsecutorData] = useState<FlatProsecutor | null>(null);
  const [selectedGovernmentId, setSelectedGovernmentId] = useState("");
  const [selectedGovernmentData, setSelectedGovernmentData] = useState<FlatGovernmentBody | null>(null);
  const [selectedInvestigativeId, setSelectedInvestigativeId] = useState("");
  const [selectedInvestigativeData, setSelectedInvestigativeData] = useState<FlatInvestigativeBody | null>(null);
  const [selectedCommitteeId, setSelectedCommitteeId] = useState("");
  const [selectedCommitteeData, setSelectedCommitteeData] = useState<FlatCommitteeService | null>(null);

  // Enhanced features
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dynamicFields, setDynamicFields] = useState<DynamicFieldsState>({
    claimAmount: "",
    courtFee: "",
    currentMeasure: "",
    proposedAlternative: "",
    thirdParties: [],
    coDefendants: [],
    requirements: []
  });
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationFields, setValidationFields] = useState<ValidationField[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Auto-select template when preselectedType changes
  useEffect(() => {
    if (preselectedType && templates.length > 0 && !selectedTemplate) {
      const caseType = caseData?.case_type || 'civil';
      
      const categoryMap: Record<string, string> = {
        criminal: 'criminal_process',
        civil: 'civil_process',
        administrative: 'administrative_process',
      };
      const targetCategory = categoryMap[caseType] || 'civil_process';
      
      let matchingTemplate: DocumentTemplate | undefined;
      
      if (preselectedType === 'appeal') {
        matchingTemplate = templates.find(t => 
          t.category === targetCategory && 
          (t.subcategory === 'appeal' || t.name_ru.toLowerCase().includes('\u0430\u043F\u0435\u043B\u043B\u044F\u0446'))
        );
      } else if (preselectedType === 'cassation') {
        matchingTemplate = templates.find(t => 
          t.category === targetCategory && 
          (t.subcategory === 'cassation' || t.name_ru.toLowerCase().includes('\u043A\u0430\u0441\u0441\u0430\u0446'))
        );
      }
      
      if (!matchingTemplate) {
        matchingTemplate = templates.find(t => 
          preselectedType === 'appeal' 
            ? (t.subcategory === 'appeal' || t.name_ru.toLowerCase().includes('\u0430\u043F\u0435\u043B\u043B\u044F\u0446'))
            : (t.subcategory === 'cassation' || t.name_ru.toLowerCase().includes('\u043A\u0430\u0441\u0441\u0430\u0446'))
        );
      }
      
      if (matchingTemplate) {
        setSelectedTemplate(matchingTemplate);
        setRecipientType('court');
      }
    }
  }, [preselectedType, templates, caseData?.case_type, selectedTemplate]);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .eq("is_active", true)
        .order("category", { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast({
        title: t("common:error"),
        description: t("cases:template_loading_error"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTemplateName = useCallback((template: DocumentTemplate) => {
    switch (i18n.language) {
      case 'hy': return template.name_hy;
      case 'en': return template.name_en;
      default: return template.name_ru;
    }
  }, [i18n.language]);

  const handleValidate = useCallback(() => {
    const fields = validateDocumentForm({
      selectedTemplate,
      senderName,
      senderAddress,
      senderContact,
      recipientOrganization,
      recipientName,
      recipientPosition,
      sourceText,
      fileExtractedText
    }, i18n.language);
    
    setValidationFields(fields);
    setShowValidationModal(true);
  }, [selectedTemplate, senderName, senderAddress, senderContact, recipientOrganization, recipientName, recipientPosition, sourceText, fileExtractedText, i18n.language]);

  const handleGenerate = async () => {
    if (!selectedTemplate) {
      toast({
        title: t("common:error"),
        description: t("cases:select_document_type"),
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedContent("");
    setShowValidationModal(false);

    try {
      let finalRecipientOrg = recipientOrganization;
      let recipientAddress: string | null = null;
      let recipientPhones: string[] | null = null;
      let recipientEmail: string | null = null;

      if (selectedCourtData) {
        const courtName = language === 'hy' ? selectedCourtData.fullName_hy : 
                          language === 'en' ? selectedCourtData.fullName_en : 
                          selectedCourtData.fullName_ru;
        finalRecipientOrg = courtName;
        recipientAddress = selectedCourtData.address || null;
        recipientPhones = selectedCourtData.phones || null;
      } else if (selectedProsecutorData) {
        const prosecutorName = language === 'hy' ? selectedProsecutorData.fullName_hy : 
                                language === 'en' ? selectedProsecutorData.fullName_en : 
                                selectedProsecutorData.fullName_ru;
        finalRecipientOrg = prosecutorName;
        recipientAddress = selectedProsecutorData.address || null;
        recipientPhones = selectedProsecutorData.phones || null;
        recipientEmail = selectedProsecutorData.email || null;
      } else if (selectedGovernmentData) {
        const govName = language === 'hy' ? selectedGovernmentData.fullName_hy : 
                        language === 'en' ? selectedGovernmentData.fullName_en : 
                        selectedGovernmentData.fullName_ru;
        finalRecipientOrg = govName;
        recipientAddress = selectedGovernmentData.address || null;
        recipientPhones = selectedGovernmentData.phones || null;
        recipientEmail = selectedGovernmentData.email || null;
      } else if (selectedInvestigativeData) {
        const invName = language === 'hy' ? selectedInvestigativeData.fullName_hy : 
                        language === 'en' ? selectedInvestigativeData.fullName_en : 
                        selectedInvestigativeData.fullName_ru;
        finalRecipientOrg = invName;
        recipientAddress = selectedInvestigativeData.address || null;
        recipientPhones = selectedInvestigativeData.phones || null;
        recipientEmail = selectedInvestigativeData.email || null;
      } else if (selectedCommitteeData) {
        const commName = language === 'hy' ? selectedCommitteeData.fullName_hy : 
                         language === 'en' ? selectedCommitteeData.fullName_en : 
                         selectedCommitteeData.fullName_ru;
        finalRecipientOrg = commName;
        recipientAddress = selectedCommitteeData.address || null;
        recipientPhones = selectedCommitteeData.phones || null;
        recipientEmail = selectedCommitteeData.email || null;
      }

      const additionalFields = {
        ...dynamicFields,
        uploadedFiles: uploadedFiles.map((f, idx) => ({
          name: f.file.name,
          description: f.description,
          attachmentNumber: idx + 1,
          extractedText: f.extractedText
        }))
      };

      const requestBody: Record<string, unknown> = {
        templateId: selectedTemplate.id,
        templateName: getTemplateName(selectedTemplate),
        category: selectedTemplate.category,
        subcategory: selectedTemplate.subcategory,
        caseData: caseData || null,
        sourceText: sourceText || null,
        fileExtractedText: fileExtractedText || null,
        recipientName,
        recipientPosition,
        recipientOrganization: finalRecipientOrg,
        recipientAddress,
        recipientPhones,
        recipientEmail,
        senderName,
        senderAddress,
        senderContact,
        language,
        additionalFields
      };
      if (referencesText?.trim()) {
        requestBody.referencesText = referencesText;
      }

      const { data, error } = await supabase.functions.invoke("generate-document", {
        body: requestBody,
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setGeneratedContent(data.content);
      setEditedContent(data.content);
      setIsEditing(false);
      setShowPreviewModal(true);
      
      toast({
        title: t("cases:document_created"),
        description: t("cases:document_generated_success"),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t("cases:generation_error");
      console.error("Generation error:", error);
      toast({
        title: t("common:error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (): Promise<boolean> => {
    const contentToSave = editedContent || generatedContent;
    if (!contentToSave) return false;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("generated_documents").insert({
        case_id: caseData?.id || null,
        template_id: selectedTemplate?.id || null,
        user_id: user.id,
        title: selectedTemplate ? getTemplateName(selectedTemplate) : "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442",
        recipient_name: recipientName,
        recipient_position: recipientPosition,
        recipient_organization: recipientOrganization,
        sender_name: senderName,
        sender_address: senderAddress,
        sender_contact: senderContact,
        content_text: contentToSave,
        source_text: sourceText || caseData?.facts || null,
        status: "draft",
      });

      if (error) throw error;

      toast({
        title: t("cases:document_saved"),
        description: t("cases:document_saved_to_drafts"),
      });
      
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : t("cases:save_error");
      console.error("Save error:", error);
      toast({
        title: t("common:error"),
        description: errorMessage,
        variant: "destructive",
      });
      return false;
    }
  };

  const handleLoadFromHistory = useCallback((doc: { content_text: string; title: string }) => {
    setGeneratedContent(doc.content_text);
    setEditedContent(doc.content_text);
    setShowPreviewModal(true);
  }, []);

  return {
    // Templates
    templates,
    selectedTemplate,
    setSelectedTemplate,
    isLoading,
    getTemplateName,

    // Generation
    isGenerating,
    generatedContent,
    editedContent,
    setEditedContent,
    isEditing,
    setIsEditing,
    activeTab,
    setActiveTab,
    handleGenerate,
    handleSave,
    handleValidate,
    handleLoadFromHistory,

    // Recipient
    recipientType,
    setRecipientType,
    recipientName,
    setRecipientName,
    recipientPosition,
    setRecipientPosition,
    recipientOrganization,
    setRecipientOrganization,
    selectedCourtId,
    setSelectedCourtId,
    selectedCourtData,
    setSelectedCourtData,
    selectedProsecutorId,
    setSelectedProsecutorId,
    selectedProsecutorData,
    setSelectedProsecutorData,
    selectedGovernmentId,
    setSelectedGovernmentId,
    selectedGovernmentData,
    setSelectedGovernmentData,
    selectedInvestigativeId,
    setSelectedInvestigativeId,
    selectedInvestigativeData,
    setSelectedInvestigativeData,
    selectedCommitteeId,
    setSelectedCommitteeId,
    selectedCommitteeData,
    setSelectedCommitteeData,

    // Sender
    senderName,
    setSenderName,
    senderAddress,
    setSenderAddress,
    senderContact,
    setSenderContact,

    // Source text
    sourceText,
    setSourceText,
    fileExtractedText,
    setFileExtractedText,
    language,
    setLanguage,

    // Enhanced features
    uploadedFiles,
    setUploadedFiles,
    dynamicFields,
    setDynamicFields,
    showValidationModal,
    setShowValidationModal,
    validationFields,
    showPreviewModal,
    setShowPreviewModal,
  };
}
