import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload,
  FileText,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PreviewRow {
  lemma: string;
  part_of_speech: string | null;
  definition: string | null;
  examples: string[] | null;
  forms: string[] | null;
  source: string | null;
}

interface ValidationResult {
  ok: boolean;
  file_type: string;
  detected_rows: number;
  valid_rows: number;
  preview: PreviewRow[];
  warnings: string[];
  errors: { row: number; message: string }[];
}

interface ImportResult {
  ok: boolean;
  job_id?: string;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { row: number; lemma?: string; message: string }[];
}

type Phase = 'upload' | 'validating' | 'validated' | 'importing' | 'done' | 'error';

export function DictionaryImport() {
  const { t } = useTranslation('dictionary');
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [mode, setMode] = useState<'upsert' | 'insert'>('upsert');
  const [source, setSource] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getFileType = (f: File): 'csv' | 'jsonl' | null => {
    const name = f.name.toLowerCase();
    if (name.endsWith('.jsonl') || name.endsWith('.ndjson')) return 'jsonl';
    if (name.endsWith('.csv')) return 'csv';
    if (name.endsWith('.json')) return 'jsonl'; // treat .json as jsonl
    return null;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const ft = getFileType(f);
    if (!ft) {
      toast({ title: 'Unsupported file type', description: 'Use .csv or .jsonl', variant: 'destructive' });
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 20MB', variant: 'destructive' });
      return;
    }

    setFile(f);
    setPhase('upload');
    setValidation(null);
    setImportResult(null);
    setErrorMsg(null);

    // Read as base64
    const buf = await f.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    setFileBase64(btoa(binary));
  };

  const handleValidate = async () => {
    if (!file || !fileBase64) return;
    const ft = getFileType(file);
    if (!ft) return;

    setPhase('validating');
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.functions.invoke('dictionary-import-validate', {
        body: { file_type: ft, content_base64: fileBase64, source: source || undefined, mode },
      });

      if (error) throw new Error(error.message);
      setValidation(data as ValidationResult);
      setPhase('validated');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Validation failed');
      setPhase('error');
    }
  };

  const handleImport = async () => {
    if (!file || !fileBase64) return;
    const ft = getFileType(file);
    if (!ft) return;

    setPhase('importing');
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.functions.invoke('dictionary-import-run', {
        body: { file_type: ft, content_base64: fileBase64, source: source || undefined, mode, batch_size: 300 },
      });

      if (error) throw new Error(error.message);
      setImportResult(data as ImportResult);
      setPhase('done');
      toast({ title: `Import complete: ${(data as ImportResult).inserted} inserted` });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
      setPhase('error');
    }
  };

  const handleReset = () => {
    setPhase('upload');
    setFile(null);
    setFileBase64(null);
    setValidation(null);
    setImportResult(null);
    setErrorMsg(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadErrors = () => {
    const errors = importResult?.errors || validation?.errors || [];
    const blob = new Blob([JSON.stringify(errors, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dictionary-import-errors.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {'\u0532\u0561\u057c\u0561\u0580\u0561\u0576 \u2014 Import'}
          </CardTitle>
          <CardDescription>
            {'CSV / JSONL \u056b\u0574\u057a\u0578\u0580\u057f'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File upload */}
          <div className="space-y-2">
            <Label>{'\u0556\u0561\u0575\u056c'}</Label>
            <Input
              ref={inputRef}
              type="file"
              accept=".csv,.jsonl,.ndjson,.json"
              onChange={handleFileSelect}
              disabled={phase === 'validating' || phase === 'importing'}
            />
            {file && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>{file.name}</span>
                <Badge variant="outline">{formatSize(file.size)}</Badge>
                <Badge variant="secondary">{getFileType(file)?.toUpperCase()}</Badge>
              </div>
            )}
          </div>

          {/* Options */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{'\u054c\u0565\u056a\u056b\u0574'}</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'upsert' | 'insert')}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="upsert" id="upsert" />
                  <Label htmlFor="upsert" className="font-normal">UPSERT (update duplicates)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="insert" id="insert" />
                  <Label htmlFor="insert" className="font-normal">INSERT (fail on duplicates)</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label>Source label</Label>
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. my-dict-v1"
                disabled={phase === 'validating' || phase === 'importing'}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleValidate}
              disabled={!file || phase === 'validating' || phase === 'importing'}
              variant="outline"
            >
              {phase === 'validating' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
              Validate
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || phase === 'validating' || phase === 'importing' || (phase === 'validated' && validation && !validation.ok)}
            >
              {phase === 'importing' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Import
            </Button>
            {(phase === 'done' || phase === 'error' || phase === 'validated') && (
              <Button variant="ghost" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error message */}
      {errorMsg && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p className="text-sm">{errorMsg}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation result */}
      {validation && phase === 'validated' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {validation.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
              Validation Result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="outline">{validation.detected_rows} rows detected</Badge>
              <Badge variant="secondary">{validation.valid_rows} valid</Badge>
              {validation.errors.length > 0 && <Badge variant="destructive">{validation.errors.length} errors</Badge>}
            </div>

            {validation.warnings.length > 0 && (
              <div className="space-y-1">
                {validation.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-amber-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {w}
                  </p>
                ))}
              </div>
            )}

            {/* Preview table */}
            {validation.preview.length > 0 && (
              <>
                <Separator />
                <h4 className="text-sm font-medium">Preview (first {validation.preview.length} rows)</h4>
                <ScrollArea className="max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lemma</TableHead>
                        <TableHead>POS</TableHead>
                        <TableHead>Definition</TableHead>
                        <TableHead>Forms</TableHead>
                        <TableHead>Examples</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validation.preview.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.lemma}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{r.part_of_speech || '-'}</Badge></TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs">{r.definition || '-'}</TableCell>
                          <TableCell className="text-xs">{r.forms?.length ?? 0}</TableCell>
                          <TableCell className="text-xs">{r.examples?.length ?? 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </>
            )}

            {/* Validation errors */}
            {validation.errors.length > 0 && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-destructive">Errors ({validation.errors.length})</h4>
                  <Button variant="ghost" size="sm" onClick={downloadErrors}>
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                </div>
                <ScrollArea className="max-h-48">
                  <div className="space-y-1 text-xs font-mono">
                    {validation.errors.slice(0, 50).map((e, i) => (
                      <p key={i} className="text-destructive">Row {e.row}: {e.message}</p>
                    ))}
                    {validation.errors.length > 50 && (
                      <p className="text-muted-foreground">...and {validation.errors.length - 50} more</p>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import progress / result */}
      {phase === 'importing' && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">{'Importing...'}</span>
            </div>
            <Progress value={undefined} className="h-2" />
          </CardContent>
        </Card>
      )}

      {importResult && phase === 'done' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{importResult.processed}</p>
                <p className="text-xs text-muted-foreground">Processed</p>
              </div>
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                <p className="text-2xl font-bold text-green-600">{importResult.inserted}</p>
                <p className="text-xs text-muted-foreground">Inserted</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                <p className="text-xs text-muted-foreground">Updated</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                <p className="text-2xl font-bold text-amber-600">{importResult.skipped}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-destructive">Errors ({importResult.errors.length})</h4>
                  <Button variant="ghost" size="sm" onClick={downloadErrors}>
                    <Download className="h-3 w-3 mr-1" /> Download
                  </Button>
                </div>
                <ScrollArea className="max-h-48">
                  <div className="space-y-1 text-xs font-mono">
                    {importResult.errors.slice(0, 50).map((e, i) => (
                      <p key={i} className="text-destructive">
                        Row {e.row}{e.lemma ? ` (${e.lemma})` : ''}: {e.message}
                      </p>
                    ))}
                    {importResult.errors.length > 50 && (
                      <p className="text-muted-foreground">...and {importResult.errors.length - 50} more</p>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
