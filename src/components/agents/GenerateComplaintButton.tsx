import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AgentAnalysisRun, EvidenceItem, AggregatedReport } from "./types";

interface GenerateComplaintButtonProps {
  caseId: string;
  runs: AgentAnalysisRun[];
  evidenceRegistry: EvidenceItem[];
  aggregatedReport: AggregatedReport | null;
}

export function GenerateComplaintButton({
  caseId,
  runs,
  evidenceRegistry,
  aggregatedReport
}: GenerateComplaintButtonProps) {
  const { t, i18n } = useTranslation(["ai", "common"]);
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const completedRuns = runs.filter(r => r.status === "completed");
  const hasEnoughData = completedRuns.length >= 3 || aggregatedReport;

  const saveDocument = async (content: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("generated_documents")
        .insert({
          user_id: user.id,
          case_id: caseId,
          title: t("ai:appeal_based_on_analysis"),
          content_text: content,
          source_text: `Multi-agent analysis: ${completedRuns.length} agents`,
          status: "draft"
        });

      if (error) throw error;
      setIsSaved(true);
      toast.success(t("ai:document_saved"));
    } catch (error) {
      console.error("Auto-save error:", error);
      toast.error(t("common:error"));
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setIsSaved(false);
    
    try {
      // Use full analysis_result for richer context
      const agentSummaries = completedRuns
        .map(run => {
          const text = run.analysis_result || run.summary || "";
          return `--- ${run.agent_type} ---\n${text.substring(0, 2000)}`;
        })
        .join("\n\n");

      const evidenceSummary = evidenceRegistry.slice(0, 15).map(e =>
        `- ${e.title} (${e.evidence_type}): ${e.admissibility_status}${e.violations_found?.length ? " | " + e.violations_found.slice(0, 3).join(", ") : ""}`
      ).join("\n");

      const reportSection = aggregatedReport ? [
        aggregatedReport.executive_summary?.substring(0, 1500),
        aggregatedReport.violations_summary?.substring(0, 1000),
        aggregatedReport.defense_strategy?.substring(0, 1000),
        aggregatedReport.recommendations?.substring(0, 600),
      ].filter(Boolean).join("\n\n") : "";

      const extractedText = [
        "=== Multi-Agent Analysis Summary ===",
        agentSummaries,
        evidenceSummary ? `\n=== Evidence Registry (${evidenceRegistry.length} items) ===\n${evidenceSummary}` : "",
        reportSection ? `\n=== Aggregated Report ===\n${reportSection}` : "",
      ].filter(Boolean).join("\n\n");

      // Use fetch with long timeout instead of supabase.functions.invoke
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const sessionData = await supabase.auth.getSession();
      const accessToken = sessionData.data.session?.access_token;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 310_000);

      let data: Record<string, unknown>;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/generate-complaint`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseKey,
            "Authorization": `Bearer ${accessToken || supabaseKey}`,
          },
          body: JSON.stringify({
            courtType: "appellate",
            category: "criminal",
            complaintType: t("ai:appeal_based_on_analysis"),
            extractedText: extractedText.slice(0, 80000),
            language: "hy",
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Edge function returned ${res.status}: ${errBody}`);
        }
        data = await res.json();
      } catch (e: unknown) {
        clearTimeout(timeoutId);
        if (e instanceof DOMException && e.name === "AbortError") {
          throw new Error("Request timed out after 5 minutes");
        }
        throw e;
      }

      const content = (data?.content || data?.complaint || "") as string;
      if (!content) throw new Error("No content generated");

      setGeneratedContent(content);
      toast.success(t("ai:complaint_generated"));

      // Auto-save immediately after generation
      await saveDocument(content);
    } catch (error) {
      console.error("Complaint generation error:", error);
      toast.error(t("ai:complaint_generation_failed"));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        disabled={!hasEnoughData}
        variant="outline"
        size="sm"
        className="w-full sm:flex-1 h-9 rounded-lg text-xs font-medium"
      >
        <FileText className="h-3.5 w-3.5 mr-1.5 shrink-0" />
        <span className="truncate">{t("ai:generate_complaint_from_analysis")}</span>
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] w-[95vw] sm:w-full p-0 sm:p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 pb-2 flex-shrink-0">
            <DialogTitle className="text-base sm:text-lg">{t("ai:generate_complaint_from_analysis")}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {t("ai:complaint_from_analysis_description")}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 px-4 sm:px-6">

          {!generatedContent ? (
            <div className="space-y-3 sm:space-y-4 py-2 sm:py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="p-3 sm:p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="font-medium text-sm sm:text-base">{t("ai:agents_completed")}</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold">{completedRuns.length}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {completedRuns.map(run => (
                      <Badge key={run.id} variant="secondary" className="text-[10px] sm:text-xs">
                        {run.agent_type}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="p-3 sm:p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                    <span className="font-medium text-sm sm:text-base">{t("ai:evidence_items")}</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold">{evidenceRegistry.length}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    {evidenceRegistry.filter(e => e.admissibility_status === "inadmissible").length} {t("ai:inadmissible")}
                  </p>
                </div>
              </div>

              {aggregatedReport && (
                <div className="p-3 sm:p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="font-medium text-sm sm:text-base">{t("ai:aggregated_report_available")}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-3">
                    {aggregatedReport.executive_summary?.substring(0, 200)}...
                  </p>
                </div>
              )}

              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating || !hasEnoughData}
                className="w-full"
                size="default"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="truncate">{t("ai:generating_complaint")}</span>
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{t("ai:generate_complaint")}</span>
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-2 sm:py-4">
              {isSaved && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 text-xs sm:text-sm">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  <span>{t("ai:document_saved")}</span>
                </div>
              )}
              <ScrollArea className="h-[50vh] sm:h-[55vh]">
                <div className="prose prose-sm max-w-none dark:prose-invert p-3 sm:p-4 border rounded-lg bg-muted/30">
                  <pre className="whitespace-pre-wrap font-sans text-xs sm:text-sm">
                    {generatedContent}
                  </pre>
                </div>
              </ScrollArea>
            </div>
          )}
          </ScrollArea>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 px-4 pb-4 sm:px-6 sm:pb-6 pt-2 flex-shrink-0">
            {generatedContent ? (
              <>
                <Button variant="outline" onClick={() => { setGeneratedContent(null); setIsSaved(false); }} className="w-full sm:w-auto">
                  {t("ai:regenerate")}
                </Button>
                <Button onClick={() => { setIsDialogOpen(false); navigate("/my-documents"); }} className="w-full sm:w-auto">
                  {t("ai:save_to_documents")}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto">
                {t("common:cancel")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
