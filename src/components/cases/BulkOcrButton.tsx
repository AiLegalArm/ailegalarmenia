import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, ScanText, CheckCircle, AlertCircle, Sparkles, StopCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getFunctionsInvokeErrorMessage, isNoDataForExtractionMessage } from '@/lib/functionsInvokeError';

interface BulkOcrButtonProps {
  caseId: string;
  files: Array<{
    id: string;
    original_filename: string;
    storage_path: string;
    file_type: string | null;
  }>;
  existingOcrFileIds: Set<string>;
  forceProcess?: boolean;
}

/** Delay between sequential OCR calls to avoid rate limiting */
const DELAY_BETWEEN_CALLS_MS = 3000;
/** Max retries per file on transient errors */
const MAX_RETRIES = 2;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export function BulkOcrButton({ caseId, files, existingOcrFileIds, forceProcess = false }: BulkOcrButtonProps) {
  const { t, i18n } = useTranslation(['cases', 'ocr', 'common']);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [results, setResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const queryClient = useQueryClient();

  const filesToProcess = files.filter(f => {
    if (!forceProcess && existingOcrFileIds.has(f.id)) return false;
    const type = f.file_type?.toLowerCase() || '';
    const name = f.original_filename.toLowerCase();
    if (name.endsWith('.doc') && !name.endsWith('.docx')) return false;
    return (
      type.includes('pdf') ||
      type.includes('image') ||
      type.includes('wordprocessingml') ||
      type.includes('text/plain') ||
      name.endsWith('.pdf') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.png') ||
      name.endsWith('.docx') ||
      name.endsWith('.txt')
    );
  });

  const unsupportedDocFiles = files.filter(f => {
    const name = f.original_filename.toLowerCase();
    return name.endsWith('.doc') && !name.endsWith('.docx');
  });

  const handleCancel = () => {
    cancelledRef.current = true;
  };

  const processOneFile = async (file: typeof filesToProcess[0]): Promise<boolean> => {
    // First check if file actually exists in storage
    const { data: listData, error: listError } = await supabase.storage
      .from('case-files')
      .list(file.storage_path.split('/').slice(0, -1).join('/'), {
        search: file.storage_path.split('/').pop() || '',
        limit: 1,
      });

    if (listError || !listData || listData.length === 0) {
      throw Object.assign(
        new Error(t('ocr:file_missing_storage', 'File not found in storage. Please re-upload: {{name}}', { name: file.original_filename })),
        { isMissing: true }
      );
    }

    // Get signed URL
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('case-files')
      .createSignedUrl(file.storage_path, 600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error('Failed to get signed URL: ' + (signedUrlError?.message || 'unknown'));
    }
    const signedUrl = signedUrlData.signedUrl;

    const lang = i18n.language === 'hy' ? 'hye' : i18n.language === 'ru' ? 'rus' : 'eng';

    const { data, error } = await supabase.functions.invoke('ocr-process', {
      body: { fileUrl: signedUrl, fileName: file.original_filename, language: lang, fileId: file.id }
    });

    if (error) {
      const msg = getFunctionsInvokeErrorMessage(error);
      // Check for rate limit
      if (msg?.includes('Rate limit') || msg?.includes('429')) {
        throw Object.assign(new Error(msg), { isRateLimit: true });
      }
      throw new Error(msg);
    }

    if ((data.ok || data.success) && (data.text || data.extracted_text)) return true;

    const errMsg = data.error || data.warnings?.[0] || 'OCR failed';
    if (errMsg.includes('Rate limit') || errMsg.includes('429')) {
      throw Object.assign(new Error(errMsg), { isRateLimit: true });
    }
    throw new Error(errMsg);
  };

  const handleProcessAll = async () => {
    if (filesToProcess.length === 0) {
      toast.info(t('cases:no_files_to_process', 'No files to process'));
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResults({ success: 0, failed: 0 });
    setStatusMessage(null);
    cancelledRef.current = false;

    let successCount = 0;
    let failCount = 0;
    let rateLimitHit = false;

    for (let i = 0; i < filesToProcess.length; i++) {
      if (cancelledRef.current) {
        setStatusMessage(t('common:cancelled', 'Cancelled'));
        break;
      }

      const file = filesToProcess[i];
      setCurrentFile(file.original_filename);
      setProgress(Math.round((i / filesToProcess.length) * 100));
      setStatusMessage(`${i + 1}/${filesToProcess.length}`);

      // Add delay between calls (skip for first file)
      if (i > 0) {
        const delay = rateLimitHit ? 30000 : DELAY_BETWEEN_CALLS_MS;
        setStatusMessage(
          rateLimitHit
            ? t('ocr:waiting_rate_limit', 'Waiting for rate limit reset... ({{seconds}}s)', { seconds: Math.round(delay / 1000) })
            : `${i + 1}/${filesToProcess.length}`
        );
        await sleep(delay);
        rateLimitHit = false;
      }

      if (cancelledRef.current) break;

      let succeeded = false;
      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        try {
          await processOneFile(file);
          succeeded = true;
          break;
        } catch (err) {
          const isMissing = (err as { isMissing?: boolean }).isMissing;
          if (isMissing) {
            // File doesn't exist in storage — no point retrying
            console.warn(`File missing in storage: ${file.original_filename}`);
            toast.warning((err as Error).message);
            break;
          }
          const isRate = (err as { isRateLimit?: boolean }).isRateLimit;
          if (isRate && retry < MAX_RETRIES) {
            rateLimitHit = true;
            const backoff = 30000 + retry * 15000;
            setStatusMessage(t('ocr:rate_limit_retry', 'Rate limit hit, retrying in {{seconds}}s...', { seconds: Math.round(backoff / 1000) }));
            await sleep(backoff);
            if (cancelledRef.current) break;
            continue;
          }
          if (retry < MAX_RETRIES && !isRate) {
            await sleep(2000 * (retry + 1));
            continue;
          }
          console.error(`OCR failed for ${file.original_filename}:`, err);
        }
      }

      if (succeeded) {
        successCount++;
      } else {
        failCount++;
      }
      setResults({ success: successCount, failed: failCount });
    }

    setProgress(100);
    setCurrentFile(null);
    setIsProcessing(false);
    setStatusMessage(null);

    queryClient.invalidateQueries({ queryKey: ['case-files', caseId] });
    queryClient.invalidateQueries({ queryKey: ['ocr-results', caseId] });

    if (successCount > 0) {
      toast.success(
        t('cases:ocr_complete', 'OCR completed: {{success}} successful, {{failed}} failed', {
          success: successCount,
          failed: failCount
        })
      );
      await extractCaseFields();
    } else if (failCount > 0) {
      toast.error(t('ocr:processing_failed', 'Processing failed'));
    }
  };

  const extractCaseFields = async () => {
    try {
      toast.info(t('cases:extracting_fields', 'Extracting facts and legal question...'));
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);
      
      const session = (await supabase.auth.getSession()).data.session;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const resp = await fetch(`${supabaseUrl}/functions/v1/extract-case-fields`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${session?.access_token ?? supabaseKey}`,
        },
        body: JSON.stringify({ caseId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      const data = await resp.json();
      
      if (!resp.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
      }
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['cases'] });
        queryClient.invalidateQueries({ queryKey: ['case', caseId] });
        toast.success(t('cases:fields_extracted', 'Facts and legal question extracted successfully'));
      } else {
        const msg = typeof data.error === 'string' ? data.error : '';
        const pretty = isNoDataForExtractionMessage(msg) ? t('cases:extraction_no_data') : msg;
        toast.warning(t('cases:extraction_partial', 'Could not extract all fields: {{error}}', { error: pretty || t('cases:extraction_failed') }));
      }
    } catch (error) {
      console.error('Extract case fields error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      const pretty = isNoDataForExtractionMessage(msg) ? t('cases:extraction_no_data') : msg;
      toast.error(pretty || t('cases:extraction_failed', 'Failed to extract case fields'));
    }
  };

  const pendingCount = filesToProcess.length;
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleProcessAll}
          disabled={isProcessing || pendingCount === 0}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('ocr:processing', 'Processing')}...
            </>
          ) : (
            <>
              <ScanText className="mr-2 h-4 w-4" />
              <Sparkles className="mr-1 h-3 w-3" />
              {t('cases:process_ocr_extract', 'OCR + Auto-extract')}
            </>
          )}
        </Button>
        {isProcessing && (
          <Button variant="ghost" size="sm" onClick={handleCancel} className="text-destructive">
            <StopCircle className="mr-1 h-4 w-4" />
            {t('common:cancel', 'Cancel')}
          </Button>
        )}
        {!isProcessing && pendingCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('cases:files_pending_ocr', '{{count}} files pending', { count: pendingCount })}
          </span>
        )}
        {!isProcessing && pendingCount === 0 && files.length > 0 && unsupportedDocFiles.length === 0 && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            {t('cases:all_files_processed', 'All files processed')}
          </span>
        )}
        {unsupportedDocFiles.length > 0 && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {t('cases:doc_not_supported', '.doc files not supported - convert to DOCX')}
          </span>
        )}
      </div>

      {isProcessing && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground truncate">
            {currentFile && `${t('ocr:processing', 'Processing')}: ${currentFile}`}
            {statusMessage && ` \u2014 ${statusMessage}`}
          </p>
        </div>
      )}

      {!isProcessing && results.success + results.failed > 0 && (
        <div className="flex items-center gap-2 text-xs">
          {results.success > 0 && (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              {results.success} {t('common:success', 'success')}
            </span>
          )}
          {results.failed > 0 && (
            <span className="text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {results.failed} {t('common:failed', 'failed')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
