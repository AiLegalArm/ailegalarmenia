import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Download, Copy, Loader2, Database, FileJson, FileSpreadsheet } from "lucide-react";

interface KBExportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TableType = "knowledge_base" | "legal_practice_kb";

export function KBExport({ open, onOpenChange }: KBExportProps) {
  const { t } = useTranslation(["kb", "common"]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTables, setSelectedTables] = useState<TableType[]>(["knowledge_base"]);
  const [sqlOutput, setSqlOutput] = useState("");
  const [jsonOutput, setJsonOutput] = useState("");
  const [csvOutput, setCsvOutput] = useState("");
  const [activeTab, setActiveTab] = useState<"csv" | "sql" | "json">("csv");

  const toggleTable = (table: TableType) => {
    setSelectedTables((prev) =>
      prev.includes(table) ? prev.filter((t) => t !== table) : [...prev, table]
    );
  };

  const generateExport = async () => {
    if (selectedTables.length === 0) {
      toast.error("\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u043d\u0443 \u0442\u0430\u0431\u043b\u0438\u0446\u0443");
      return;
    }

    setIsLoading(true);
    setSqlOutput("");
    setJsonOutput("");
    setCsvOutput("");

    try {
      const allData: Record<string, unknown[]> = {};
      const sqlStatements: string[] = [];

      for (const table of selectedTables) {
        const { data, error } = await supabase.from(table).select("*");

        if (error) throw error;

        if (data && data.length > 0) {
          allData[table] = data;

          // Generate SQL INSERT statements
          sqlStatements.push(`-- ${table.toUpperCase()} (${data.length} records)`);
          sqlStatements.push(`-- Run in Cloud View > Run SQL (select Live environment)`);
          sqlStatements.push("");

          for (const row of data) {
            const columns = Object.keys(row).filter((k) => k !== "id");
            const values = columns.map((col) => {
              const val = row[col as keyof typeof row];
              if (val === null) return "NULL";
              if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
              if (typeof val === "number") return val;
              if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
              return `'${String(val).replace(/'/g, "''")}'`;
            });

            sqlStatements.push(
              `INSERT INTO public.${table} (${columns.join(", ")}) VALUES (${values.join(", ")});`
            );
          }
          sqlStatements.push("");
        }
      }

      setSqlOutput(sqlStatements.join("\n"));
      setJsonOutput(JSON.stringify(allData, null, 2));

      // Generate CSV
      const csvParts: string[] = [];
      for (const table of selectedTables) {
        const rows = allData[table];
        if (rows && rows.length > 0) {
          const columns = Object.keys(rows[0] as Record<string, unknown>);
          csvParts.push(columns.map(c => `"${c}"`).join(","));
          for (const row of rows) {
            const r = row as Record<string, unknown>;
            csvParts.push(columns.map(col => {
              const val = r[col];
              if (val === null || val === undefined) return "";
              const str = typeof val === "object" ? JSON.stringify(val) : String(val);
              return `"${str.replace(/"/g, '""')}"`;
            }).join(","));
          }
        }
      }
      setCsvOutput(csvParts.join("\n"));

      toast.success(`\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d: ${Object.values(allData).flat().length} \u0437\u0430\u043f\u0438\u0441\u0435\u0439`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("\u041e\u0448\u0438\u0431\u043a\u0430 \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0430");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${type} \u0441\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d \u0432 \u0431\u0443\u0444\u0435\u0440`);
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`\u0424\u0430\u0439\u043b ${filename} \u0441\u043a\u0430\u0447\u0430\u043d`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {"\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u0411\u0430\u0437\u044b \u0437\u043d\u0430\u043d\u0438\u0439"}
          </DialogTitle>
          <DialogDescription>
            {"\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u0434\u0430\u043d\u043d\u044b\u0445 \u0432 SQL \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u043d\u043e\u0441\u0430 \u0432 Live \u0438\u043b\u0438 JSON \u0434\u043b\u044f \u0440\u0435\u0437\u0435\u0440\u0432\u043d\u043e\u0433\u043e \u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Table selection */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="kb"
                checked={selectedTables.includes("knowledge_base")}
                onCheckedChange={() => toggleTable("knowledge_base")}
              />
              <Label htmlFor="kb" className="cursor-pointer">
                {"\u0411\u0430\u0437\u0430 \u0437\u043d\u0430\u043d\u0438\u0439 (knowledge_base)"}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="practice"
                checked={selectedTables.includes("legal_practice_kb")}
                onCheckedChange={() => toggleTable("legal_practice_kb")}
              />
              <Label htmlFor="practice" className="cursor-pointer">
                {"\u0421\u0443\u0434\u0435\u0431\u043d\u0430\u044f \u043f\u0440\u0430\u043a\u0442\u0438\u043a\u0430 (legal_practice_kb)"}
              </Label>
            </div>
          </div>

          <Button onClick={generateExport} disabled={isLoading || selectedTables.length === 0}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {"\u0413\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u044f..."}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {"\u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u044d\u043a\u0441\u043f\u043e\u0440\u0442"}
              </>
            )}
          </Button>

          {/* Output tabs */}
          {(sqlOutput || jsonOutput || csvOutput) && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "csv" | "sql" | "json")} className="flex-1 flex flex-col overflow-hidden">
              <TabsList>
                <TabsTrigger value="csv" className="flex items-center gap-1">
                  <FileSpreadsheet className="h-4 w-4" />
                  CSV
                </TabsTrigger>
                <TabsTrigger value="sql" className="flex items-center gap-1">
                  <Database className="h-4 w-4" />
                  SQL
                </TabsTrigger>
                <TabsTrigger value="json" className="flex items-center gap-1">
                  <FileJson className="h-4 w-4" />
                  JSON
                </TabsTrigger>
              </TabsList>

              <TabsContent value="csv" className="flex-1 flex flex-col overflow-hidden mt-2">
                <div className="flex gap-2 mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(csvOutput, "CSV")}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    {"Копировать"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadFile(csvOutput, "kb_export.csv", "text/csv")}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    {"Скачать .csv"}
                  </Button>
                </div>
                <Textarea
                  value={csvOutput}
                  readOnly
                  className="flex-1 font-mono text-xs resize-none min-h-[200px]"
                />
              </TabsContent>

              <TabsContent value="sql" className="flex-1 flex flex-col overflow-hidden mt-2">
                <div className="flex gap-2 mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(sqlOutput, "SQL")}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    {"\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadFile(sqlOutput, "kb_export.sql", "text/sql")}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    {"\u0421\u043a\u0430\u0447\u0430\u0442\u044c .sql"}
                  </Button>
                </div>
                <Textarea
                  value={sqlOutput}
                  readOnly
                  className="flex-1 font-mono text-xs resize-none min-h-[200px]"
                />
              </TabsContent>

              <TabsContent value="json" className="flex-1 flex flex-col overflow-hidden mt-2">
                <div className="flex gap-2 mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(jsonOutput, "JSON")}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    {"\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadFile(jsonOutput, "kb_export.json", "application/json")}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    {"\u0421\u043a\u0430\u0447\u0430\u0442\u044c .json"}
                  </Button>
                </div>
                <Textarea
                  value={jsonOutput}
                  readOnly
                  className="flex-1 font-mono text-xs resize-none min-h-[200px]"
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
