/**
 * EchrImportWizard — Bulk import ECHR cases (JSON/JSONL) directly into
 * legal_practice_kb without translation. Supports multiple file selection.
 */
import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import {
  FileJson, Loader2, CheckCircle, AlertTriangle, Upload, Download, Globe, X, Files, Scissors,
} from "lucide-react";

interface EchrImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Status = "idle" | "parsing" | "importing" | "success" | "error";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParsedCase = Record<string, any>;

interface ImportStats {
  total: number;
  processed: number;
  inserted: number;
  skipped: number;
  skippedById: number;
  skippedByHash: number;
  skippedNoText: number;
  errors: number;
  parseSkipped: number;
}

interface FileEntry {
  name: string;
  cases: ParsedCase[];
  skipped: number;
}

const PRACTICE_CATEGORIES = [
  { value: "echr", label: "ՄԻԵԴ" },
  { value: "criminal", label: "\u0554\u0580\u0565\u0561\u056F\u0561\u0576" },
  { value: "civil", label: "\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576" },
  { value: "administrative", label: "\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576" },
  { value: "constitutional", label: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576" },
];

/**
 * Stream-parse a File using brace-matching to extract top-level JSON objects.
 */
async function streamParseCases(
  file: File,
  onCase: (obj: ParsedCase) => void,
  onProgress?: (bytesRead: number) => void
): Promise<{ total: number; skipped: number }> {
  const CHUNK_SIZE = 4 * 1024 * 1024;
  let total = 0;
  let skipped = 0;
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;
  let buffer = "";
  let bytesRead = 0;
  const decoder = new TextDecoder("utf-8");

  async function readSlice(start: number, end: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const slice = file.slice(start, end);
      const reader = new FileReader();
      reader.onload = () => resolve(decoder.decode(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(slice);
    });
  }

  let pos = 0;
  const size = file.size;

  while (pos < size) {
    const end = Math.min(pos + CHUNK_SIZE, size);
    const text = await readSlice(pos, end);
    bytesRead += text.length;
    pos = end;
    if (onProgress) onProgress(bytesRead);

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; if (objStart !== -1) buffer += ch; continue; }
      if (ch === "\\" && inString) { escape = true; if (objStart !== -1) buffer += ch; continue; }
      if (ch === '"') { inString = !inString; if (objStart !== -1) buffer += ch; continue; }
      if (inString) { if (objStart !== -1) buffer += ch; continue; }

      if (ch === "{") {
        if (depth === 0) { objStart = i; buffer = "{"; } else { buffer += ch; }
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && objStart !== -1) {
          buffer += "}";
          try {
            const obj = JSON.parse(buffer);
            if (obj && typeof obj === "object" && !Array.isArray(obj)) { onCase(obj); total++; }
            else { skipped++; }
          } catch { skipped++; }
          buffer = "";
          objStart = -1;
        } else if (objStart !== -1) { buffer += ch; }
      } else if (objStart !== -1) { buffer += ch; }
    }
  }

  return { total, skipped };
}

function splitAndDownload(cases: ParsedCase[], chunkSize: number, baseName: string) {
  const total = cases.length;
  const parts = Math.ceil(total / chunkSize);
  for (let i = 0; i < parts; i++) {
    const slice = cases.slice(i * chunkSize, (i + 1) * chunkSize);
    const blob = new Blob([JSON.stringify(slice, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}_part${String(i + 1).padStart(3, "0")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return parts;
}

export function EchrImportWizard({ open, onOpenChange, onSuccess }: EchrImportWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const [splitSize, setSplitSize] = useState(200);

  const [status, setStatus] = useState<Status>("idle");
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [parsedCases, setParsedCases] = useState<ParsedCase[]>([]);
  const [parseSkipped, setParseSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [practiceCategory, setPracticeCategory] = useState("echr");
  const BATCH_SIZE = 20;

  const [stats, setStats] = useState<ImportStats>({
    total: 0, processed: 0, inserted: 0, skipped: 0, skippedById: 0, skippedByHash: 0, skippedNoText: 0, errors: 0, parseSkipped: 0,
  });

  const [errorDetails, setErrorDetails] = useState<Array<{ title: string; error: string }>>([]);
  const [parseProgress, setParseProgress] = useState<{ file: string; pct: number } | null>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const invalid = files.filter(f =>
      !f.name.endsWith(".jsonl") && !f.name.endsWith(".json") && !f.name.endsWith(".txt")
    );
    if (invalid.length > 0) {
      toast.error(`\u054D\u0561\u057F\u0561\u0580\u057E\u0578\u0582\u0574 \u0565\u0576 .json, .jsonl, .txt: ${invalid.map(f => f.name).join(", ")}`);
      return;
    }

    setStatus("parsing");
    setError(null);
    setParseProgress(null);

    const entries: FileEntry[] = [];
    let totalSkipped = 0;

    for (const file of files) {
      try {
        const fileCases: ParsedCase[] = [];
        toast.info(`\u053F\u0561\u0580\u0564\u0561\u0574 \u0586\u0561\u0575\u056C\u0568 ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} \u0544\u0532)...`);

        const { skipped } = await streamParseCases(
          file,
          (obj) => fileCases.push(obj),
          (bytesRead) => {
            const pct = Math.min(99, Math.round((bytesRead / file.size) * 100));
            setParseProgress({ file: file.name, pct });
          }
        );

        entries.push({ name: file.name, cases: fileCases, skipped });
        totalSkipped += skipped;
      } catch (err) {
        console.error(`Failed to read "${file.name}":`, err);
        entries.push({ name: file.name, cases: [], skipped: 0 });
      }
    }

    setParseProgress(null);
    setFileEntries(entries);
    const allCases = entries.flatMap(e => e.cases);
    setParsedCases(allCases);
    setParseSkipped(totalSkipped);
    setStatus("idle");

    if (allCases.length > 0) {
      toast.success(
        `\u0533\u057F\u0576\u057E\u0565\u056C \u0567 ${allCases.length.toLocaleString()} \u0564\u0565\u056C` +
        (totalSkipped > 0 ? ` (\u0562\u0561\u0581 \u0569\u0578\u0572\u057E\u0565\u056C ${totalSkipped})` : "")
      );
    } else {
      toast.error(`\u0549\u0570\u0561\u057B\u0578\u0572\u057E\u0565\u0581 \u0564\u0565\u056C\u0565\u0580 \u0563\u057F\u0576\u0565\u056C. \u0532\u0561\u0581 \u0569\u0578\u0572\u057E\u0565\u056C: ${totalSkipped}`);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const extractErrMsg = (err: unknown): string => {
    if (!err || typeof err !== "object") return String(err);
    const e = err as Record<string, unknown>;
    const ctx = e.context as Record<string, unknown> | undefined;
    if (ctx?.body) {
      const b = ctx.body;
      if (typeof b === "object" && b !== null) {
        const bo = b as Record<string, unknown>;
        if (typeof bo.error === "string") return bo.error;
        if (typeof bo.message === "string") return bo.message;
      }
      if (typeof b === "string") {
        try { const p = JSON.parse(b); return p?.error || p?.message || b; } catch { return b; }
      }
    }
    return typeof e.message === "string" ? e.message : "Unknown error";
  };

  const handleImport = useCallback(async () => {
    if (parsedCases.length === 0) return;

    setStatus("importing");
    abortRef.current = false;
    setErrorDetails([]);

    const total = parsedCases.length;
    let processed = 0;
    let inserted = 0;
    let importSkipped = 0;
    let importSkippedById = 0;
    let importSkippedByHash = 0;
    let importSkippedNoText = 0;
    let importErrors = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    setStats({ total, processed: 0, inserted: 0, skipped: 0, skippedById: 0, skippedByHash: 0, skippedNoText: 0, errors: 0, parseSkipped });

    for (let batchIdx = 0; batchIdx < total; batchIdx += BATCH_SIZE) {
      if (abortRef.current) break;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        toast.error(`\u053f\u0561\u0576\u0563 \u2014 ${consecutiveErrors} \u0570\u0561\u057b\u0578\u0580\u0564. \u057d\u056d\u0561\u056c\u0576\u0565\u0580`);
        break;
      }

      let batchOk = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (abortRef.current) break;
        try {
          const batchCases = parsedCases.slice(batchIdx, batchIdx + BATCH_SIZE);
          const { data, error: fnErr } = await supabase.functions.invoke("echr-import", {
            body: { rawContent: batchCases, practiceCategory },
          });

          if (fnErr) {
            const msg = extractErrMsg(fnErr);
            if (attempt < 2) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
            throw new Error(msg);
          }
          if (data?.error) throw new Error(data.error);

          processed += data.batchProcessed ?? BATCH_SIZE;
          inserted += data.inserted ?? 0;
          importSkipped += data.skipped ?? 0;
          importSkippedById += data.skippedById ?? 0;
          importSkippedByHash += data.skippedByHash ?? 0;
          importSkippedNoText += data.skippedNoText ?? 0;
          importErrors += data.errors ?? 0;

          if (Array.isArray(data.errorDetails)) {
            setErrorDetails(prev => [...prev, ...data.errorDetails]);
          }

          consecutiveErrors = 0;
          batchOk = true;
          setStats({ total, processed, inserted, skipped: importSkipped, skippedById: importSkippedById, skippedByHash: importSkippedByHash, skippedNoText: importSkippedNoText, errors: importErrors, parseSkipped });
          break;
        } catch (err) {
          console.error(`Batch ${batchIdx} error:`, err);
          if (attempt < 2) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); }
        }
      }

      if (!batchOk) {
        consecutiveErrors++;
        importErrors += BATCH_SIZE;
        processed += BATCH_SIZE;
        setStats({ total, processed, inserted, skipped: importSkipped, skippedById: importSkippedById, skippedByHash: importSkippedByHash, skippedNoText: importSkippedNoText, errors: importErrors, parseSkipped });
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    setStatus("success");
    toast.success(`\u0546\u0565\u0580\u0574\u0578\u0582\u056E\u0578\u0582\u0574 \u0561\u057E\u0561\u0580\u057F\u057E\u0565\u0581 \u2014 ${inserted} \u0576\u0578\u0580, ${importSkipped} \u0562\u0561\u0581 \u0569\u0578\u0572\u057E\u0561\u056E`);
    onSuccess();
  }, [parsedCases, practiceCategory, parseSkipped, onSuccess]);

  const handleAbort = useCallback(() => {
    abortRef.current = true;
    setStatus("idle");
    toast.info("\u0538\u0576\u0564\u0570\u0561\u057F\u057E\u0565\u056C \u0567");
  }, []);

  const handleClose = useCallback(() => {
    abortRef.current = true;
    setStatus("idle");
    setFileEntries([]);
    setParsedCases([]);
    setParseSkipped(0);
    setError(null);
    setStats({ total: 0, processed: 0, inserted: 0, skipped: 0, skippedById: 0, skippedByHash: 0, skippedNoText: 0, errors: 0, parseSkipped: 0 });
    onOpenChange(false);
  }, [onOpenChange]);

  const progressPct = stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0;
  const isRunning = status === "importing" || status === "parsing";
  const totalCases = parsedCases.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {"\u0544\u053b\u0535\u0534 \u0564\u0565\u056C\u0565\u0580\u056B \u0576\u0565\u0580\u0574\u0578\u0582\u056E\u0578\u0582\u0574"}
          </DialogTitle>
          <DialogDescription>
            {"\u0532\u0565\u057C\u0576\u0565\u0584 JSON/JSONL/TXT \u0586\u0561\u0575\u056C HUDOC \u0564\u0565\u056C\u0565\u0580\u0578\u057E \u2014 \u0575\u0578\u0582\u0580\u0561\u0584\u0561\u0576\u0579\u0575\u0578\u0582\u0580\u0568 \u056F\u057A\u0561\u0570\u057A\u0561\u0576\u057E\u056B \u0561\u057C\u0561\u0576\u0571\u056B\u0576 \u0563\u0580\u0561\u057C\u0578\u0582\u0574\u0578\u057E"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* File selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Files className="h-4 w-4" />
              {"\u0556\u0561\u0575\u056C (.json / .jsonl / .txt) \u2014 \u056F\u0561\u0580\u0565\u056C\u056B \u0567 \u0574\u056B \u0584\u0561\u0576\u056B \u0586\u0561\u0575\u056C"}
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.jsonl,.txt"
              multiple
              onChange={handleFileSelect}
              disabled={isRunning}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              disabled={isRunning}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {fileEntries.length > 0
                ? `${"\u0538\u0576\u057F\u0580\u057E\u0561\u056E \u0567"} ${fileEntries.length} ${"\u0586\u0561\u0575\u056C"}`
                : "\u0538\u0576\u057F\u0580\u0565\u056C \u0586\u0561\u0575\u056C\u0565\u0580"}
            </Button>

            {status === "parsing" && parseProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{"\u053f\u0561\u0580\u0564\u0561\u0574"}: {parseProgress.file} — {parseProgress.pct}%</span>
                </div>
                <Progress value={parseProgress.pct} className="h-1.5" />
              </div>
            )}

            {fileEntries.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-2 space-y-1">
                {fileEntries.map((fe, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <FileJson className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="break-all flex-1 text-muted-foreground leading-snug">{fe.name}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">{fe.cases.length.toLocaleString()} {"\u0563\u0578\u0580\u056e"}</Badge>
                    {fe.skipped > 0 && (
                      <Badge variant="destructive" className="text-[10px] shrink-0">{fe.skipped} skip</Badge>
                    )}
                  </div>
                ))}
                <p className="text-xs font-semibold text-primary pt-1 border-t mt-1">
                  {"\u0538\u0576\u0564\u0561\u0574\u0565\u0576\u0568"}: {totalCases.toLocaleString()} {"\u0563\u0578\u0580\u056e"} · {fileEntries.length} {"\u0586\u0561\u0575\u056c"}
                </p>
              </div>
            )}
          </div>

          {/* Preview */}
          {parsedCases.length > 0 && status === "idle" && (
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-primary" />
                {"\u0533\u057F\u0576\u057E\u0565\u056C \u0567"} <span className="font-bold text-primary">{parsedCases.length.toLocaleString()}</span> {"\u0564\u0565\u056C"}
              </Label>
              <ScrollArea className="h-44 rounded-lg border">
                <div className="p-2 space-y-1.5">
                  {parsedCases.slice(0, 8).map((c, i) => (
                    <div key={i} className="rounded border bg-muted/40 p-2 text-xs flex items-start gap-2">
                      <span className="text-muted-foreground font-mono shrink-0 w-5">{i+1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {c.docname || c.title || c.case_name || `Case ${i + 1}`}
                        </p>
                        <p className="text-muted-foreground truncate text-[10px]">
                          № {c.appno || c.itemid || c.application_no || "\u2014"}
                          {c.respondent ? ` · ${c.respondent}` : ""}
                          {c.judgementdate ? ` · ${c.judgementdate}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                  {parsedCases.length > 8 && (
                    <p className="text-xs text-center text-muted-foreground py-1">
                      ... {"\u0587 \u0587\u056C"} {parsedCases.length - 8} {"\u0564\u0565\u056C"}
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Options */}
          {parsedCases.length > 0 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{"\u053f\u0561\u057F\u0565\u0563\u0578\u0580\u056B\u0561"}</Label>
                <Select value={practiceCategory} onValueChange={setPracticeCategory} disabled={isRunning}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRACTICE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Progress */}
          {(status === "importing" || (status === "success" && stats.total > 0)) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {status === "importing" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-primary" />
                )}
                <span className="text-sm font-medium">
                  {status === "importing"
                    ? `${"\u0546\u0565\u0580\u0574\u0578\u0582\u056e\u0578\u0582\u0574"}... ${stats.processed}/${stats.total}`
                    : `${"\u0531\u057E\u0561\u0580\u057F\u057E\u0565\u0581"} — ${stats.processed}/${stats.total}`}
                </span>
                <Badge variant="outline" className="ml-auto">{progressPct}%</Badge>
              </div>
              <Progress value={progressPct} className="h-2" />

              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded border bg-primary/10 p-2">
                  <p className="font-mono font-bold text-primary">{stats.inserted}</p>
                  <p className="text-muted-foreground">{"\u0546\u0565\u0580\u0574\u0578\u0582\u056E\u057E\u0561\u056E"}</p>
                </div>
                <div className="rounded border bg-accent p-2">
                  <p className="font-mono font-bold text-accent-foreground">{stats.skipped}</p>
                  <p className="text-muted-foreground">{"\u0532\u0561\u0581 \u0569\u0578\u0572\u057E\u0561\u056E"}</p>
                </div>
                <div className="rounded border bg-destructive/10 p-2">
                  <p className="font-mono font-bold text-destructive">{stats.errors}</p>
                  <p className="text-muted-foreground">{"\u054D\u056D\u0561\u056C\u0576\u0565\u0580"}</p>
                </div>
                <div className="rounded border bg-muted p-2">
                  <p className="font-mono font-bold">{stats.parseSkipped}</p>
                  <p className="text-muted-foreground">{"\u054A\u0561\u0580\u057D. \u0562\u0561\u0581"}</p>
                </div>
              </div>

              {stats.skipped > 0 && (
                <div className="rounded border bg-muted/40 p-2 text-xs space-y-1">
                  <p className="font-semibold text-muted-foreground">{"\u0532\u0561\u0581 \u0569\u0578\u0572\u057E\u0561\u056E\u056B \u057A\u0561\u057F\u0573\u0561\u057C\u0576\u0565\u0580"}:</p>
                  <div className="flex flex-wrap gap-3">
                    {stats.skippedById > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="font-mono font-bold">{stats.skippedById}</span>
                        <span className="text-muted-foreground">{"\u056F\u0580\u056F\u0576\u0578\u0580\u0564 ID"}</span>
                      </span>
                    )}
                    {stats.skippedByHash > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="font-mono font-bold">{stats.skippedByHash}</span>
                        <span className="text-muted-foreground">{"\u056F\u0580\u056F\u0576\u0578\u0580\u0564 \u0562\u0578\u057E\u0561\u0576\u0564"}</span>
                      </span>
                    )}
                    {stats.skippedNoText > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="font-mono font-bold">{stats.skippedNoText}</span>
                        <span className="text-muted-foreground">{"\u0564\u0561\u057F\u0561\u0580\u056F \u057F\u0565\u0584\u057D\u057F"}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {errorDetails.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {"\u054D\u056D\u0561\u056C\u0576\u0565\u0580\u056B \u0574\u0561\u0576\u0580\u0561\u0574\u0561\u057D\u0576\u0565\u0580"} ({errorDetails.length}):
                  </p>
                  <ScrollArea className="max-h-40 rounded border bg-destructive/5 p-2">
                    <div className="space-y-1.5">
                      {errorDetails.map((ed, idx) => (
                        <div key={idx} className="text-xs border-b border-destructive/10 pb-1 last:border-0">
                          <p className="font-medium truncate" title={ed.title}>{ed.title}</p>
                          <p className="text-destructive font-mono text-[11px] break-all">{ed.error}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {status === "error" && error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Split tool */}
          {status === "idle" && parsedCases.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Scissors className="h-3.5 w-3.5" />
                {"\u0532\u0561\u056a\u0561\u0576\u0565\u056c \u0586\u0561\u0575\u056c\u0568 \u0574\u0561\u057d\u0565\u0580\u056b"}
              </p>
              <div className="flex items-center gap-2">
                <Select value={String(splitSize)} onValueChange={(v) => setSplitSize(Number(v))}>
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50 / {"\u0586\u0561\u0575\u056c"}</SelectItem>
                    <SelectItem value="100">100 / {"\u0586\u0561\u0575\u056c"}</SelectItem>
                    <SelectItem value="200">200 / {"\u0586\u0561\u0575\u056c"}</SelectItem>
                    <SelectItem value="500">500 / {"\u0586\u0561\u0575\u056c"}</SelectItem>
                    <SelectItem value="1000">1000 / {"\u0586\u0561\u0575\u056c"}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    const parts = splitAndDownload(parsedCases, splitSize, "echr_chunk");
                    toast.success(`${parts} {"\u0586\u0561\u0575\u056c"} × ~${splitSize}`);
                  }}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {Math.ceil(parsedCases.length / splitSize)} {"\u0586\u0561\u0575\u056c"}
                </Button>
              </div>
            </div>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex gap-2">
            {status === "idle" && parsedCases.length > 0 && (
              <Button onClick={handleImport} className="flex-1 h-11 text-base font-semibold">
                <Upload className="mr-2 h-5 w-5" />
                {"\u0546\u0565\u0580\u0574\u0578\u0582\u056E\u0565\u056C"} {totalCases.toLocaleString()} {"\u0564\u0565\u056C"}
              </Button>
            )}

            {status === "importing" && (
              <Button variant="outline" onClick={handleAbort} className="flex-1">
                <X className="mr-2 h-4 w-4" />
                {"\u053f\u0561\u0576\u0563\u0576\u0565\u0581\u0576\u0565\u056C"}
              </Button>
            )}

            {status === "success" && (
              <Button onClick={handleClose}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {"\u0553\u0561\u056F\u0565\u056C"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
