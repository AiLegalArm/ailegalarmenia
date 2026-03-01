import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Loader2,
  Play,
  Square,
  RefreshCw,
  Database,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const LIVE_URL = "https://nrmmgcgwriyrlbcpoqvk.supabase.co";

type SyncTable = "knowledge_base" | "legal_practice_kb";

interface SyncStatus {
  table: string;
  total: number | null;
  withEmbedding: number | null;
}

interface SyncProgress {
  table: SyncTable;
  phase: "records" | "embeddings" | "done" | "error";
  offset: number;
  totalCount: number;
  inserted: number;
  skipped: number;
  updated: number;
  errors: string[];
}

export function DataSyncToLive() {
  const [statuses, setStatuses] = useState<{ test: SyncStatus | null; live: SyncStatus | null }>({
    test: null,
    live: null,
  });
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const abortRef = useRef(false);
  const [selectedTable, setSelectedTable] = useState<SyncTable>("knowledge_base");

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      // Fetch test status
      const { data: testData, error: testErr } = await supabase.functions.invoke(
        "data-sync-to-live",
        { body: { mode: "status", table: selectedTable } },
      );
      if (testErr) throw testErr;

      setStatuses((prev) => ({
        ...prev,
        test: typeof testData === "string" ? JSON.parse(testData) : testData,
      }));

      // We can't directly call Live function from browser, so show a note
      setStatuses((prev) => ({ ...prev, live: null }));
    } catch (e) {
      toast.error(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingStatus(false);
    }
  }, [selectedTable]);

  const startSync = useCallback(async () => {
    abortRef.current = false;
    setSyncing(true);

    const prog: SyncProgress = {
      table: selectedTable,
      phase: "records",
      offset: 0,
      totalCount: 0,
      inserted: 0,
      skipped: 0,
      updated: 0,
      errors: [],
    };
    setProgress({ ...prog });

    try {
      // Phase 1: Sync records
      let done = false;
      while (!done && !abortRef.current) {
        const { data, error } = await supabase.functions.invoke("data-sync-to-live", {
          body: {
            mode: "export",
            table: selectedTable,
            offset: prog.offset,
            batchSize: 5,
            liveUrl: LIVE_URL,
          },
        });

        if (error) throw error;

        const result = typeof data === "string" ? JSON.parse(data) : data;

        if (result.error) {
          prog.errors.push(result.error);
          prog.phase = "error";
          setProgress({ ...prog });
          toast.error(result.error);
          break;
        }

        if (result.done) {
          done = true;
        } else {
          prog.offset = result.nextOffset;
          prog.totalCount = result.totalCount || prog.totalCount;
          if (result.importResult) {
            prog.inserted += result.importResult.inserted || 0;
            prog.skipped += result.importResult.skipped || 0;
            if (result.importResult.errors?.length) {
              prog.errors.push(...result.importResult.errors);
            }
          }
          setProgress({ ...prog });
        }
      }

      if (abortRef.current) {
        toast.info("Синхронизация остановлена");
        setSyncing(false);
        return;
      }

      // Phase 2: Sync embeddings
      if (prog.phase !== "error") {
        prog.phase = "embeddings";
        prog.offset = 0;
        setProgress({ ...prog });

        done = false;
        while (!done && !abortRef.current) {
          const { data, error } = await supabase.functions.invoke("data-sync-to-live", {
            body: {
              mode: "export-embeddings",
              table: selectedTable,
              offset: prog.offset,
              batchSize: 3,
              liveUrl: LIVE_URL,
            },
          });

          if (error) throw error;

          const result = typeof data === "string" ? JSON.parse(data) : data;

          if (result.error) {
            prog.errors.push(result.error);
            break;
          }

          if (result.done) {
            done = true;
          } else {
            prog.offset = result.nextOffset;
            prog.totalCount = result.totalCount || prog.totalCount;
            if (result.updateResult) {
              prog.updated += result.updateResult.updated || 0;
            }
            setProgress({ ...prog });
          }
        }
      }

      prog.phase = prog.phase === "error" ? "error" : "done";
      setProgress({ ...prog });

      if (prog.phase === "done") {
        toast.success(
          `Синхронизация завершена: +${prog.inserted} новых, ${prog.skipped} пропущено, ${prog.updated} эмбеддингов обновлено`,
        );
      }
    } catch (e) {
      prog.phase = "error";
      prog.errors.push(e instanceof Error ? e.message : String(e));
      setProgress({ ...prog });
      toast.error(`Ошибка синхронизации: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }, [selectedTable]);

  const stopSync = () => {
    abortRef.current = true;
  };

  const progressPercent = progress?.totalCount
    ? Math.min(100, Math.round((progress.offset / progress.totalCount) * 100))
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpRight className="h-5 w-5" />
          Синхронизация Test → Live
        </CardTitle>
        <CardDescription>
          Добавляет недостающие записи и эмбеддинги из Test в Live.
          Существующие записи Live не затрагиваются.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Table selector */}
        <div className="flex gap-2">
          <Button
            variant={selectedTable === "knowledge_base" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTable("knowledge_base")}
            disabled={syncing}
          >
            <Database className="mr-1.5 h-4 w-4" />
            База знаний
          </Button>
          <Button
            variant={selectedTable === "legal_practice_kb" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTable("legal_practice_kb")}
            disabled={syncing}
          >
            <Database className="mr-1.5 h-4 w-4" />
            Судебная практика
          </Button>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchStatus} disabled={loadingStatus || syncing}>
            {loadingStatus ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
            Проверить статус (Test)
          </Button>
          {statuses.test && (
            <div className="flex gap-2 text-sm">
              <Badge variant="secondary">
                Всего: {statuses.test.total?.toLocaleString()}
              </Badge>
              <Badge variant="outline">
                С эмбед.: {statuses.test.withEmbedding?.toLocaleString()}
              </Badge>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!syncing ? (
            <Button onClick={startSync} disabled={syncing}>
              <Play className="mr-1.5 h-4 w-4" />
              Начать синхронизацию
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopSync}>
              <Square className="mr-1.5 h-4 w-4" />
              Остановить
            </Button>
          )}
        </div>

        {/* Progress */}
        {progress && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {progress.phase === "done" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                {progress.phase === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                {(progress.phase === "records" || progress.phase === "embeddings") && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                <span className="font-medium">
                  {progress.phase === "records" && "Фаза 1: Синхронизация записей"}
                  {progress.phase === "embeddings" && "Фаза 2: Синхронизация эмбеддингов"}
                  {progress.phase === "done" && "Завершено"}
                  {progress.phase === "error" && "Ошибка"}
                </span>
              </div>
              <span className="text-muted-foreground">
                {progress.offset.toLocaleString()} / {(progress.totalCount || 0).toLocaleString()}
              </span>
            </div>

            <Progress value={progressPercent} className="h-2" />

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">+{progress.inserted} добавлено</Badge>
              <Badge variant="outline">{progress.skipped} пропущено</Badge>
              <Badge variant="outline">{progress.updated} эмбед. обновлено</Badge>
              {progress.errors.length > 0 && (
                <Badge variant="destructive">{progress.errors.length} ошибок</Badge>
              )}
            </div>

            {/* Error details */}
            {progress.errors.length > 0 && (
              <div className="max-h-32 overflow-auto rounded bg-muted p-2 text-xs font-mono">
                {progress.errors.slice(-10).map((err, i) => (
                  <div key={i} className="text-destructive">{err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          ⚠️ Перед использованием необходимо опубликовать проект, чтобы функция
          была доступна в Live-среде. Батчи по 5 записей (~125KB с эмбеддингами).
        </p>
      </CardContent>
    </Card>
  );
}
