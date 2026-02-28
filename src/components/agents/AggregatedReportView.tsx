import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileText, Download, Printer, CheckCircle2, AlertTriangle, Shield, Scale } from "lucide-react";
import { stripMarkdown } from "@/lib/strip-markdown";
import { toast } from "sonner";
import type { AggregatedReport, AgentAnalysisRun } from "./types";
import { AGENT_CONFIGS } from "./types";
import { exportDocumentToPDF } from "@/lib/pdfExportDocument";

interface AggregatedReportViewProps {
  caseId: string;
  report: AggregatedReport | null;
  runs: AgentAnalysisRun[];
  evidenceCount: number;
  onGenerateReport: () => void;
  isGenerating: boolean;
}

export function AggregatedReportView({
  caseId,
  report,
  runs,
  evidenceCount,
  onGenerateReport,
  isGenerating
}: AggregatedReportViewProps) {
  const { t, i18n } = useTranslation(["ai", "common"]);
  const [isExporting, setIsExporting] = useState(false);

  const completedRuns = runs.filter(r => r.status === "completed");
  const canGenerate = completedRuns.length >= 3; // Need at least 3 agents completed

  const handleExportPdf = async () => {
    if (!report) return;
    
    setIsExporting(true);
    try {
      // Compose full report content
      const fullContent = [
        report.executive_summary && `## ${t("ai:executive_summary")}\n\n${report.executive_summary}`,
        report.evidence_summary && `## ${t("ai:evidence_summary")}\n\n${report.evidence_summary}`,
        report.violations_summary && `## ${t("ai:violations_summary")}\n\n${report.violations_summary}`,
        report.defense_strategy && `## ${t("ai:defense_strategy")}\n\n${report.defense_strategy}`,
        report.prosecution_weaknesses && `## ${t("ai:prosecution_weaknesses")}\n\n${report.prosecution_weaknesses}`,
        report.recommendations && `## ${t("ai:recommendations")}\n\n${report.recommendations}`,
      ].filter(Boolean).join("\n\n---\n\n");

      await exportDocumentToPDF({
        title: report.title || t("ai:aggregated_report"),
        content: fullContent || report.full_report || t("ai:no_content"),
        createdAt: new Date(report.generated_at),
        language: (i18n.language as "hy" | "ru" | "en") || "hy",
      });
      
      toast.success(t("common:pdf_exported"));
    } catch (error) {
      console.error("PDF export error:", error);
      toast.error(t("common:error"));
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!report && !isGenerating) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">{t("ai:no_report_yet")}</h3>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            {t("ai:report_requirements")}
          </p>
          
          <div className="flex items-center gap-4 mb-6">
            <Badge variant="secondary" className="text-sm">
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {completedRuns.length} / {AGENT_CONFIGS.length} {t("ai:agents_done")}
            </Badge>
            <Badge variant="secondary" className="text-sm">
              {evidenceCount} {t("ai:evidence_items")}
            </Badge>
          </div>
          
          <Button
            size="lg"
            onClick={onGenerateReport}
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("ai:generating_report")}
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                {t("ai:generate_report")}
              </>
            )}
          </Button>
          
          {!canGenerate && (
            <p className="text-sm text-muted-foreground mt-4">
              {t("ai:need_more_agents")}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isGenerating) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <h3 className="text-lg font-semibold">{t("ai:generating_report")}</h3>
          <p className="text-muted-foreground">{t("ai:please_wait")}</p>
        </CardContent>
      </Card>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-4">
      {/* Report Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{report.title}</CardTitle>
              <CardDescription>
                {t("ai:generated_at")}: {new Date(report.generated_at).toLocaleString()}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportPdf}
                disabled={isExporting}
              >
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                {t("ai:print")}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Report Sections */}
      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="summary">{t("ai:summary")}</TabsTrigger>
          <TabsTrigger value="evidence">{t("ai:evidence")}</TabsTrigger>
          <TabsTrigger value="violations">{t("ai:violations")}</TabsTrigger>
          <TabsTrigger value="defense">{t("ai:defense")}</TabsTrigger>
          <TabsTrigger value="full">{t("ai:full_report")}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                {t("ai:executive_summary")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <p className="text-sm whitespace-pre-wrap">
                  {stripMarkdown(report.executive_summary || t("ai:no_content"))}
                </p>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("ai:evidence_summary")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <p className="text-sm whitespace-pre-wrap">
                  {stripMarkdown(report.evidence_summary || t("ai:no_content"))}
                </p>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="violations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                {t("ai:violations_summary")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <p className="text-sm whitespace-pre-wrap">
                  {stripMarkdown(report.violations_summary || t("ai:no_content"))}
                </p>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="defense">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t("ai:defense_strategy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-2">{t("ai:defense_arguments")}</h4>
                    <p className="text-sm whitespace-pre-wrap">
                      {stripMarkdown(report.defense_strategy || t("ai:no_content"))}
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">{t("ai:prosecution_weaknesses")}</h4>
                    <p className="text-sm whitespace-pre-wrap">
                      {stripMarkdown(report.prosecution_weaknesses || t("ai:no_content"))}
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">{t("ai:recommendations")}</h4>
                    <p className="text-sm whitespace-pre-wrap">
                      {stripMarkdown(report.recommendations || t("ai:no_content"))}
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="full">
          <Card>
            <CardHeader>
              <CardTitle>{t("ai:full_report")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <p className="text-sm whitespace-pre-wrap">
                  {stripMarkdown(report.full_report || t("ai:no_content"))}
                </p>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
