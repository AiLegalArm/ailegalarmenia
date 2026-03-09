import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FileText } from "lucide-react";
import { EnhancedFileUpload, UploadedFile } from "./EnhancedFileUpload";

interface SourceTextFormProps {
  sourceText: string;
  onSourceTextChange: (text: string) => void;
  uploadedFiles: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  onExtractedTextChange: (text: string) => void;
  isGenerating: boolean;
  hasCaseData: boolean;
}

export function SourceTextForm({
  sourceText,
  onSourceTextChange,
  uploadedFiles,
  onFilesChange,
  onExtractedTextChange,
  isGenerating,
  hasCaseData,
}: SourceTextFormProps) {
  const { i18n } = useTranslation();

  const labels = {
    describeYourSituation: i18n.language === 'hy' ? "\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0565\u0584 \u0571\u0565\u0580 \u056B\u0580\u0561\u057E\u056B\u0573\u0561\u056F\u0568" : i18n.language === 'en' ? 'Describe Your Situation' : '\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448\u0443 \u0441\u0438\u0442\u0443\u0430\u0446\u0438\u044E',
    aiWillGenerate: i18n.language === 'hy' ? "\u0531\u0532-\u0576 \u056F\u057D\u057F\u0565\u0572\u056E\u056B \u0574\u0561\u057D\u0576\u0561\u0563\u056B\u057F\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0578\u0582\u0572\u0569 \u0571\u0565\u0580 \u0576\u056F\u0561\u0580\u0561\u0563\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u0570\u056B\u0574\u0561\u0576 \u057E\u0580\u0561" : i18n.language === 'en' ? 'The AI will generate a professional legal document based on your description' : '\u0418\u0418 \u0441\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u0435\u0442 \u043F\u0440\u043E\u0444\u0435\u0441\u0441\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u044E\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442 \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u0432\u0430\u0448\u0435\u0433\u043E \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u044F',
    textareaPlaceholder: i18n.language === 'hy' 
      ? "\u0546\u056F\u0561\u0580\u0561\u0563\u0580\u0565\u0584 \u0571\u0565\u0580 \u0563\u0578\u0580\u056E\u056B \u0583\u0561\u057D\u057F\u0565\u0580\u0568, \u056B\u0576\u0579 \u0567 \u057A\u0561\u057F\u0561\u0570\u0565\u056C, \u056B\u0576\u0579 \u0565\u0584 \u0578\u0582\u0566\u0578\u0582\u0574 \u0570\u0561\u057D\u0576\u0565\u056C, \u0571\u0565\u0580 \u057A\u0561\u0570\u0561\u0576\u057B\u0576\u0565\u0580\u0568..." 
      : i18n.language === 'en'
      ? 'Describe the facts of your case, what happened, what you want to achieve, your demands...' 
      : '\u041E\u043F\u0438\u0448\u0438\u0442\u0435 \u0444\u0430\u043A\u0442\u044B \u0432\u0430\u0448\u0435\u0433\u043E \u0434\u0435\u043B\u0430, \u0447\u0442\u043E \u043F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u043E, \u0447\u0435\u0433\u043E \u0432\u044B \u0445\u043E\u0442\u0438\u0442\u0435 \u0434\u043E\u0431\u0438\u0442\u044C\u0441\u044F, \u0432\u0430\u0448\u0438 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F...',
    caseDataNote: i18n.language === 'hy' ? "\u0533\u0578\u0580\u056E\u056B \u057F\u057E\u0575\u0561\u056C\u0576\u0565\u0580\u0568 \u0576\u0578\u0582\u0575\u0576\u057A\u0565\u057D \u056F\u0585\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u057E\u0565\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u056B \u057D\u057F\u0565\u0572\u056E\u0574\u0561\u0576 \u0570\u0561\u0574\u0561\u0580\u0589" : i18n.language === 'en' ? 'Case data will also be used for generation.' : '\u0414\u0430\u043D\u043D\u044B\u0435 \u0434\u0435\u043B\u0430 \u0442\u0430\u043A\u0436\u0435 \u0431\u0443\u0434\u0443\u0442 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043D\u044B \u0434\u043B\u044F \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438.',
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          {labels.describeYourSituation}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{labels.aiWillGenerate}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={sourceText}
          onChange={(e) => onSourceTextChange(e.target.value)}
          placeholder={labels.textareaPlaceholder}
          className="min-h-[180px] text-base"
        />
        
        <EnhancedFileUpload
          files={uploadedFiles}
          onFilesChange={onFilesChange}
          onExtractedTextChange={onExtractedTextChange}
          isDisabled={isGenerating}
        />
        
        {hasCaseData && (
          <p className="text-xs text-muted-foreground">{labels.caseDataNote}</p>
        )}
      </CardContent>
    </Card>
  );
}
