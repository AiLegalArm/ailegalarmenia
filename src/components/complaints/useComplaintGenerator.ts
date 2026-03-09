import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ComplaintType, UploadedFile, CourtType, ComplaintCategory } from "./types";
import { getComplaintTypeLabel, determineCourtType } from "./constants";

// =============================================================================
// COMPLAINT GENERATION HOOK
// =============================================================================

interface UseComplaintGeneratorOptions {
  lang: string;
  getText: (hy: string, ru: string, en: string) => string;
  onGeneratingChange: (isGenerating: boolean) => void;
  onContentGenerated: (content: string) => void;
  onStepChange: (step: number) => void;
}

interface GenerateParams {
  complaintType: ComplaintType;
  category: ComplaintCategory;
  files: UploadedFile[];
  additionalInfo: string;
  respondentInfo?: string;
  referencesText?: string;
}

export function useComplaintGenerator({
  lang,
  getText,
  onGeneratingChange,
  onContentGenerated,
  onStepChange
}: UseComplaintGeneratorOptions) {

  const handleGenerate = useCallback(async ({
    complaintType,
    category,
    files,
    additionalInfo,
    respondentInfo,
    referencesText
  }: GenerateParams) => {
    if (!complaintType) {
      toast.error(getText(
        "\u0538\u0576\u057F\u0580\u0565\u0584 \u0562\u0578\u0572\u0578\u0584\u056B \u057F\u0565\u057D\u0561\u056F\u0568",
        "Выберите тип жалобы",
        "Select complaint type"
      ));
      return;
    }

    const extractedTexts = files
      .filter(f => f.status === "success" && f.extractedText)
      .map((f, idx) => `--- ${getText("\u0556\u0561\u0575\u056C", "Файл", "File")} ${idx + 1}: ${f.file.name} ---\n${f.extractedText}`)
      .join("\n\n");

    if (!extractedTexts && !additionalInfo) {
      toast.error(getText(
        "\u054E\u0565\u0580\u0562\u0565\u057C\u0576\u0565\u0584 \u0586\u0561\u0575\u056C\u0565\u0580 \u056F\u0561\u0574 \u0576\u056F\u0561\u0580\u0561\u0563\u0580\u0565\u0584 \u056B\u0580\u0561\u057E\u056B\u0573\u0561\u056F\u0568",
        "Загрузите файлы или опишите ситуацию",
        "Upload files or describe your situation"
      ));
      return;
    }

    onGeneratingChange(true);
    onStepChange(4);

    try {
      const extractedText = [
        extractedTexts,
        additionalInfo ? `\n${getText("\u053C\u0580\u0561\u0581\u0578\u0582\u0581\u056B\u0579 \u057F\u0565\u0572\u0565\u056F\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "Дополнительная информация", "Additional information")}:\n${additionalInfo}` : ""
      ].filter(Boolean).join("\n\n");

      const courtType = determineCourtType(complaintType.id);

      const requestBody: Record<string, unknown> = {
        courtType,
        category,
        complaintType: getComplaintTypeLabel(complaintType, lang),
        extractedText,
        language: lang === "hy" ? "hy" : lang === "ru" ? "ru" : "en",
        referenceDate: new Date().toISOString().split("T")[0]
      };
      if (referencesText?.trim()) {
        requestBody.referencesText = referencesText;
      }
      if (respondentInfo?.trim()) {
        requestBody.respondentInfo = respondentInfo;
      }

      const { data, error } = await supabase.functions.invoke("generate-complaint", {
        body: requestBody
      });

      if (error) throw error;

      if (data?.content) {
        onContentGenerated(data.content);
        onGeneratingChange(false);
        toast.success(getText(
          "\u0532\u0578\u0572\u0578\u0584\u0568 \u0570\u0561\u057B\u0578\u0572\u0578\u0582\u0569\u0575\u0561\u0574\u0562 \u0563\u0565\u0576\u0565\u0580\u0561\u0581\u057E\u0565\u0581",
          "Жалоба успешно сгенерирована",
          "Complaint generated successfully"
        ));
      }
    } catch (error) {
      console.error("Generation error:", error);
      onGeneratingChange(false);
      toast.error(getText(
        "\u0533\u0565\u0576\u0565\u0580\u0561\u0581\u0574\u0561\u0576 \u057D\u056D\u0561\u056C",
        "Ошибка генерации",
        "Generation failed"
      ));
    }
  }, [lang, getText, onGeneratingChange, onContentGenerated, onStepChange]);

  return { handleGenerate };
}
