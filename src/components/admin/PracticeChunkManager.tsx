import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2, Layers, RotateCcw, BarChart3, AlertTriangle, Database, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Diagnostics {
  total_docs: number;
  total_chunks: number;
  docs_without_chunks: number | null;
  avg_chunks_per_doc: number | null;
  embedding_pending: number;
  embedding_failed: number;
  jobs: {
    pending: number;
    processing: number;
    done: number;
    failed: number;
    dead_letter: number;
  };
}

interface PipelineStats {
  chunk_pending: number;
  embed_pending: number;
  enrich_pending: number;
}

type SourceTable = "legal_practice_kb" | "knowledge_base";

function PipelineStatus() {
  const { t } = useTranslation("admin");
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [kbRes, practiceRes] = await Promise.all([
        supabase.functions.invoke("practice-chunk-enqueue", {
          body: { action: "diagnostics", source_table: "knowledge_base" },
        }),
        supabase.functions.invoke("practice-chunk-enqueue", {
          body: { action: "diagnostics", source_table: "legal_practice_kb" },
        }),
      ]);

      const kbData = kbRes.data;
      const practiceData = practiceRes.data;

      const kbPipeline = kbData?.pipeline;
      const practicePipeline = practiceData?.pipeline;

      setStats({
        chunk_pending:
          (kbPipeline?.chunk_pending ?? kbData?.jobs?.pending ?? 0) +
          (practicePipeline?.chunk_pending ?? practiceData?.jobs?.pending ?? 0),
        embed_pending:
          (kbPipeline?.embed_pending ?? kbData?.embedding_pending ?? 0) +
          (practicePipeline?.embed_pending ?? practiceData?.embedding_pending ?? 0),
        enrich_pending:
          (kbPipeline?.enrich_pending ?? 0) +
          (practicePipeline?.enrich_pending ?? 0),
      });
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
    const intervalId = window.setInterval(() => {
      void loadStats();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [loadStats]);

  const startChunking = async () => {
    setStarting(true);
    try {
      const [kbRes, practiceRes] = await Promise.all([
        supabase.functions.invoke("practice-chunk-enqueue", {
          body: { action: "enqueue_missing_chunks", source_table: "knowledge_base" },
        }),
        supabase.functions.invoke("practice-chunk-enqueue", {
          body: { action: "enqueue_missing_chunks", source_table: "legal_practice_kb" },
        }),
      ]);

      const kbEnqueued = kbRes.data?.enqueued ?? 0;
      const practiceEnqueued = practiceRes.data?.enqueued ?? 0;
      const total = kbEnqueued + practiceEnqueued;

      if (total > 0) {
        toast.success(`Запущено чанкирование: ${total} документов добавлено в очередь (KB: ${kbEnqueued}, Practice: ${practiceEnqueued})`);
      } else {
        toast.info("Все документы уже обработаны — нечего чанкировать");
      }

      void loadStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка запуска чанкирования");
    } finally {
      setStarting(false);
    }
  };

  const isIdle = stats && stats.chunk_pending === 0 && stats.embed_pending === 0 && stats.enrich_pending === 0;
  const activeStage = stats
    ? stats.chunk_pending > 0 ? "Chunking" : stats.embed_pending > 0 ? "Embedding" : stats.enrich_pending > 0 ? "Enrichment" : "Idle"
    : "...";

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
        <Zap className={`h-4 w-4 ${isIdle ? 'text-muted-foreground' : 'text-green-500 animate-pulse'}`} />
        <div className="flex-1">
          <div className="text-sm font-medium">
            Pipeline: {activeStage}
          </div>
          {stats && !isIdle && (
            <div className="flex gap-2 text-xs text-muted-foreground mt-1">
              {stats.chunk_pending > 0 && <span>Chunk: {stats.chunk_pending}</span>}
              {stats.embed_pending > 0 && <span>Embed: {stats.embed_pending}</span>}
              {stats.enrich_pending > 0 && <span>Enrich: {stats.enrich_pending}</span>}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            ⚡ Pipeline runs automatically every minute. No manual intervention needed.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={loadStats} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <BarChart3 className="h-3 w-3" />}
        </Button>
      </div>

      <Button 
        onClick={startChunking} 
        disabled={starting}
        className="w-full gap-2"
        size="lg"
      >
        {starting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {starting ? "Запуск..." : "Начать чанкирование"}
      </Button>
    </div>
  );
}

function PipelineSection({ source }: { source: SourceTable }) {
  const { t } = useTranslation("admin");
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    loadDiagnostics();
    return () => { mountedRef.current = false; };
  }, []);

  const loadDiagnostics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "diagnostics", source_table: source },
      });
      if (error) throw error;
      if (mountedRef.current) setDiag(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load diagnostics");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const enqueueChunks = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "enqueue_missing_chunks", source_table: source },
      });
      if (error) throw error;
      toast.success(`Enqueued ${data.enqueued} docs for full pipeline (chunk → embed → enrich)`);
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enqueue failed");
    }
  };

  const enqueueEmbeddings = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "enqueue_missing_embeddings", source_table: source },
      });
      if (error) throw error;
      toast.success(`Reset ${data.reset} docs for re-embedding`);
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enqueue failed");
    }
  };

  const resetDeadLetters = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "reset_dead_letters", source_table: source },
      });
      if (error) throw error;
      toast.success(t("reset_dead_letters"));
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    }
  };

  const enqueueRechunkV1 = async () => {
    try {
      toast.info("Запуск backfill rechunk v1...");
      const { data, error } = await supabase.functions.invoke("practice-chunk-enqueue", {
        body: { action: "enqueue_rechunk_v1", source_table: source },
      });
      if (error) throw error;
      toast.success(`Backfill: ${data.enqueued} docs enqueued across ${data.pages_scanned} pages`);
      loadDiagnostics();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backfill failed");
    }
  };

  const coveragePct = diag
    ? diag.total_docs > 0
      ? Math.round(((diag.total_docs - (diag.docs_without_chunks || 0)) / diag.total_docs) * 100)
      : 0
    : 0;

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("loading_diagnostics")}
        </div>
      ) : diag ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{t("docs")}: {diag.total_docs.toLocaleString()}</Badge>
            <Badge variant="secondary">{t("chunks")}: {diag.total_chunks.toLocaleString()}</Badge>
            <Badge variant="secondary">
              {t("avg_chunks_per_doc", { value: diag.avg_chunks_per_doc?.toFixed(1) ?? "N/A" })}
            </Badge>
            <Badge variant={coveragePct >= 95 ? "secondary" : "destructive"}>
              {t("coverage", { value: coveragePct })}
            </Badge>
          </div>

          {(diag.docs_without_chunks ?? 0) > 0 && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {t("docs_without_chunks", { count: diag.docs_without_chunks ?? 0 } as Record<string, unknown>)}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{t("jobs_pending", { count: diag.jobs.pending })}</Badge>
            <Badge variant="outline">{t("jobs_processing", { count: diag.jobs.processing })}</Badge>
            <Badge variant="outline">{t("jobs_done", { count: diag.jobs.done })}</Badge>
            {diag.jobs.failed > 0 && <Badge variant="outline">{t("jobs_failed", { count: diag.jobs.failed })}</Badge>}
            {diag.jobs.dead_letter > 0 && <Badge variant="destructive">{t("jobs_dead", { count: diag.jobs.dead_letter })}</Badge>}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{t("emb_pending", { count: diag.embedding_pending })}</Badge>
            {diag.embedding_failed > 0 && (
              <Badge variant="outline">{t("emb_failed", { count: diag.embedding_failed })}</Badge>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={loadDiagnostics} disabled={loading}>
          <BarChart3 className="mr-1 h-4 w-4" /> {t("refresh")}
        </Button>
        <Button size="sm" onClick={enqueueChunks}>
          {t("enqueue_missing_chunks")}
        </Button>
        <Button size="sm" variant="outline" onClick={enqueueEmbeddings}>
          {t("enqueue_missing_embeddings")}
        </Button>
        {(diag?.jobs.dead_letter ?? 0) > 0 && (
          <Button size="sm" variant="outline" onClick={resetDeadLetters}>
            <RotateCcw className="mr-1 h-3 w-3" /> {t("reset_dead_letters")}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={enqueueRechunkV1}>
          Rechunk v1 Backfill
        </Button>
      </div>
    </div>
  );
}

export function PracticeChunkManager() {
  const { t } = useTranslation("admin");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          {t("chunk_pipeline")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("chunk_pipeline_desc")}</p>
      </CardHeader>
      <CardContent>
        <PipelineStatus />
        <Tabs defaultValue="knowledge_base">
          <TabsList className="mb-4">
            <TabsTrigger value="knowledge_base" className="gap-1">
              <Database className="h-3.5 w-3.5" />
              {t("knowledge_base")} 
            </TabsTrigger>
            <TabsTrigger value="legal_practice_kb" className="gap-1">
              <Layers className="h-3.5 w-3.5" />
              {t("legal_practice")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="knowledge_base">
            <PipelineSection source="knowledge_base" />
          </TabsContent>
          <TabsContent value="legal_practice_kb">
            <PipelineSection source="legal_practice_kb" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
