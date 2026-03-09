import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Globe, Loader2, CheckCircle, AlertTriangle, Search, Upload } from 'lucide-react';
import { kbCategoryOptions, type KbCategory } from '@/components/kb/kbCategories';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface KBWebScraperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type ScrapeStatus = 'idle' | 'mapping' | 'scraping' | 'success' | 'error';
type ScrapeMode = 'search' | 'sitemap' | 'urls' | 'jsonl';

interface ScrapeResult {
  totalUrls: number;
  processed: number;
  successCount: number;
  errorCount: number;
  remainingUrls: number;
  results: Array<{ url: string; status: string; title?: string; error?: string }>;
}

export function KBWebScraper({ open, onOpenChange, onSuccess }: KBWebScraperProps) {
  const { t } = useTranslation(['kb', 'common']);
  
  const [status, setStatus] = useState<ScrapeStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [siteUrl, setSiteUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [manualUrls, setManualUrls] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [category, setCategory] = useState<KbCategory>('other');
  const [limit, setLimit] = useState(0);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ScrapeMode>('search');
  const [jsonlFile, setJsonlFile] = useState<File | null>(null);
  const [parsedJsonlUrls, setParsedJsonlUrls] = useState<string[]>([]);

  const handleJsonlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonlFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const urls: string[] = [];
      let skippedCount = 0;
      let totalLines = 0;
      let firstObj: any = null;
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          totalLines++;
          if (!firstObj) firstObj = obj;
          // Filter: only include entries with ActStatus "Գործում է"
          if (obj.ActStatus && obj.ActStatus !== '\u0533\u0578\u0580\u056E\u0578\u0582\u0574 \u0567') {
            skippedCount++;
            continue;
          }
          // Try all common URL field names (case-insensitive search)
          const url = obj.pdf_link || obj.PdfLink || obj.PDF_LINK
            || obj.url || obj.URL || obj.Url
            || obj.link || obj.Link || obj.LINK
            || obj.pdf_url || obj.PdfUrl || obj.PDF_URL
            || obj.source_url || obj.SourceUrl || obj.SOURCE_URL
            || obj.href || obj.Href || obj.HREF
            || obj.DocUrl || obj.doc_url || obj.DocumentUrl
            || obj.FileUrl || obj.file_url;
          if (url && typeof url === 'string') urls.push(url);
        } catch {
          // skip invalid lines
        }
      }
      setParsedJsonlUrls(urls);
      if (urls.length === 0) {
        const keys = firstObj ? Object.keys(firstObj).join(', ') : 'N/A';
        toast.error(`URL \u0579\u056B \u0563\u057F\u0576\u057E\u0565\u056C. \u054F\u0578\u0572\u0565\u0580: ${totalLines}. \u0534\u0561\u0577\u057F\u0565\u0580: ${keys}`);
        console.log('JSONL first object:', firstObj);
      } else {
        toast.success(`\u0533\u057F\u0576\u057E\u0565\u0581 ${urls.length} URL (${totalLines} \u057F\u0578\u0572\u0565\u0580\u056B\u0581, ${skippedCount} \u0562\u0561\u0581 \u0569\u0578\u0572\u057E\u0561\u056E)`);
      }
    };
    reader.readAsText(file);
  };

  const handleScrape = async () => {
    if (mode === 'search' && !searchQuery.trim()) {
      toast.error('Введите поисковый запрос');
      return;
    }
    if (mode === 'sitemap' && !siteUrl) {
      toast.error('Укажите URL сайта');
      return;
    }
    if (mode === 'urls' && !manualUrls.trim()) {
      toast.error('Укажите URL-ы для скрейпинга');
      return;
    }
    if (mode === 'jsonl' && parsedJsonlUrls.length === 0) {
      toast.error('Загрузите JSONL файл с URL-ами');
      return;
    }
    if (!sourceName) {
      toast.error('Укажите название источника');
      return;
    }

    setStatus(mode === 'sitemap' ? 'mapping' : 'scraping');
    setProgress(10);
    setError(null);
    setResult(null);

    try {
      let urlsToSend: string[] = [];

      if (mode === 'search') {
        // Search mode - single call, no batching needed
        const { data, error: fnError } = await supabase.functions.invoke('kb-scrape-batch', {
          body: { category, sourceName, searchQuery, ...(limit > 0 ? { limit } : {}) },
        });
        if (fnError) throw fnError;
        if (data.error) throw new Error(data.error);
        setResult(data);
        setProgress(100);
        setStatus('success');
        toast.success(`\u041E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E ${data.successCount} \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432`);
        onSuccess();
        return;
      } else if (mode === 'sitemap') {
        const { data, error: fnError } = await supabase.functions.invoke('kb-scrape-batch', {
          body: { category, sourceName, sitemapUrl: siteUrl, ...(limit > 0 ? { limit } : {}) },
        });
        if (fnError) throw fnError;
        if (data.error) throw new Error(data.error);
        setResult(data);
        setProgress(100);
        setStatus('success');
        toast.success(`\u041E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E ${data.successCount} \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432`);
        onSuccess();
        return;
      } else if (mode === 'jsonl') {
        urlsToSend = parsedJsonlUrls;
      } else {
        urlsToSend = manualUrls.split('\n').map(u => u.trim()).filter(u => u.length > 0);
      }

      setStatus('scraping');
      setProgress(10);

      // Smaller batches: 10 for PDF-heavy, avoid timeouts
      const FRONTEND_BATCH = 10;
      const MAX_RETRIES = 2;
      let totalSuccess = 0;
      let totalErrors = 0;
      const allResults: Array<{ url: string; status: string; title?: string; error?: string; method?: string }> = [];

      for (let i = 0; i < urlsToSend.length; i += FRONTEND_BATCH) {
        const batch = urlsToSend.slice(i, i + FRONTEND_BATCH);
        const batchNum = Math.floor(i / FRONTEND_BATCH) + 1;
        const totalBatches = Math.ceil(urlsToSend.length / FRONTEND_BATCH);
        const pct = Math.round(10 + (80 * i / urlsToSend.length));
        setProgress(pct);
        toast.info(`\u0411\u0430\u0442\u0447 ${batchNum}/${totalBatches}: ${batch.length} URL`);

        let retries = 0;
        let batchDone = false;

        while (!batchDone && retries <= MAX_RETRIES) {
          try {
            const { data, error: fnError } = await supabase.functions.invoke('kb-scrape-batch', {
              body: { category, sourceName, urls: batch, ...(limit > 0 ? { limit } : {}) },
            });

            if (fnError) throw fnError;
            if (data.error) throw new Error(data.error);

            totalSuccess += data.successCount || 0;
            totalErrors += data.errorCount || 0;
            if (data.results) allResults.push(...data.results);
            batchDone = true;
          } catch (batchErr) {
            retries++;
            if (retries <= MAX_RETRIES) {
              console.warn(`Batch ${batchNum} retry ${retries}/${MAX_RETRIES}:`, batchErr);
              toast.warning(`\u0411\u0430\u0442\u0447 ${batchNum}: \u043F\u043E\u0432\u0442\u043E\u0440 ${retries}/${MAX_RETRIES}...`);
              await new Promise(resolve => setTimeout(resolve, 3000 * retries));
            } else {
              console.error(`Batch ${batchNum} failed after ${MAX_RETRIES} retries:`, batchErr);
              totalErrors += batch.length;
              batch.forEach(url => allResults.push({ url, status: 'error', error: 'Batch failed after retries' }));
              batchDone = true;
            }
          }
        }

        // Longer delay between batches for PDF processing
        if (i + FRONTEND_BATCH < urlsToSend.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      setResult({
        totalUrls: urlsToSend.length,
        processed: urlsToSend.length,
        successCount: totalSuccess,
        errorCount: totalErrors,
        remainingUrls: 0,
        results: allResults,
      });
      setProgress(100);
      setStatus('success');
      toast.success(`\u041E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E ${totalSuccess} \u0434\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u043E\u0432, ${totalErrors} \u043E\u0448\u0438\u0431\u043E\u043A`);
      onSuccess();

    } catch (err) {
      console.error('Scrape error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : '\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043A\u0440\u0435\u0439\u043F\u0438\u043D\u0433\u0430');
      toast.error('\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043A\u0440\u0435\u0439\u043F\u0438\u043D\u0433\u0430');
    }
  };

  const handleClose = () => {
    setSiteUrl('');
    setSearchQuery('');
    setManualUrls('');
    setSourceName('');
    setCategory('other');
    setLimit(0);
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setError(null);
    setJsonlFile(null);
    setParsedJsonlUrls([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Веб-скрейпинг для Knowledge Base
          </DialogTitle>
          <DialogDescription>
            Автоматически собирайте документы с веб-сайтов
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as ScrapeMode)} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="search">🔍 Поиск</TabsTrigger>
            <TabsTrigger value="sitemap">🗺️ Сайт</TabsTrigger>
            <TabsTrigger value="urls">📋 URL-ы</TabsTrigger>
            <TabsTrigger value="jsonl">📄 JSONL</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            <div className="space-y-2">
              <Label>Поисковый запрос</Label>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ՀՀ Քրեական օրենսգիրք site:arlis.am"
              />
              <p className="text-xs text-muted-foreground">
                Примеры: "ՀՀ Քրեական օրենսգրքի մեկնաբանություն site:arlis.am" или "cassation court decision Armenia"
              </p>
            </div>
          </TabsContent>

          <TabsContent value="sitemap" className="space-y-4">
            <div className="space-y-2">
              <Label>URL сайта</Label>
              <Input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://arlis.am"
              />
              <p className="text-xs text-muted-foreground">
                Firecrawl найдёт все страницы и документы
              </p>
            </div>
          </TabsContent>

          <TabsContent value="urls" className="space-y-4">
            <div className="space-y-2">
              <Label>URL-ы (по одному на строку)</Label>
              <Textarea
                value={manualUrls}
                onChange={(e) => setManualUrls(e.target.value)}
                placeholder="https://arlis.am/DocumentView.aspx?docid=12345&#10;https://cassation.am/decision/123"
                className="h-32 font-mono text-xs"
              />
            </div>
          </TabsContent>

          <TabsContent value="jsonl" className="space-y-4">
            <div className="space-y-2">
              <Label>JSONL файл с URL-ами PDF</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".jsonl,.ndjson"
                  onChange={handleJsonlUpload}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Каждая строка — JSON объект с полем url, link, pdf_url или source_url
              </p>
              {parsedJsonlUrls.length > 0 && (
                <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                  <p className="text-sm font-medium">Найдено URL: {parsedJsonlUrls.length}</p>
                  <div className="max-h-24 overflow-y-auto text-xs font-mono space-y-0.5">
                    {parsedJsonlUrls.slice(0, 10).map((u, i) => (
                      <p key={i} className="truncate text-muted-foreground">{u}</p>
                    ))}
                    {parsedJsonlUrls.length > 10 && (
                      <p className="text-muted-foreground">... и ещё {parsedJsonlUrls.length - 10}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-4 py-4">
          {/* Source Name */}
          <div className="space-y-2">
            <Label>Название источника</Label>
            <Input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="ARLIS.am / Cassation Court"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>{t('categories')}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as KbCategory)}>
              <SelectTrigger>
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


          {/* Start Button */}
          {status === 'idle' && (
            <Button onClick={handleScrape} className="w-full">
              <Search className="mr-2 h-4 w-4" />
              Начать скрейпинг
            </Button>
          )}

          {/* Progress */}
          {(status === 'mapping' || status === 'scraping') && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">
                  {status === 'mapping' ? 'Сканирование сайта...' : 'Обработка документов...'}
                </span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Error */}
          {status === 'error' && error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}

          {/* Success */}
          {status === 'success' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">
                  Обработано: {result.successCount} успешно, {result.errorCount} ошибок
                </span>
              </div>

              {result.remainingUrls > 0 && (
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-sm">
                    <strong>Осталось:</strong> {result.remainingUrls} URL
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Запустите скрейпинг ещё раз для следующей партии
                  </p>
                </div>
              )}

              <div className="max-h-40 overflow-y-auto space-y-1">
                {result.results.slice(0, 20).map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    {item.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{item.title || item.url}</p>
                      {item.error && (
                        <p className="text-xs text-destructive truncate">{item.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={handleClose} className="w-full">
                {t('common:close')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
