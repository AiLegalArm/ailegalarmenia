import { useState, useMemo } from "react";
import { Loader2, Copy, FileText, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { exportComplaintToPDF } from "@/lib/pdfExport";

// =============================================================================
// STEP 4: Result Display with Missing Data Form
// =============================================================================

interface StepResultProps {
  lang: string;
  getText: (hy: string, ru: string, en: string) => string;
  isGenerating: boolean;
  generatedContent: string;
  complaintTypeId?: string;
  onReset: () => void;
  onRegenerate?: (missingData: string) => void;
}

/**
 * Detect if the generated content contains a "missing data" section.
 * Returns the list of missing items as strings, or null if not found.
 */
function parseMissingDataItems(content: string): string[] | null {
  // Match patterns like "(0) ТРЕБУЕМЫЕ ДАННЫЕ", "НЕХВАТАЮЩИЕ СВЕДЕНИЯ", "MISSING DATA", "ԲԱՑԱԿԱՅՈՂ ՏՎՅԱԼՆԵՐ"
  const headerPattern = /(?:\(0\)\s*)?(?:ТРЕБУЕМЫЕ\s+ДАННЫЕ|НЕХВАТАЮЩИЕ\s+СВЕДЕНИЯ|MISSING\s+DATA|REQUIRED\s+DATA|ԲԱՑAKAYՈՂ\s+ՏVALNER|ԲԱՑAKAYՈՂ|KB\s+GAP\s+NOTICE|REQUIRED\s+INFORMATION)/i;

  if (!headerPattern.test(content)) return null;

  // Extract bullet points after the header
  const lines = content.split("\n");
  const headerIdx = lines.findIndex(l => headerPattern.test(l));
  if (headerIdx === -1) return null;

  const items: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Stop if we hit a new major section (all caps line without dash/bullet)
    if (/^[А-ЯЁABC-Z\u0531-\u0587]{5,}/.test(line) && !line.startsWith("-") && !line.startsWith("•") && !line.startsWith("*") && !/^\d+\./.test(line)) break;
    if (line.startsWith("-") || line.startsWith("•") || line.startsWith("*") || /^\d+\./.test(line)) {
      items.push(line.replace(/^[-•*\d.]\s*/, "").trim());
    }
  }

  return items.length > 0 ? items : null;
}

export function StepResult({
  lang,
  getText,
  isGenerating,
  generatedContent,
  complaintTypeId,
  onReset,
  onRegenerate,
}: StepResultProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [missingDataInput, setMissingDataInput] = useState("");

  const missingItems = useMemo(() => parseMissingDataItems(generatedContent), [generatedContent]);
  const hasMissingData = missingItems && missingItems.length > 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    toast.success(getText("Պատճենվեց", "Скопировано", "Copied"));
  };

  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      const title = getText("Բողոք / Հայց", "Жалоба / Иск", "Complaint / Claim");
      await exportComplaintToPDF({
        title,
        complaintTypeId,
        content: generatedContent,
        language: lang as "hy" | "ru" | "en",
      });
      toast.success(getText("PDF ֆայլը ներբեռնվեց", "PDF файл скачан", "PDF downloaded"));
    } catch (e) {
      console.error("PDF export error:", e);
      toast.error(getText("Սխալ PDF-ի ստեղծման ժամանակ", "Ошибка при создании PDF", "PDF export error"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleRegenerate = () => {
    if (!missingDataInput.trim()) {
      toast.error(getText(
        "Լրացրեք բացակայող տվյալները",
        "Заполните недостающие данные",
        "Please fill in the missing data"
      ));
      return;
    }
    onRegenerate?.(missingDataInput.trim());
    setMissingDataInput("");
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {getText(
            "AI-ն գեներացնում է բողոքը...",
            "AI генерирует жалобу...",
            "AI is generating your complaint..."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {getText("Գեներացված բողոք", "Сгенерированная жалоба", "Generated Complaint")}
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-1" />
            {getText("Պատճենել", "Копировать", "Copy")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleDownloadPDF}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-1" />
            )}
            {getText("Ներբեռնել PDF", "Скачать PDF", "Download PDF")}
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[300px] border rounded-lg p-4 bg-muted/30">
        <pre className="whitespace-pre-wrap font-sans text-sm">{generatedContent}</pre>
      </ScrollArea>

      {/* Missing Data Form */}
      {hasMissingData && onRegenerate && (
      <div className="border border-warning/40 rounded-xl bg-warning/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-warning">
                {getText(
                  "ԱI-ն պահանջում է լրացուցիչ տվյալներ",
                  "AI запрашивает дополнительные данные",
                  "AI requires additional data"
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getText(
                  "Լրացրեք ստորև բացակայող տեղեկությունները կատարյալ բողոք ստանալու համար",
                  "Заполните недостающие сведения ниже для полноценной жалобы",
                  "Fill in the missing information below to get a complete complaint"
                )}
              </p>
            </div>
          </div>

          {/* Show the missing items as hints */}
          <div className="space-y-1 pl-1">
            {missingItems.slice(0, 5).map((item, idx) => (
              <p key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                <span className="text-warning shrink-0">•</span>
                <span>{item}</span>
              </p>
            ))}
            {missingItems.length > 5 && (
              <p className="text-xs text-muted-foreground pl-3">
                {getText(
                  `... և ևս ${missingItems.length - 5} կետ`,
                  `... и ещё ${missingItems.length - 5} пункт(а)`,
                  `... and ${missingItems.length - 5} more item(s)`
                )}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {getText(
                "Լրացուցիչ տեղեկություններ",
                "Дополнительные сведения",
                "Additional information"
              )}
            </Label>
            <Textarea
              placeholder={getText(
                "Գրեք բոլոր բացակայող տվյալները (ՀՀԾ, հասցե, ամսաթիվ, արձանագրություն, ...):",
                "Укажите все недостающие данные (ФИО, адрес, дата, реквизиты акта, ...):",
                "Provide all missing data (Full name, address, date, act details, ...):"
              )}
              value={missingDataInput}
              onChange={(e) => setMissingDataInput(e.target.value)}
              className="min-h-[120px] resize-none"
            />
          </div>

          <Button
            onClick={handleRegenerate}
            className="w-full h-11 rounded-xl"
            disabled={!missingDataInput.trim()}
          >
            <Sparkles className="h-4 w-4 mr-2 shrink-0" />
            {getText(
              "Նորից գեներացնել ամբողջական բողոքը",
              "Перегенерировать жалобу с данными",
              "Regenerate complaint with data"
            )}
          </Button>
        </div>
      )}

      <Button variant="outline" onClick={onReset} className="w-full">
        {getText("Նոր բողոք", "Новая жалоба", "New Complaint")}
      </Button>
    </div>
  );
}
