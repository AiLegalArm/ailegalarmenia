import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, CheckCircle, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationField {
  field: string;
  label: string;
  required: boolean;
  filled: boolean;
  recommendation?: string;
}

interface ValidationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: ValidationField[];
  onProceed: () => void;
  onCancel: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ValidationModal({
  open,
  onOpenChange,
  fields,
  onProceed,
  onCancel
}: ValidationModalProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  const labels = {
    title: lang === "hy" ? "\u054f\u057e\u0575\u0561\u056c\u0576\u0565\u0580\u056b \u057d\u057f\u0578\u0582\u0563\u0578\u0582\u0574" : lang === "ru" ? "\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430 \u0434\u0430\u043d\u043d\u044b\u0445" : "Data Validation",
    allValid: lang === "hy" ? "\u0532\u0578\u056c\u0578\u0580 \u057a\u0561\u0580\u057f\u0561\u0564\u056b\u0580 \u0564\u0561\u0577\u057f\u0565\u0580\u0568 \u056c\u0580\u0561\u0581\u057e\u0561\u056e \u0565\u0576" : lang === "ru" ? "\u0412\u0441\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u044b" : "All required fields are filled",
    missingRequired: lang === "hy" ? "\u0532\u0561\u0581\u0561\u056f\u0561\u0575\u0578\u0582\u0574 \u0565\u0576 \u057a\u0561\u0580\u057f\u0561\u0564\u056b\u0580 \u0564\u0561\u0577\u057f\u0565\u0580" : lang === "ru" ? "\u041e\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044e\u0442 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f" : "Missing required fields",
    optional: lang === "hy" ? "\u053c\u0580\u0561\u0581\u0578\u0582\u0581\u056b\u0579" : lang === "ru" ? "\u0414\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u043e" : "Optional",
    required: lang === "hy" ? "\u054a\u0561\u0580\u057f\u0561\u0564\u056b\u0580" : lang === "ru" ? "\u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e" : "Required",
    filled: lang === "hy" ? "\u053c\u0580\u0561\u0581\u057e\u0561\u056e" : lang === "ru" ? "\u0417\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u043e" : "Filled",
    empty: lang === "hy" ? "\u0534\u0561\u057f\u0561\u0580\u056f" : lang === "ru" ? "\u041f\u0443\u0441\u0442\u043e" : "Empty",
    proceed: lang === "hy" ? "\u0547\u0561\u0580\u0578\u0582\u0576\u0561\u056f\u0565\u056c" : lang === "ru" ? "\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c" : "Proceed",
    goBack: lang === "hy" ? "\u054e\u0565\u0580\u0561\u0564\u0561\u057c\u0576\u0561\u056c" : lang === "ru" ? "\u0412\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f" : "Go back",
    proceedAnyway: lang === "hy" ? "\u0547\u0561\u0580\u0578\u0582\u0576\u0561\u056f\u0565\u056c \u0561\u0575\u0576\u0578\u0582\u0561\u0574\u0565\u0576\u0561\u0575\u0576\u056b\u057e" : lang === "ru" ? "\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0432\u0441\u0451 \u0440\u0430\u0432\u043d\u043e" : "Proceed anyway",
    recommendation: lang === "hy" ? "\u0540\u0561\u0576\u0571\u0576\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : lang === "ru" ? "\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u044f" : "Recommendation",
  };

  const { missingRequired, missingOptional, filledCount, totalRequired, allRequiredFilled } = useMemo(() => {
    const required = fields.filter(f => f.required);
    const optional = fields.filter(f => !f.required);
    
    return {
      missingRequired: required.filter(f => !f.filled),
      missingOptional: optional.filter(f => !f.filled),
      filledCount: fields.filter(f => f.filled).length,
      totalRequired: required.length,
      allRequiredFilled: required.every(f => f.filled)
    };
  }, [fields]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {allRequiredFilled ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
            {labels.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className={cn(
            "p-3 rounded-lg",
            allRequiredFilled ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"
          )}>
            <div className="flex items-center gap-2">
              {allRequiredFilled ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium">{labels.allValid}</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  <span className="font-medium">{labels.missingRequired}: {missingRequired.length}</span>
                </>
              )}
            </div>
          </div>

          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4">
              {/* Missing Required Fields */}
              {missingRequired.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-destructive flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    {labels.required}
                  </h4>
                  {missingRequired.map(field => (
                    <div
                      key={field.field}
                      className="p-3 rounded-lg border border-destructive/30 bg-destructive/5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{field.label}</span>
                        <Badge variant="destructive">{labels.empty}</Badge>
                      </div>
                      {field.recommendation && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                          <Info className="h-3 w-3 mt-0.5 shrink-0" />
                          {field.recommendation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Missing Optional Fields */}
              {missingOptional.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    {labels.optional}
                  </h4>
                  {missingOptional.map(field => (
                    <div
                      key={field.field}
                      className="p-2 rounded-lg border border-muted bg-muted/30"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{field.label}</span>
                        <Badge variant="outline">{labels.optional}</Badge>
                      </div>
                      {field.recommendation && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {field.recommendation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Filled Fields */}
              {filledCount > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-green-600 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {labels.filled} ({filledCount})
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {fields.filter(f => f.filled).map(field => (
                      <Badge key={field.field} variant="secondary" className="text-xs">
                        {field.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            {labels.goBack}
          </Button>
          <Button 
            onClick={onProceed}
            variant={allRequiredFilled ? "default" : "secondary"}
          >
            {allRequiredFilled ? labels.proceed : labels.proceedAnyway}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// VALIDATION HELPER
// =============================================================================

interface FormData {
  selectedTemplate: { id: string; name_hy: string; name_ru: string; name_en: string } | null;
  senderName: string;
  senderAddress: string;
  senderContact: string;
  recipientOrganization: string;
  recipientName: string;
  recipientPosition: string;
  sourceText: string;
  fileExtractedText: string;
}

export function validateDocumentForm(
  formData: FormData,
  lang: string
): ValidationField[] {
  const t = (hy: string, ru: string, en: string) => 
    lang === "hy" ? hy : lang === "ru" ? ru : en;

  const getTemplateName = (template: FormData["selectedTemplate"]) => {
    if (!template) return "";
    return lang === "hy" ? template.name_hy : lang === "ru" ? template.name_ru : template.name_en;
  };

  return [
    {
      field: "template",
      label: t("\u0553\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u056b \u057f\u0565\u057d\u0561\u056f", "\u0422\u0438\u043f \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430", "Document type"),
      required: true,
      filled: !!formData.selectedTemplate,
      recommendation: t(
        "\u0538\u0576\u057f\u0580\u0565\u0584 \u0583\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u056b \u057f\u0565\u057d\u0561\u056f\u0568 \u0571\u0561\u056d \u0581\u0578\u0582\u0581\u0561\u056f\u056b\u0581",
        "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0438\u043f \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430 \u0438\u0437 \u0441\u043f\u0438\u0441\u043a\u0430 \u0441\u043b\u0435\u0432\u0430",
        "Select document type from the list"
      )
    },
    {
      field: "senderName",
      label: t("\u0531\u0576\u0578\u0582\u0576 \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576 (\u0564\u056b\u0574\u0578\u0572)", "\u0424\u0418\u041e (\u0437\u0430\u044f\u0432\u0438\u0442\u0435\u043b\u044c)", "Full name (applicant)"),
      required: true,
      filled: !!formData.senderName.trim(),
      recommendation: t(
        "\u0544\u0578\u0582\u057f\u0584\u0561\u0563\u0580\u0565\u0584 \u0541\u0565\u0580 \u0561\u0576\u0578\u0582\u0576\u0568, \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576\u0568, \u0570\u0561\u0575\u0580\u0561\u0576\u0578\u0582\u0576\u0568",
        "\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0432\u0430\u0448\u0438 \u0444\u0430\u043c\u0438\u043b\u0438\u044e, \u0438\u043c\u044f \u0438 \u043e\u0442\u0447\u0435\u0441\u0442\u0432\u043e",
        "Enter your full name"
      )
    },
    {
      field: "senderAddress",
      label: t("\u0540\u0561\u057d\u0581\u0565 (\u0564\u056b\u0574\u0578\u0572)", "\u0410\u0434\u0440\u0435\u0441 (\u0437\u0430\u044f\u0432\u0438\u0442\u0435\u043b\u044c)", "Address (applicant)"),
      required: true,
      filled: !!formData.senderAddress.trim(),
      recommendation: t(
        "\u0544\u0578\u0582\u057f\u0584\u0561\u0563\u0580\u0565\u0584 \u0541\u0565\u0580 \u0562\u0576\u0561\u056f\u0578\u0582\u0569\u0575\u0561\u0576 \u056f\u0561\u0574 \u0563\u0580\u0561\u0576\u0581\u0574\u0561\u0576 \u0570\u0561\u057d\u0581\u0565\u0576",
        "\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u043f\u0440\u043e\u0436\u0438\u0432\u0430\u043d\u0438\u044f \u0438\u043b\u0438 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438",
        "Enter your residential or registration address"
      )
    },
    {
      field: "senderContact",
      label: t("\u053f\u0578\u0576\u057f\u0561\u056f\u057f\u0576\u0565\u0580", "\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u044b", "Contacts"),
      required: false,
      filled: !!formData.senderContact.trim(),
      recommendation: t(
        "\u0540\u0565\u057c\u0561\u056d\u0578\u057d\u0561\u0570\u0561\u0574\u0561\u0580 \u0587/\u056f\u0561\u0574 \u0567\u056c. \u0583\u0578\u057d\u057f",
        "\u0422\u0435\u043b\u0435\u0444\u043e\u043d \u0438/\u0438\u043b\u0438 email",
        "Phone and/or email"
      )
    },
    {
      field: "recipientOrganization",
      label: t("\u0540\u0561\u057d\u0581\u0565\u0561\u057f\u0565\u0580 \u056f\u0561\u0566\u0574\u0561\u056f\u0565\u0580\u057a\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f-\u0430\u0434\u0440\u0435\u0441\u0430\u0442", "Recipient organization"),
      required: true,
      filled: !!formData.recipientOrganization.trim(),
      recommendation: t(
        "\u0538\u0576\u057f\u0580\u0565\u0584 \u0564\u0561\u057f\u0561\u0580\u0561\u0576\u0568, \u0564\u0561\u057f\u0561\u056d\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u056f\u0561\u0574 \u0561\u0575\u056c \u0574\u0561\u0580\u0574\u056b\u0576\u0568",
        "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0443\u0434, \u043f\u0440\u043e\u043a\u0443\u0440\u0430\u0442\u0443\u0440\u0443 \u0438\u043b\u0438 \u0434\u0440\u0443\u0433\u043e\u0439 \u043e\u0440\u0433\u0430\u043d",
        "Select court, prosecutor's office, or other body"
      )
    },
    {
      field: "recipientName",
      label: t("\u0540\u0561\u057d\u0581\u0565\u0561\u057f\u0565\u0580 \u0561\u0576\u0578\u0582\u0576", "\u0424\u0418\u041e \u0430\u0434\u0440\u0435\u0441\u0430\u0442\u0430", "Recipient name"),
      required: false,
      filled: !!formData.recipientName.trim()
    },
    {
      field: "recipientPosition",
      label: t("\u0540\u0561\u057d\u0581\u0565\u0561\u057f\u0565\u0580 \u057a\u0561\u0577\u057f\u0578\u0576", "\u0414\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c \u0430\u0434\u0440\u0435\u0441\u0430\u0442\u0430", "Recipient position"),
      required: false,
      filled: !!formData.recipientPosition.trim()
    },
    {
      field: "sourceText",
      label: t("\u053b\u0580\u0561\u057e\u056b\u0573\u0561\u056f\u056b \u0576\u056f\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u0438", "Situation description"),
      required: true,
      filled: !!(formData.sourceText.trim() || formData.fileExtractedText.trim()),
      recommendation: t(
        "\u0546\u056f\u0561\u0580\u0561\u0563\u0580\u0565\u0584 \u056b\u0580\u0561\u057e\u056b\u0573\u0561\u056f\u0568 \u056f\u0561\u0574 \u057e\u0565\u0580\u0562\u0565\u057c\u0576\u0565\u0584 \u0583\u0561\u057d\u057f\u0561\u0569\u0572\u0569\u0565\u0580",
        "\u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044e \u0438\u043b\u0438 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b",
        "Describe the situation or upload documents"
      )
    }
  ];
}
