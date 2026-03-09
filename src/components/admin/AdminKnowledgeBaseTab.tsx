import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useKnowledgeBase, type KBFilters } from "@/hooks/useKnowledgeBase";
import { KBSearchFilters } from "@/components/kb/KBSearchFilters";
import { KBDocumentCard } from "@/components/kb/KBDocumentCard";
import { KBDocumentForm } from "@/components/kb/KBDocumentForm";
import { KBPagination } from "@/components/kb/KBPagination";
import { KBPdfUpload } from "@/components/kb/KBPdfUpload";
import { KBBulkImport } from "@/components/kb/KBBulkImport";
import { KBWebScraper } from "@/components/kb/KBWebScraper";
import { KBJsonlImport } from "@/components/kb/KBJsonlImport";
import { KBMultiFileUpload } from "@/components/kb/KBMultiFileUpload";
import { KBExport } from "@/components/kb/KBExport";
import { ImportWizard, type ImportPayload } from "@/components/kb/ImportWizard";
import { EchrImportWizard } from "@/components/kb/EchrImportWizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Plus, 
  Loader2,
  BookOpen,
  Download,
  Zap,
  Pause,
  Play,
  Upload,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Database } from "@/integrations/supabase/types";

type KnowledgeBase = Database["public"]["Tables"]["knowledge_base"]["Row"];

export function AdminKnowledgeBaseTab() {
  const { t } = useTranslation(["kb", "common"]);
  const navigate = useNavigate();

  const [filters, setFilters] = useState<KBFilters>({ page: 1, pageSize: 12 });
  const [formOpen, setFormOpen] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [echrImportOpen, setEchrImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeBase | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Legacy modals — still wired behind the wizard for now
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [multiFileUploadOpen, setMultiFileUploadOpen] = useState(false);
  const [webScraperOpen, setWebScraperOpen] = useState(false);
  const [jsonlImportOpen, setJsonlImportOpen] = useState(false);
  
  // Bulk scrape state
  const [scrapeRunning, setScrapeRunning] = useState(false);
  const [scrapePaused, setScrapePaused] = useState(false);
  const [scrapeStats, setScrapeStats] = useState({ done: 0, errors: 0, total: 0, remaining: 0 });
  const [retryScheduled, setRetryScheduled] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [failedIds, setFailedIds] = useState<string[]>([]);


  const { 
    documents, 
    pagination, 
    isLoading, 
    createDocument, 
    updateDocument, 
    deleteDocument 
  } = useKnowledgeBase(filters);

  const handleCreate = (data: Database["public"]["Tables"]["knowledge_base"]["Insert"]) => {
    createDocument.mutate(data, {
      onSuccess: () => {
        setFormOpen(false);
        setPdfUploadOpen(false);
      },
    });
  };

  const handlePdfImport = (data: {
    title: string;
    content_text: string;
    category: Database["public"]["Enums"]["kb_category"];
    source_name: string;
  }) => {
    createDocument.mutate(data, {
      onSuccess: () => setPdfUploadOpen(false),
    });
  };

  const handleUpdate = (data: Database["public"]["Tables"]["knowledge_base"]["Update"]) => {
    if (editingDoc) {
      updateDocument.mutate(
        { id: editingDoc.id, updates: data },
        { onSuccess: () => setEditingDoc(null) }
      );
    }
  };

  const handleDeleteConfirm = () => {
    if (deletingDocId) {
      deleteDocument.mutate(deletingDocId);
      setDeletingDocId(null);
    }
  };

  const handlePageChange = (page: number) => {
    setFilters({ ...filters, page });
  };

  const refreshList = () => {
    setFilters({ ...filters });
  };

  // ── Import Wizard dispatch ────────────────────────────────────────
  // The wizard now handles the full import flow via useBulkImport internally.
  // We only log the payload here; the wizard stays open to show progress.
  const handleImportWizard = useCallback((payload: ImportPayload) => {
    toast.info(`Импорт: ${payload.previewRecords.length} записей → ${payload.target === 'knowledge_base' ? 'Законодательство' : 'Суд. практика'}`);
  }, []);

  // ── Bulk scrape logic ─────────────────────────────────────────────

  const processBatch = useCallback(async (allIds: string[], isRetry = false) => {
    setScrapeRunning(true);
    setScrapePaused(false);
    setRetryScheduled(false);

    setScrapeStats({ done: 0, errors: 0, total: allIds.length, remaining: allIds.length });
    toast.info(isRetry 
      ? `Retrying ${allIds.length} failed documents...` 
      : `Starting scrape of ${allIds.length} documents...`
    );

    const BATCH = 5;
    let doneCount = 0;
    let errorCount = 0;
    const newFailedIds: string[] = [];

    for (let i = 0; i < allIds.length; i += BATCH) {
      if (scrapePaused) break;

      const chunk = allIds.slice(i, i + BATCH);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("kb-fetch-pdf-content", {
          body: { kbIds: chunk, batchSize: 2, delayMs: 2000 }
        });

        if (fnError) {
          errorCount += chunk.length;
          newFailedIds.push(...chunk);
        } else if (data) {
          doneCount += data.processed || 0;
          errorCount += data.errors || 0;
          if (data.results) {
            for (const r of data.results) {
              if (!r.success) newFailedIds.push(r.id);
            }
          }
        }
      } catch {
        errorCount += chunk.length;
        newFailedIds.push(...chunk);
      }

      setScrapeStats({
        done: doneCount,
        errors: errorCount,
        total: allIds.length,
        remaining: Math.max(0, allIds.length - (i + BATCH)),
      });

      if (i + BATCH < allIds.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    setScrapeRunning(false);
    setFailedIds(newFailedIds);

    if (newFailedIds.length > 0 && !isRetry) {
      toast.success(`Done: ${doneCount} processed, ${errorCount} errors. Auto-retry in 5 min.`);
      scheduleRetry(newFailedIds);
    } else if (newFailedIds.length > 0 && isRetry) {
      toast.warning(`Retry done: ${doneCount} processed, ${newFailedIds.length} still failing.`);
    } else {
      toast.success(`Scraping complete: ${doneCount} processed!`);
    }
    refreshList();
  }, [scrapePaused]);

  const scheduleRetry = useCallback((ids: string[]) => {
    setRetryScheduled(true);
    setRetryCountdown(300);

    const interval = setInterval(() => {
      setRetryCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setRetryScheduled(false);
          processBatch(ids, true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [processBatch]);

  const startBulkScrape = useCallback(async () => {
    setScrapeRunning(true);
    setScrapePaused(false);
    setFailedIds([]);
    
    const { data: pending, error } = await supabase
      .from("knowledge_base")
      .select("id")
      .eq("is_active", true)
      .not("source_url", "is", null)
      .or("content_text.is.null,content_text.lt.500");
    
    if (error || !pending) {
      toast.error("Failed to query pending records");
      setScrapeRunning(false);
      return;
    }

    const { data: shortContent } = await supabase
      .from("knowledge_base")
      .select("id, content_text")
      .eq("is_active", true)
      .not("source_url", "is", null)
      .not("content_text", "is", null);
    
    const shortIds = (shortContent || [])
      .filter(r => !r.content_text || r.content_text.length < 500)
      .map(r => r.id);
    
    const allIds = [...new Set([...pending.map(r => r.id), ...shortIds])];
    
    if (allIds.length === 0) {
      toast.success("All documents already have content!");
      setScrapeRunning(false);
      return;
    }

    await processBatch(allIds);
  }, [scrapePaused, processBatch]);


  return (
    <>
      <div className="space-y-6">
        {/* Action Buttons — unified */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {"\u0533\u056B\u057F\u0565\u056C\u056B\u0584\u0576\u0565\u0580\u056B \u0562\u0561\u0566\u0561\u0575\u056B \u056F\u0561\u057C\u0561\u057E\u0561\u0580\u0578\u0582\u0574"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                <span className="text-xs sm:text-sm">{t("add_document")}</span>
              </Button>
              <Button variant="secondary" onClick={() => setImportWizardOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" />
                <span className="text-xs sm:text-sm">Импорт</span>
              </Button>
              <Button variant="outline" onClick={() => setEchrImportOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" />
                <span className="text-xs sm:text-sm">ECHR + HY</span>
              </Button>
              <Button variant="secondary" onClick={() => setExportOpen(true)}>
                <Download className="mr-1.5 h-4 w-4" />
                <span className="text-xs sm:text-sm">Экспорт</span>
              </Button>
              <Button 
                variant="outline" 
                onClick={startBulkScrape} 
                disabled={scrapeRunning}
              >
                {scrapeRunning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Zap className="mr-1.5 h-4 w-4" />}
                <span className="text-xs sm:text-sm">Scrape PDFs</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Scrape Progress */}
        {(scrapeRunning || scrapeStats.total > 0 || retryScheduled) && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    PDF Scraping: {scrapeStats.done}/{scrapeStats.total}
                  </span>
                  {scrapeStats.errors > 0 && (
                    <Badge variant="destructive" className="text-xs">{scrapeStats.errors} errors</Badge>
                  )}
                </div>
                <Badge variant={scrapeRunning ? "default" : "secondary"}>
                  {scrapeStats.total > 0 ? Math.round((scrapeStats.done / scrapeStats.total) * 100) : 0}%
                </Badge>
              </div>
              <Progress value={scrapeStats.total > 0 ? (scrapeStats.done / scrapeStats.total) * 100 : 0} className="h-2" />
              <div className="flex items-center gap-2">
                {scrapeRunning && (
                  <Button variant="outline" size="sm" onClick={() => { setScrapePaused(true); setScrapeRunning(false); }}>
                    <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause
                  </Button>
                )}
                {retryScheduled && (
                  <>
                    <Badge variant="outline" className="text-xs">
                      Auto-retry {failedIds.length} docs in {Math.floor(retryCountdown / 60)}:{String(retryCountdown % 60).padStart(2, '0')}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => { setRetryScheduled(false); setRetryCountdown(0); processBatch(failedIds, true); }}>
                      <Play className="mr-1.5 h-3.5 w-3.5" /> Retry now
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search & Filters */}
        <div>
          <KBSearchFilters filters={filters} onFiltersChange={setFilters} />
        </div>

        {/* Results info */}
        {filters.search && filters.search.length >= 2 && documents.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t("results_found", { count: documents.length })}
          </p>
        )}

        {/* Documents Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-lg font-medium text-muted-foreground">
              {t("no_results")}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => (
                <KBDocumentCard
                  key={doc.id}
                  document={doc}
                  onView={(id) => navigate(`/kb/${id}`)}
                  onEdit={(id) => {
                    const docToEdit = documents.find((d) => d.id === id);
                    if (docToEdit && "is_active" in docToEdit) setEditingDoc(docToEdit as KnowledgeBase);
                  }}
                  onDelete={(id) => setDeletingDocId(id)}
                  isAdmin={true}
                  rank={"relevancePct" in doc ? (doc.relevancePct as number) : "rank" in doc ? (doc.rank as number) : undefined}
                />
              ))}
            </div>

            {/* Pagination */}
            {pagination && (
              <div className="mt-6">
                <KBPagination 
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  total={pagination.total}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Form */}
      <KBDocumentForm
        open={formOpen || !!editingDoc}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditingDoc(null);
          }
        }}
        onSubmit={editingDoc ? handleUpdate : handleCreate}
        initialData={editingDoc}
        isLoading={createDocument.isPending || updateDocument.isPending}
      />

      {/* ── Unified Import Wizard ─────────────────────────────── */}
      <ImportWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        onImport={handleImportWizard}
      />

      <EchrImportWizard
        open={echrImportOpen}
        onOpenChange={setEchrImportOpen}
        onSuccess={() => refreshList()}
      />

      {/* Legacy modals — still needed as backends behind wizard dispatch */}
      <KBPdfUpload
        open={pdfUploadOpen}
        onOpenChange={setPdfUploadOpen}
        onSuccess={handlePdfImport}
      />
      <KBBulkImport
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        onSuccess={() => { setBulkImportOpen(false); refreshList(); }}
      />
      <KBMultiFileUpload
        open={multiFileUploadOpen}
        onOpenChange={setMultiFileUploadOpen}
        onSuccess={() => { setMultiFileUploadOpen(false); refreshList(); }}
      />
      <KBWebScraper
        open={webScraperOpen}
        onOpenChange={setWebScraperOpen}
        onSuccess={() => { setWebScraperOpen(false); refreshList(); }}
      />
      <KBJsonlImport
        open={jsonlImportOpen}
        onOpenChange={setJsonlImportOpen}
        onSuccess={() => { setJsonlImportOpen(false); refreshList(); }}
      />

      {/* Export */}
      <KBExport
        open={exportOpen}
        onOpenChange={setExportOpen}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDocId} onOpenChange={() => setDeletingDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_document")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm_delete")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              {t("common:delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
