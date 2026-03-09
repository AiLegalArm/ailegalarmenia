import { useTranslation } from "react-i18next";
import { getText } from "@/lib/i18n-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, CheckCircle2, History } from "lucide-react";
import { DocumentTemplateList } from "./DocumentTemplateList";
import { DocumentPreview } from "./DocumentPreview";
import { DocumentEditor } from "./DocumentEditor";
import { DynamicDocumentFields } from "./DynamicDocumentFields";
import { ValidationModal } from "./ValidationModal";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { DocumentHistory } from "./DocumentHistory";
import { RecipientForm } from "./RecipientForm";
import { SenderForm } from "./SenderForm";
import { SourceTextForm } from "./SourceTextForm";
import { LanguageSelector } from "./LanguageSelector";
import { useDocumentGenerator } from "./useDocumentGenerator";
import { useReferencesText } from "@/lib/references-store";
interface DocumentGeneratorProps {
  caseData?: {
    id: string;
    title: string;
    case_number: string;
    case_type?: string;
    court?: string;
    facts?: string;
    legal_question?: string;
    description?: string;
    notes?: string;
  };
  preselectedType?: 'appeal' | 'cassation' | null;
}

export function DocumentGenerator({ caseData, preselectedType }: DocumentGeneratorProps) {
  const { t, i18n } = useTranslation(["cases", "common"]);
  const storeReferencesText = useReferencesText(caseData?.id);

  const {
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
    setSelectedCourtData,
    selectedProsecutorId,
    setSelectedProsecutorId,
    setSelectedProsecutorData,
    selectedGovernmentId,
    setSelectedGovernmentId,
    setSelectedGovernmentData,
    selectedInvestigativeId,
    setSelectedInvestigativeId,
    setSelectedInvestigativeData,
    selectedCommitteeId,
    setSelectedCommitteeId,
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
    setFileExtractedText,
    language,
    setLanguage,

    // Enhanced features
    uploadedFiles,
    setUploadedFiles,
    setDynamicFields,
    showValidationModal,
    setShowValidationModal,
    validationFields,
    showPreviewModal,
    setShowPreviewModal,
  } = useDocumentGenerator(caseData, preselectedType, storeReferencesText || undefined);

  const labels = {
    validate: getText("\u054d\u057f\u0578\u0582\u0563\u0565\u056c \u057f\u057e\u0575\u0561\u056c\u0576\u0565\u0580\u0568", "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435", "Validate data"),
    history: getText("\u054a\u0561\u057f\u0574\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u0418\u0441\u0442\u043e\u0440\u0438\u044f", "History"),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <TabsList className="inline-flex w-max gap-1 sm:grid sm:w-full sm:grid-cols-3 min-h-[44px]">
            <TabsTrigger value="template" className="min-h-[44px] px-3 sm:px-4 text-mobile-sm sm:text-sm whitespace-nowrap">
              {t("cases:template_select_tab")}
            </TabsTrigger>
            <TabsTrigger value="result" disabled={!generatedContent} className="min-h-[44px] px-3 sm:px-4 text-mobile-sm sm:text-sm whitespace-nowrap">
              {t("cases:result_tab")}
            </TabsTrigger>
            <TabsTrigger value="history" className="min-h-[44px] px-3 sm:px-4 text-mobile-sm sm:text-sm whitespace-nowrap flex items-center gap-1">
              <History className="h-3 w-3 shrink-0" />
              <span className="truncate">{labels.history}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="template" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Template Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t("cases:document_type")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DocumentTemplateList
                  templates={templates}
                  selectedTemplate={selectedTemplate}
                  onSelect={setSelectedTemplate}
                  getTemplateName={getTemplateName}
                  recipientType={recipientType}
                />
              </CardContent>
            </Card>

            {/* Form Fields */}
            <div className="space-y-4">
              <RecipientForm
                recipientType={recipientType}
                onRecipientTypeChange={setRecipientType}
                recipientName={recipientName}
                onRecipientNameChange={setRecipientName}
                recipientPosition={recipientPosition}
                onRecipientPositionChange={setRecipientPosition}
                recipientOrganization={recipientOrganization}
                onRecipientOrganizationChange={setRecipientOrganization}
                selectedCourtId={selectedCourtId}
                onCourtChange={(id, data) => {
                  setSelectedCourtId(id);
                  setSelectedCourtData(data);
                }}
                selectedProsecutorId={selectedProsecutorId}
                onProsecutorChange={(id, data) => {
                  setSelectedProsecutorId(id);
                  setSelectedProsecutorData(data);
                }}
                selectedGovernmentId={selectedGovernmentId}
                onGovernmentChange={(id, data) => {
                  setSelectedGovernmentId(id);
                  setSelectedGovernmentData(data);
                }}
                selectedInvestigativeId={selectedInvestigativeId}
                onInvestigativeChange={(id, data) => {
                  setSelectedInvestigativeId(id);
                  setSelectedInvestigativeData(data);
                }}
                selectedCommitteeId={selectedCommitteeId}
                onCommitteeChange={(id, data) => {
                  setSelectedCommitteeId(id);
                  setSelectedCommitteeData(data);
                }}
                onTemplateReset={() => setSelectedTemplate(null)}
              />

              <SenderForm
                senderName={senderName}
                onSenderNameChange={setSenderName}
                senderAddress={senderAddress}
                onSenderAddressChange={setSenderAddress}
                senderContact={senderContact}
                onSenderContactChange={setSenderContact}
              />

              {/* Dynamic Document Fields */}
              {selectedTemplate && (
                <DynamicDocumentFields
                  templateId={selectedTemplate.id}
                  category={selectedTemplate.category}
                  subcategory={selectedTemplate.subcategory}
                  onFieldsChange={setDynamicFields}
                />
              )}

              <SourceTextForm
                sourceText={sourceText}
                onSourceTextChange={setSourceText}
                uploadedFiles={uploadedFiles}
                onFilesChange={setUploadedFiles}
                onExtractedTextChange={setFileExtractedText}
                isGenerating={isGenerating}
                hasCaseData={!!caseData}
              />

              <LanguageSelector
                language={language}
                onLanguageChange={setLanguage}
              />

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={handleValidate}
                  disabled={isGenerating}
                  className="flex-1"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {labels.validate}
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!selectedTemplate || isGenerating}
                  className="flex-1"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("cases:generating")}
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      {t("cases:generate_document_btn")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="result">
          {generatedContent && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedTemplate ? getTemplateName(selectedTemplate) : "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <DocumentEditor
                    content={editedContent}
                    onChange={setEditedContent}
                    editable={true}
                  />
                ) : (
                  <DocumentPreview content={editedContent || generatedContent} />
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <DocumentHistory
            onLoadDocument={handleLoadFromHistory}
            onClose={() => setActiveTab("template")}
          />
        </TabsContent>
      </Tabs>

      {/* Validation Modal */}
      <ValidationModal
        open={showValidationModal}
        onOpenChange={setShowValidationModal}
        fields={validationFields}
        onProceed={handleGenerate}
        onCancel={() => setShowValidationModal(false)}
      />

      {/* Preview Modal */}
      <DocumentPreviewModal
        open={showPreviewModal}
        onOpenChange={setShowPreviewModal}
        content={editedContent || generatedContent}
        title={selectedTemplate ? getTemplateName(selectedTemplate) : "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442"}
        onEdit={() => {
          setShowPreviewModal(false);
          setIsEditing(true);
          setActiveTab("result");
        }}
        onRegenerate={handleGenerate}
        onSave={handleSave}
        isGenerating={isGenerating}
      />
    </div>
  );
}
