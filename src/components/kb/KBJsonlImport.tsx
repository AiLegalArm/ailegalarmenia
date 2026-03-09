import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { FileJson, Loader2, CheckCircle, AlertTriangle, Upload, FileText, Play, Pause, RotateCcw } from 'lucide-react';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface KBJsonlImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type ImportStatus = 'idle' | 'parsing' | 'importing' | 'fetching_pdfs' | 'paused' | 'success' | 'error';

interface ArlisDocument {
  uniqid?: string;
  pdf_link?: string;
  ActNumber?: string;
  DocType?: string;
  ActType?: string;
  ActStatus?: string;
  Source?: string;
  EnactmentLocation?: string;
  EnactmentOrgan?: string;
  EnactmentDate?: string;
  SigningOrgan?: string;
  SigningDate?: string;
  RatificationOrgan?: string;
  RatificationDate?: string;
  EffectiveDate?: string;
  InterruptDate?: string | null;
  title?: string;
  language?: string;
  content_text?: string;
  content?: string;
  text?: string;
  category?: string;
  source_name?: string;
  source_url?: string;
  article_number?: string;
  version_date?: string;
}

interface ImportResult {
  total: number;
  imported: number;
  errors: number;
  samples: string[];
}

export function KBJsonlImport({ open, onOpenChange, onSuccess }: KBJsonlImportProps) {
  const { t } = useTranslation(['kb', 'common']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [totalLines, setTotalLines] = useState(0);
  const [defaultCategory, setDefaultCategory] = useState<KbCategory>('other');
  const [batchSize, setBatchSize] = useState(100);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ArlisDocument[]>([]);
  const [isArlisFormat, setIsArlisFormat] = useState(false);
  const [pdfFetchProgress, setPdfFetchProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [pdfFetchIndex, setPdfFetchIndex] = useState(0);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);

  const parseDate = (dateStr: string | undefined | null): string | null => {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return null;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.jsonl') && !file.name.endsWith('.json')) {
      toast.error('Supported: .jsonl, .json');
      return;
    }

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Max size: ${maxSize / (1024 * 1024)}MB`);
      return;
    }

    setStatus('parsing');
    setFileName(file.name);
    setProgress(10);

    try {
      const text = await file.text();
      setProgress(30);
      
      let docs: ArlisDocument[] = [];
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length > 1 && !text.trim().startsWith('[')) {
        for (const line of lines) {
          try {
            const doc = JSON.parse(line);
            if (doc.title || doc.pdf_link || doc.content_text) {
              docs.push(doc);
            }
          } catch {
            // Skip invalid lines
          }
        }
      } else {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            docs = parsed.filter(d => d.title || d.pdf_link || d.content_text);
          }
        } catch {
          throw new Error('Cannot parse file format');
        }
      }

      if (docs.length === 0) throw new Error('No documents found');

      const hasArlisFields = docs.some(d => d.pdf_link || d.ActNumber || d.EnactmentOrgan);
      setIsArlisFormat(hasArlisFields);
      setDocuments(docs);
      setTotalLines(docs.length);
      setProgress(100);
      setStatus('idle');
      
      toast.success(`Found ${docs.length.toLocaleString()} documents${hasArlisFields ? ' (ARLIS format)' : ''}`);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Parse error');
      toast.error('File read error');
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (documents.length === 0) return;

    setStatus('importing');
    setProgress(0);
    setError(null);
    setBatchErrors([]);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStatus('error');
      setError('Not authenticated');
      return;
    }

    let imported = 0;
    let errors = 0;
    const samples: string[] = [];
    const allImportedIds: string[] = [];

    try {
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        
        const records = batch.map(doc => {
          let contentText = doc.content_text || doc.content || doc.text || '';
          
          if (!contentText && isArlisFormat) {
            const parts: string[] = [];
            if (doc.title) parts.push(`# ${doc.title}\n`);
            if (doc.ActNumber) parts.push(`**\u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u056B \u0570\u0561\u0574\u0561\u0580:** ${doc.ActNumber}`);
            if (doc.ActType) parts.push(`**\u0553\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u056B \u057F\u0565\u057D\u0561\u056F:** ${doc.ActType}`);
            if (doc.EnactmentOrgan) parts.push(`**\u0538\u0576\u0564\u0578\u0582\u0576\u0578\u0572 \u0574\u0561\u0580\u0574\u056B\u0576:** ${doc.EnactmentOrgan}`);
            if (doc.EnactmentDate) parts.push(`**\u0538\u0576\u0564\u0578\u0582\u0576\u0574\u0561\u0576 \u0561\u0574\u057D\u0561\u0569\u056B\u057E:** ${doc.EnactmentDate}`);
            if (doc.EffectiveDate) parts.push(`**\u0548\u0582\u056A\u056B \u0574\u0565\u057B \u0574\u057F\u0576\u0565\u056C\u0578\u0582 \u0561\u0574\u057D\u0561\u0569\u056B\u057E:** ${doc.EffectiveDate}`);
            if (doc.ActStatus) parts.push(`**\u053F\u0561\u0580\u0563\u0561\u057E\u056B\u0573\u0561\u056F:** ${doc.ActStatus}`);
            if (doc.Source) parts.push(`**\u0531\u0572\u0562\u0575\u0578\u0582\u0580:** ${doc.Source}`);
            if (doc.pdf_link) parts.push(`\n**PDF:** ${doc.pdf_link}`);
            contentText = parts.join('\n');
          }
          
          const sanitizedContent = contentText.replace(/\u0000/g, '');
          const sanitizedTitle = (doc.title || 'Untitled').replace(/\u0000/g, '');
          
          const validCategories = kbCategoryOptions.map(c => c.value);
          const category = validCategories.includes(doc.category as KbCategory) 
            ? doc.category as KbCategory 
            : defaultCategory;

          const versionDate = parseDate(doc.EffectiveDate) || doc.version_date || null;

          return {
            title: sanitizedTitle.substring(0, 500),
            content_text: sanitizedContent.substring(0, 200000),
            category,
            source_name: doc.Source || doc.EnactmentOrgan || doc.source_name || 'ARLIS.am',
            source_url: doc.pdf_link || doc.source_url || null,
            article_number: doc.ActNumber || doc.article_number || null,
            version_date: versionDate,
            uploaded_by: user.id,
            is_active: true,
          };
        });

        const { error: insertError, data } = await supabase
          .from('knowledge_base')
          .insert(records)
          .select('id, title');

        if (insertError) {
          console.error('Batch insert error:', insertError);
          errors += batch.length;
          setBatchErrors(prev => [...prev, `Batch ${Math.floor(i / batchSize) + 1}: ${insertError.message || insertError.code || 'Unknown error'}`]);
        } else {
          imported += data?.length || batch.length;
          if (data) {
            allImportedIds.push(...data.map(d => d.id));
          }
          if (samples.length < 5 && data) {
            samples.push(...data.slice(0, 5 - samples.length).map(d => d.title));
          }
        }

        setProgress(Math.round(((i + batch.length) / documents.length) * 100));
      }

      setImportedIds(allImportedIds);
      setResult({ total: documents.length, imported, errors, samples });
      
      // Auto-start PDF fetching if ARLIS format with pdf_links
      if (isArlisFormat && allImportedIds.length > 0) {
        toast.success(`Imported ${imported.toLocaleString()} docs. Starting PDF scraping...`);
        onSuccess();
        // Auto-start PDF fetching
        setPdfFetchIndex(0);
        setPdfFetchProgress({ done: 0, total: allImportedIds.length, errors: 0 });
        setStatus('fetching_pdfs');
      } else {
        setStatus('success');
        toast.success(`Imported ${imported.toLocaleString()} documents`);
        onSuccess();
      }

    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Import error');
      toast.error('Import failed');
    }
  };

  // Auto-running PDF fetch loop
  const fetchNextPdfBatch = useCallback(async () => {
    if (importedIds.length === 0 || pdfFetchIndex >= importedIds.length) {
      setStatus('success');
      toast.success(`PDF scraping complete: ${pdfFetchProgress.done} done, ${pdfFetchProgress.errors} errors`);
      onSuccess();
      return;
    }

    const chunkSize = 20;
    const chunk = importedIds.slice(pdfFetchIndex, pdfFetchIndex + chunkSize);

    try {
      const { data, error } = await supabase.functions.invoke('kb-fetch-pdf-content', {
        body: { kbIds: chunk, batchSize: 3, delayMs: 3000 }
      });

      if (error) {
        console.error('PDF fetch error:', error);
        setPdfFetchProgress(prev => ({ ...prev, errors: prev.errors + chunk.length }));
      } else if (data) {
        setPdfFetchProgress(prev => ({
          done: prev.done + (data.processed || 0),
          total: prev.total,
          errors: prev.errors + (data.errors || 0),
        }));
      }

      setPdfFetchIndex(prev => prev + chunkSize);
    } catch (err) {
      console.error('PDF fetch batch failed:', err);
      setPdfFetchProgress(prev => ({ ...prev, errors: prev.errors + chunk.length }));
      setPdfFetchIndex(prev => prev + chunkSize);
    }
  }, [importedIds, pdfFetchIndex, pdfFetchProgress, onSuccess]);

  // Effect to drive the auto-fetch loop
  useEffect(() => {
    if (status !== 'fetching_pdfs' || abortRef.current) return;
    
    const timer = setTimeout(() => {
      fetchNextPdfBatch();
    }, 500);

    return () => clearTimeout(timer);
  }, [status, pdfFetchIndex, fetchNextPdfBatch]);

  const handlePause = () => {
    abortRef.current = true;
    setStatus('paused');
    toast.info(`Paused at ${pdfFetchProgress.done}/${pdfFetchProgress.total}`);
  };

  const handleResume = () => {
    abortRef.current = false;
    setStatus('fetching_pdfs');
    toast.info('Resuming PDF scraping...');
  };

  const handleClose = () => {
    abortRef.current = true;
    setDocuments([]);
    setFileName('');
    setTotalLines(0);
    setDefaultCategory('other');
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setError(null);
    setBatchErrors([]);
    setIsArlisFormat(false);
    setImportedIds([]);
    setPdfFetchProgress({ done: 0, total: 0, errors: 0 });
    setPdfFetchIndex(0);
    onOpenChange(false);
  };

  const pdfPercent = pdfFetchProgress.total > 0 
    ? Math.round((pdfFetchIndex / pdfFetchProgress.total) * 100) 
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            JSONL/JSON Import
          </DialogTitle>
          <DialogDescription>
            Import from ARLIS.am JSONL or generic format (up to 500MB)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File Selection */}
          <div className="space-y-2">
            <Label>File (.jsonl or .json)</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".jsonl,.json"
              onChange={handleFileSelect}
              disabled={status === 'importing' || status === 'fetching_pdfs'}
            />
            {fileName && (
              <p className="text-sm text-muted-foreground">
                {fileName} — {totalLines.toLocaleString()} documents
                {isArlisFormat && <Badge variant="secondary" className="ml-2">ARLIS format</Badge>}
              </p>
            )}
          </div>

          {/* Settings */}
          {documents.length > 0 && (status === 'idle' || status === 'parsing') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Select value={defaultCategory} onValueChange={(v) => setDefaultCategory(v as KbCategory)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {kbCategoryOptions.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {t(cat.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Batch size</Label>
                  <Select value={String(batchSize)} onValueChange={(v) => setBatchSize(Number(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <Label className="text-xs">Preview (first 3):</Label>
                <ScrollArea className="h-48 rounded-lg border">
                  <div className="p-2 space-y-2">
                    {documents.slice(0, 3).map((doc, i) => (
                      <Card key={i} className="p-3 space-y-1.5">
                        <p className="font-medium text-sm leading-tight">{doc.title || 'No title'}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {doc.ActNumber && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {doc.ActNumber}
                            </Badge>
                          )}
                          {doc.ActType && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {doc.ActType}
                            </Badge>
                          )}
                          {doc.ActStatus && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {doc.ActStatus}
                            </Badge>
                          )}
                          {doc.EnactmentDate && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {doc.EnactmentDate}
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          {doc.EnactmentOrgan && <p>{doc.EnactmentOrgan}</p>}
                          {doc.Source && <p className="truncate">{doc.Source}</p>}
                          {doc.pdf_link && (
                            <p className="truncate font-mono text-[10px] opacity-70">{doc.pdf_link}</p>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <Button onClick={handleImport} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                Import {documents.length.toLocaleString()} documents
                {isArlisFormat && ' + auto-scrape PDFs'}
              </Button>
            </>
          )}

          {/* Import Progress */}
          {status === 'importing' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Importing metadata... {progress}%</span>
              </div>
              <Progress value={progress} />
              {batchErrors.length > 0 && (
                <ScrollArea className="h-24 rounded-lg border border-destructive/30 bg-destructive/5">
                  <div className="p-2 space-y-1">
                    {batchErrors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive font-mono">{err}</p>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          {/* PDF Fetching Progress */}
          {(status === 'fetching_pdfs' || status === 'paused') && (
            <div className="space-y-3">
              {result && (
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">
                    Metadata imported: {result.imported.toLocaleString()}
                  </span>
                </div>
              )}
              
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {status === 'fetching_pdfs' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Pause className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">
                      PDF Scraping: {pdfFetchProgress.done}/{pdfFetchProgress.total}
                    </span>
                  </div>
                  <Badge variant={status === 'fetching_pdfs' ? 'default' : 'secondary'}>
                    {pdfPercent}%
                  </Badge>
                </div>
                
                <Progress value={pdfPercent} className="h-2" />
                
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {pdfFetchProgress.done} done
                    {pdfFetchProgress.errors > 0 && `, ${pdfFetchProgress.errors} errors`}
                  </span>
                  <span>{pdfFetchProgress.total - pdfFetchIndex} remaining</span>
                </div>

                <div className="flex gap-2">
                  {status === 'fetching_pdfs' ? (
                    <Button variant="outline" size="sm" onClick={handlePause} className="flex-1">
                      <Pause className="mr-1.5 h-3.5 w-3.5" />
                      Pause
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" onClick={handleResume} className="flex-1">
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                      Resume
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleClose}>
                    Close
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Error */}
          {status === 'error' && error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Success */}
          {status === 'success' && result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">
                  Done: {result.imported.toLocaleString()} imported
                  {pdfFetchProgress.done > 0 && `, ${pdfFetchProgress.done} PDFs scraped`}
                </span>
              </div>

              {(result.errors > 0 || pdfFetchProgress.errors > 0) && (
                <p className="text-sm text-destructive">
                  Errors: {result.errors + pdfFetchProgress.errors}
                </p>
              )}

              {batchErrors.length > 0 && (
                <ScrollArea className="h-32 rounded-lg border border-destructive/30 bg-destructive/5">
                  <div className="p-2 space-y-1">
                    {batchErrors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive font-mono">{err}</p>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {result.samples.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Samples:</Label>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {result.samples.map((s, i) => (
                      <li key={i} className="truncate">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Button onClick={handleClose} className="w-full">
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
