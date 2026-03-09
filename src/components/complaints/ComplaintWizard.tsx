import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getText } from "@/lib/i18n-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Check, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Internal modules
import type { WizardState, ComplaintCategory, ComplaintType } from "./types";

import { useComplaintFiles } from "./useComplaintFiles";
import { useComplaintGenerator } from "./useComplaintGenerator";
import { 
  StepCategorySelect, 
  StepComplaintTypeSelect, 
  StepUploadDocuments, 
  StepResult 
} from "./steps";

// =============================================================================
// INITIAL STATE
// =============================================================================

const INITIAL_STATE: WizardState = {
  step: 1,
  category: null,
  complaintType: null,
  files: [],
  additionalInfo: "",
  respondentInfo: "",
  isProcessing: false,
  isGenerating: false,
  generatedContent: ""
};

// =============================================================================
// COMPLAINT WIZARD COMPONENT
// =============================================================================

interface ComplaintWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplaintWizard({ open, onOpenChange }: ComplaintWizardProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  // Using centralized getText from @/lib/i18n-utils

  // File handling hook
  const { handleFileUpload, removeFile } = useComplaintFiles({
    lang,
    getText,
    onFilesChange: (updater) => setState(prev => ({ 
      ...prev, 
      files: typeof updater === "function" ? updater(prev.files) : updater 
    })),
    onProcessingChange: (isProcessing) => setState(prev => ({ ...prev, isProcessing }))
  });

  // Generation hook
  const { handleGenerate } = useComplaintGenerator({
    lang,
    getText,
    onGeneratingChange: (isGenerating) => setState(prev => ({ ...prev, isGenerating })),
    onContentGenerated: (content) => setState(prev => ({ ...prev, generatedContent: content })),
    onStepChange: (step) => setState(prev => ({ ...prev, step }))
  });

  // Navigation handlers
  const handleCategorySelect = (category: ComplaintCategory) => {
    setState(prev => ({ ...prev, category, step: 2 }));
  };

  const handleComplaintTypeSelect = (complaintType: ComplaintType) => {
    setState(prev => ({ ...prev, complaintType, step: 3 }));
  };

  const goBack = () => {
    if (state.step > 1) {
      setState(prev => ({ ...prev, step: prev.step - 1, generatedContent: "" }));
    }
  };

  const reset = () => {
    setState(INITIAL_STATE);
  };

  const onGenerate = (extraInfo?: string) => {
    if (state.complaintType && state.category) {
      const combinedInfo = extraInfo
        ? `${state.additionalInfo}\n\n--- Дополнительные данные (повторная генерация) ---\n${extraInfo}`
        : state.additionalInfo;
      handleGenerate({
        complaintType: state.complaintType,
        category: state.category,
        files: state.files,
        additionalInfo: combinedInfo,
        respondentInfo: state.respondentInfo
      });
    }
  };

  // Progress calculation
  const progress = (state.step / 4) * 100;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <span className="break-words">
              {getText(
                "AI \u0532\u0578\u0572\u0578\u0584\u0576\u0565\u0580\u056B \u0587 \u0570\u0561\u0575\u0581\u0565\u0580\u056B \u0563\u0565\u0576\u0565\u0580\u0561\u057F\u0578\u0580",
                "AI генератор жалоб и исков",
                "AI Complaints & Claims Generator"
              )}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                  state.step >= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {state.step > step ? <Check className="h-3 w-3" /> : step}
                </div>
                {step < 4 && (
                  <ChevronRight className={cn(
                    "h-3 w-3 mx-1", 
                    state.step > step ? "text-primary" : "text-muted-foreground"
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <ScrollArea className="flex-1 pr-4">
          <div className="py-4">
            {state.step === 1 && (
              <StepCategorySelect
                lang={lang}
                getText={getText}
                selectedCategory={state.category}
                onSelect={handleCategorySelect}
              />
            )}
            
            {state.step === 2 && state.category && (
              <StepComplaintTypeSelect
                lang={lang}
                getText={getText}
                category={state.category}
                selectedType={state.complaintType}
                onSelect={handleComplaintTypeSelect}
              />
            )}
            
            {state.step === 3 && state.complaintType && (
              <StepUploadDocuments
                lang={lang}
                getText={getText}
                complaintType={state.complaintType}
                files={state.files}
                additionalInfo={state.additionalInfo}
                respondentInfo={state.respondentInfo}
                isProcessing={state.isProcessing}
                onFileUpload={handleFileUpload}
                onRemoveFile={removeFile}
                onAdditionalInfoChange={(val) => setState(prev => ({ ...prev, additionalInfo: val }))}
                onRespondentInfoChange={(val) => setState(prev => ({ ...prev, respondentInfo: val }))}
              />
            )}
            
            {state.step === 4 && (
              <StepResult
                lang={lang}
                getText={getText}
                isGenerating={state.isGenerating}
                generatedContent={state.generatedContent}
                complaintTypeId={state.complaintType?.id}
                onReset={reset}
                onRegenerate={(missingData) => onGenerate(missingData)}
              />
            )}
          </div>
        </ScrollArea>

        {/* Footer with navigation - sticky on mobile */}
        {state.step > 1 && state.step < 4 && (
          <div className="flex flex-col gap-2 pt-4 border-t mt-auto">
            <Button variant="ghost" onClick={goBack} className="w-full h-11 rounded-xl">
              <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">{getText("\u0540\u0565\u057F", "Назад", "Back")}</span>
            </Button>

            {state.step === 3 && (
              <Button
                onClick={() => onGenerate()}
                className="w-full h-12 rounded-xl text-sm font-medium"
                disabled={state.isProcessing || (state.files.length === 0 && !state.additionalInfo)}
              >
                <Sparkles className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">
                  {getText(
                    "\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0565\u056C \u0562\u0578\u0572\u0578\u0584\u0568",
                    "Сгенерировать жалобу",
                    "Generate Complaint"
                  )}
                </span>
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
