import { Files, Loader2, CheckCircle, AlertCircle, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getComplaintTypeLabel } from "../constants";
import type { ComplaintType, UploadedFile } from "../types";

// =============================================================================
// STEP 3: Upload Documents
// =============================================================================

interface StepUploadDocumentsProps {
  lang: string;
  getText: (hy: string, ru: string, en: string) => string;
  complaintType: ComplaintType;
  files: UploadedFile[];
  additionalInfo: string;
  respondentInfo: string;
  isProcessing: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (id: string) => void;
  onAdditionalInfoChange: (value: string) => void;
  onRespondentInfoChange: (value: string) => void;
}

export function StepUploadDocuments({
  lang,
  getText,
  complaintType,
  files,
  additionalInfo,
  respondentInfo,
  isProcessing,
  onFileUpload,
  onRemoveFile,
  onAdditionalInfoChange,
  onRespondentInfoChange
}: StepUploadDocumentsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {getText(
            "\u054E\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u0584 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580\u0568",
            "Загрузите документы",
            "Upload documents"
          )}
        </h3>
        <Badge variant="secondary">{getComplaintTypeLabel(complaintType, lang)}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {getText(
          "\u054E\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u0584 \u0564\u0561\u057F\u0561\u057E\u0573\u056B\u057C, \u0578\u0580\u0578\u0577\u0578\u0582\u0574\u0576\u0565\u0580, \u0561\u057A\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580 \u0587 \u0561\u0575\u056C \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580, \u0578\u0580\u0578\u0576\u0581 AI-\u0576 \u056F\u057E\u0565\u0580\u056C\u0578\u0582\u056E\u056B \u0562\u0578\u0572\u0578\u0584 \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u0576\u0565\u056C\u0578\u0582 \u0570\u0561\u0574\u0561\u0580",
          "Загрузите решения суда, постановления, доказательства и другие документы для AI-анализа",
          "Upload court decisions, rulings, evidence and other documents for AI analysis"
        )}
      </p>

      {/* Upload zone */}
      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
        <input
          type="file"
          id="complaint-file-upload"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.txt,.md,.docx"
          onChange={onFileUpload}
          disabled={isProcessing}
          multiple
        />
        <label htmlFor="complaint-file-upload" className="cursor-pointer flex flex-col items-center gap-2">
          {isProcessing ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <Files className="h-8 w-8 text-muted-foreground" />
          )}
          <span className="text-sm text-muted-foreground">
            {isProcessing 
              ? getText("\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u057E\u0578\u0582\u0574 \u0567...", "Анализируем...", "Analyzing...")
              : getText("PDF, \u057A\u0561\u057F\u056F\u0565\u0580\u0576\u0565\u0580, \u057F\u0565\u0584\u057D\u057F", "PDF, изображения, текст", "PDF, images, text")
            }
          </span>
        </label>
      </div>

      {/* Files list */}
      {files.length > 0 && (
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {files.map((f) => (
            <div key={f.id} className="border rounded-lg p-3 bg-muted/30 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  {f.status === "processing" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {f.status === "success" && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {f.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                  {f.status === "pending" && <FileText className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm truncate">{f.file.name}</span>
                  {f.status === "success" && (
                    <Badge variant="secondary" className="text-xs">
                      {f.extractedText.length} {getText("\u0576\u056B\u0577", "симв", "chars")}
                    </Badge>
                  )}
                </div>

                {f.status === "error" && f.errorMessage && (
                  <p className="mt-1 text-xs text-destructive truncate">{f.errorMessage}</p>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => onRemoveFile(f.id)} className="h-7 w-7">
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Respondent info */}
      <div className="space-y-2">
        <Label>
          {getText(
            "\u054A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0561\u057F\u0578\u0582",
            "Ответчик",
            "Respondent"
          )}
        </Label>
        <Textarea
          value={respondentInfo}
          onChange={(e) => onRespondentInfoChange(e.target.value)}
          placeholder={getText(
            "\u054A\u0561\u057F\u0561\u057D\u056D\u0561\u0576\u0561\u057F\u0578\u0582\u056B \u0561\u0576\u0578\u0582\u0576\u0568, \u0570\u0561\u057D\u0581\u0565\u0568, \u056F\u0561\u0566\u0574\u0561\u056F\u0565\u0580\u057A\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568...",
            "ФИО ответчика, адрес, название организации...",
            "Respondent name, address, organization..."
          )}
          className="min-h-[80px]"
        />
      </div>

      {/* Additional info */}
      <div className="space-y-2">
        <Label>
          {getText(
            "\u053C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576 (\u056F\u0561\u0574\u0568\u0576\u057F\u0580\u0561\u056F\u0561\u0576)",
            "Дополнительная информация (опционально)",
            "Additional information (optional)"
          )}
        </Label>
        <Textarea
          value={additionalInfo}
          onChange={(e) => onAdditionalInfoChange(e.target.value)}
          placeholder={getText(
            "\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0565\u0584 \u056C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u0570\u0561\u0576\u0563\u0561\u0574\u0561\u0576\u0584\u0576\u0565\u0580, \u0583\u0561\u057D\u057F\u0565\u0580, \u057A\u0561\u0570\u0561\u0576\u057B\u0576\u0565\u0580...",
            "Опишите дополнительные обстоятельства, факты, требования...",
            "Describe additional circumstances, facts, requirements..."
          )}
          className="min-h-[100px]"
        />
      </div>
    </div>
  );
}
