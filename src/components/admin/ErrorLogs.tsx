import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle, RefreshCw, Search, Loader2, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  error_details: Record<string, unknown> | null;
  case_id: string | null;
  file_id: string | null;
  user_id: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export function ErrorLogs() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const fetchLogs = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      let query = supabase
        .from("error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (typeFilter !== "all") {
        query = query.eq("error_type", typeFilter);
      }
      if (statusFilter === "resolved") {
        query = query.eq("resolved", true);
      } else if (statusFilter === "unresolved") {
        query = query.eq("resolved", false);
      }
      if (search.length >= 2) {
        query = query.ilike("error_message", `%${search}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching error_logs:", error);
        setFetchError(`${error.code}: ${error.message}`);
        setLogs([]);
      } else {
        setLogs((data as ErrorLog[]) || []);
      }
    } catch (e) {
      console.error("Unexpected error fetching logs:", e);
      setFetchError(String(e));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, typeFilter, statusFilter]);

  const handleSearch = () => {
    setPage(0);
    fetchLogs();
  };

  const markResolved = async (id: string) => {
    const { error } = await supabase
      .from("error_logs")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(`Не удалось обновить: ${error.message}`);
    } else {
      toast.success("Отмечено как решённое");
      fetchLogs();
    }
  };

  const errorTypes = ["llm", "ocr", "audio", "system"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Логи ошибок
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по сообщению..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Тип" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {errorTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="unresolved">Нерешённые</SelectItem>
              <SelectItem value="resolved">Решённые</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchLogs} title="Обновить">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Error state */}
        {fetchError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Ошибка загрузки логов</p>
              <p className="text-xs mt-0.5 opacity-80">{fetchError}</p>
            </div>
          </div>
        )}

        {/* Logs */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !fetchError && logs.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mb-2" />
            <p>Ошибок не найдено</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border p-3 space-y-1.5 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={log.resolved ? "secondary" : "destructive"} className="text-xs">
                      {log.error_type}
                    </Badge>
                    {log.resolved && (
                      <Badge variant="outline" className="text-xs text-primary">Решено</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), "dd.MM.yyyy HH:mm")}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {!log.resolved && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markResolved(log.id)}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Решено
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      {expandedId === log.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <p className="font-medium text-foreground truncate">{log.error_message}</p>
                {expandedId === log.id && (
                  <div className="mt-2 space-y-2">
                    {log.case_id && <p className="text-xs text-muted-foreground">Case: {log.case_id}</p>}
                    {log.file_id && <p className="text-xs text-muted-foreground">File: {log.file_id}</p>}
                    {log.user_id && <p className="text-xs text-muted-foreground">User: {log.user_id}</p>}
                    {log.error_details && (
                      <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-60 whitespace-pre-wrap">
                        {JSON.stringify(log.error_details, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="flex justify-between items-center pt-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            ← Назад
          </Button>
          <span className="text-xs text-muted-foreground">Стр. {page + 1}</span>
          <Button variant="outline" size="sm" disabled={logs.length < PAGE_SIZE} onClick={() => setPage(page + 1)}>
            Вперёд →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
