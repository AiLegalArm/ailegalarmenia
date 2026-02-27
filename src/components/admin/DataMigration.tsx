import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Download, Copy, Loader2, Database, ArrowRightLeft } from "lucide-react";

const AVAILABLE_TABLES = [
  { name: "knowledge_base", label: "База знаний", description: "Законодательство РА" },
  { name: "legal_practice_kb", label: "Судебная практика", description: "Решения судов" },
  { name: "legal_documents", label: "Legal Documents", description: "Канонические документы" },
  { name: "legal_chunks", label: "Legal Chunks", description: "Семантические фрагменты" },
  { name: "knowledge_base_chunks", label: "KB Chunks", description: "Чанки базы знаний" },
  { name: "document_templates", label: "Шаблоны документов", description: "Шаблоны генерации" },
  { name: "ai_prompts", label: "AI Промпты", description: "Системные промпты" },
  { name: "ai_prompt_versions", label: "Версии промптов", description: "История изменений" },
  { name: "armenian_dictionary", label: "Словарь", description: "Армянский словарь" },
  { name: "app_settings", label: "Настройки", description: "Параметры приложения" },
] as const;

export function DataMigration() {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTables, setSelectedTables] = useState<string[]>(
    AVAILABLE_TABLES.map((t) => t.name)
  );
  const [sqlOutput, setSqlOutput] = useState("");
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  const toggleTable = (name: string) => {
    setSelectedTables((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  };

  const selectAll = () => setSelectedTables(AVAILABLE_TABLES.map((t) => t.name));
  const selectNone = () => setSelectedTables([]);

  const generateExport = async () => {
    if (selectedTables.length === 0) {
      toast.error("Выберите хотя бы одну таблицу");
      return;
    }

    setIsLoading(true);
    setSqlOutput("");
    setStats(null);

    try {
      const { data, error } = await supabase.functions.invoke("export-data", {
        body: { tables: selectedTables },
      });

      if (error) throw error;

      // Response is now plain text (streamed SQL)
      let text: string;
      if (typeof data === "string") {
        text = data;
      } else if (data instanceof Blob) {
        text = await data.text();
      } else if (data?.error) {
        throw new Error(data.error);
      } else {
        text = JSON.stringify(data);
      }

      setSqlOutput(text);

      // Parse stats from comment lines like "-- table_name: 123 records exported"
      const statsMap: Record<string, number> = {};
      const re = /^-- (\w+): (\d+) records exported$/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        statsMap[m[1]] = parseInt(m[2], 10);
      }
      if (Object.keys(statsMap).length > 0) setStats(statsMap);

      const total = Object.values(statsMap).reduce((s, n) => s + n, 0);
      toast.success(`Экспорт завершён: ${total} записей`);
    } catch (err) {
      console.error("Export error:", err);
      toast.error(`Ошибка экспорта: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlOutput);
    toast.success("SQL скопирован в буфер");
  };

  const downloadFile = () => {
    const blob = new Blob([sqlOutput], { type: "text/sql" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `data_migration_${new Date().toISOString().slice(0, 10)}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Файл скачан");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5" />
          Миграция данных Test → Live
        </CardTitle>
        <CardDescription>
          Экспортируйте данные из Test-среды в SQL формате. Затем откройте бэкенд,
          выберите Live и вставьте SQL в Run SQL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Table selection */}
        <div className="space-y-2">
          <div className="flex gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Выбрать все
            </Button>
            <Button variant="outline" size="sm" onClick={selectNone}>
              Снять все
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {AVAILABLE_TABLES.map((table) => (
              <div key={table.name} className="flex items-center space-x-2">
                <Checkbox
                  id={`mig-${table.name}`}
                  checked={selectedTables.includes(table.name)}
                  onCheckedChange={() => toggleTable(table.name)}
                />
                <Label htmlFor={`mig-${table.name}`} className="cursor-pointer text-sm">
                  <span className="font-medium">{table.label}</span>
                  <span className="text-muted-foreground ml-1">— {table.description}</span>
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Button onClick={generateExport} disabled={isLoading || selectedTables.length === 0}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Генерация...
            </>
          ) : (
            <>
              <Database className="mr-2 h-4 w-4" />
              Сгенерировать SQL ({selectedTables.length} таблиц)
            </>
          )}
        </Button>

        {/* Stats */}
        {stats && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats).map(([table, count]) => (
              <span
                key={table}
                className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
              >
                {table}: {count}
              </span>
            ))}
          </div>
        )}

        {/* SQL Output */}
        {sqlOutput && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyToClipboard}>
                <Copy className="mr-1 h-3 w-3" />
                Копировать SQL
              </Button>
              <Button size="sm" variant="outline" onClick={downloadFile}>
                <Download className="mr-1 h-3 w-3" />
                Скачать .sql
              </Button>
            </div>
            <Textarea
              value={sqlOutput}
              readOnly
              className="font-mono text-xs min-h-[300px] resize-y"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
