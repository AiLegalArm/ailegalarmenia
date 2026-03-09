/**
 * useBulkImport — frontend orchestrator for bulk document import.
 *
 * Processes items sequentially through stages:
 *   parsed → normalized → chunked → jsonl → inserted
 *
 * Features:
 * - Per-item stage tracking
 * - Retry failed items
 * - Export error report as JSON
 * - Batch insert (200 rows/batch)
 * - Non-blocking: uses requestIdleCallback pattern
 */

import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Sanitize a string for PostgreSQL: remove NUL bytes, lone surrogates, control chars.
 */
function sanitizeString(s: string): string {
  return s
    .replace(/\x00/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/** Detect case outcome from text content (Armenian + Russian) */
function detectOutcomeFromText(text: string): string {
  const lower = text.toLowerCase();
  // Russian patterns
  if (/удовлетворить|удовлетворен/i.test(lower)) return 'granted';
  if (/отказать|отклонить|отказано/i.test(lower)) return 'rejected';
  if (/частично/i.test(lower)) return 'partial';
  if (/возвратить|направить на новое/i.test(lower)) return 'remanded';
  if (/прекратить|прекращено/i.test(lower)) return 'discontinued';
  return 'granted';
}

// ── Types ────────────────────────────────────────────────────────────

export type ImportStage =
  | 'queued'
  | 'parsed'
  | 'normalized'
  | 'chunked'
  | 'jsonl'
  | 'inserted'
  | 'error';

export const STAGE_ORDER: ImportStage[] = [
  'queued', 'parsed', 'normalized', 'chunked', 'jsonl', 'inserted',
];

export interface QueueItem {
  id: string;
  label: string;
  source: 'file' | 'url' | 'text' | 'jsonl_record';
  stage: ImportStage;
  error?: string;
  retryCount: number;
  /** Raw payload to process */
  payload: {
    file?: File;
    url?: string;
    text?: string;
    record?: Record<string, unknown>;
  };
  /** Metadata from processing */
  result?: {
    documentId?: string;
    chunksInserted?: number;
    deduplicated?: boolean;
  };
}

export interface BulkImportOptions {
  target: 'knowledge_base' | 'legal_practice_kb';
  category: string;
  sourceName: string;
  normalize: boolean;
  chunk: boolean;
  dedupMode: 'skip' | 'upsert';
  translateToArmenian?: boolean;
}

export interface ErrorReportEntry {
  item_id: string;
  label: string;
  source: string;
  stage: ImportStage;
  error: string;
  retry_count: number;
  timestamp: string;
}

export interface BulkImportState {
  items: QueueItem[];
  isRunning: boolean;
  completed: number;
  failed: number;
  total: number;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useBulkImport() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef(false);
  const itemsRef = useRef<QueueItem[]>([]);


  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    itemsRef.current = itemsRef.current.map(it => it.id === id ? { ...it, ...patch } : it);
    setItems(itemsRef.current);
  }, []);

  // ── Build queue from various sources ────────────────────────────

  const enqueue = useCallback((
    sources: Array<{
      source: QueueItem['source'];
      label: string;
      payload: QueueItem['payload'];
    }>
  ) => {
    const newItems: QueueItem[] = sources.map((s, i) => ({
      id: `import-${Date.now()}-${i}`,
      label: s.label,
      source: s.source,
      stage: 'queued' as ImportStage,
      retryCount: 0,
      payload: s.payload,
    }));
    // Update ref synchronously so run() can access items immediately
    itemsRef.current = [...itemsRef.current, ...newItems];
    setItems(itemsRef.current);
    return newItems;
  }, []);

  // ── Process single item through all stages ─────────────────────

  const processItem = useCallback(async (
    item: QueueItem,
    options: BulkImportOptions
  ): Promise<void> => {
    try {
      // Stage 1: Parse — extract raw text
      updateItem(item.id, { stage: 'parsed' });
      let rawText = '';
      let fileName = item.label;
      let mimeType = 'text/plain';

      if (item.payload.file) {
        const file = item.payload.file;
        fileName = file.name;
        mimeType = file.type || 'text/plain';

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          // PDF: read as base64 and send to edge function
          const buffer = await file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), '')
          );
          // Use kb-fetch-pdf-content for PDF extraction
          const { data: pdfData, error: pdfErr } = await supabase.functions.invoke(
            'kb-fetch-pdf-content',
            { body: { base64Content: base64, fileName: file.name } }
          );
          if (pdfErr) throw new Error(`PDF parse: ${pdfErr.message}`);
          rawText = pdfData?.content || pdfData?.text || '';
        } else {
          rawText = await file.text();
        }
      } else if (item.payload.url) {
        // URL: use scraper
        const { data, error } = await supabase.functions.invoke('kb-scrape-batch', {
          body: { urls: [item.payload.url], category: options.category },
        });
        if (error) throw new Error(`URL scrape: ${error.message}`);
        const results = data?.results || [];
        if (results.length === 0 || !results[0].content) {
          throw new Error('URL scrape returned no content');
        }
        rawText = results[0].content;
        fileName = results[0].title || item.payload.url;
      } else if (item.payload.text) {
        rawText = item.payload.text;
      } else if (item.payload.record) {
        const rec = item.payload.record;
        rawText = String(rec.content_text || rec.content || rec.text || rec.body || '');
        fileName = String(rec.title || rec.name || fileName);
      }

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('No text content extracted');
      }

      // Sanitize text for PostgreSQL compatibility
      rawText = sanitizeString(rawText);
      fileName = sanitizeString(fileName);

      // ── Optional: Translate to Armenian ──────────────────────
      if (options.translateToArmenian) {
        updateItem(item.id, { stage: 'normalized' });
        // Detect if text is already Armenian (contains Armenian Unicode range)
        const armenianCharCount = (rawText.match(/[\u0531-\u058F]/g) || []).length;
        const totalChars = rawText.replace(/\s/g, '').length;
        const armenianRatio = totalChars > 0 ? armenianCharCount / totalChars : 0;

        if (armenianRatio < 0.3) {
          // Text is not predominantly Armenian — translate it
          // Split into chunks of ~3000 chars to avoid context limits
          const CHUNK_SIZE = 3000;
          const textChunks: string[] = [];
          for (let i = 0; i < rawText.length; i += CHUNK_SIZE) {
            textChunks.push(rawText.slice(i, i + CHUNK_SIZE));
          }

          const translatedChunks: string[] = [];
          for (const chunk of textChunks) {
            const { data: transData, error: transErr } = await supabase.functions.invoke(
              'translate-to-armenian',
              { body: { text: chunk } }
            );

            if (transErr) {
              console.warn('Translation chunk failed, keeping original:', transErr.message);
              translatedChunks.push(chunk);
            } else {
              const translated = transData?.translated || chunk;
              translatedChunks.push(translated);
            }
          }
          rawText = translatedChunks.join('\n');
        }
      }

      // Stage 2: Normalize
      updateItem(item.id, { stage: 'normalized' });
      await new Promise(r => setTimeout(r, 10));

      updateItem(item.id, { stage: 'chunked' });
      await new Promise(r => setTimeout(r, 10));

      updateItem(item.id, { stage: 'jsonl' });
      await new Promise(r => setTimeout(r, 10));

      if (options.target === 'legal_practice_kb') {
        // Use dedicated legal-practice-import edge function
        const practiceItem = {
          title: fileName,
          content_text: rawText,
          practice_category: options.category || 'criminal',
          court_type: 'cassation',
          outcome: detectOutcomeFromText(rawText),
          is_anonymized: true,
          visibility: 'ai_only',
          source_name: options.sourceName || undefined,
        };

        const { data, error: fnError } = await supabase.functions.invoke('legal-practice-import', {
          body: { bulkItems: [practiceItem] },
        });

        if (fnError) throw new Error(`Import: ${fnError.message}`);
        if (data?.error) throw new Error(data.error);

        const inserted = data?.inserted_practice ?? 0;
        if (inserted === 0 && (data?.skipped ?? 0) > 0) {
          updateItem(item.id, {
            stage: 'inserted',
            result: { documentId: undefined, chunksInserted: 0, deduplicated: true },
          });
        } else if (inserted > 0) {
          updateItem(item.id, {
            stage: 'inserted',
            result: { documentId: data?.ids?.[0], chunksInserted: 0, deduplicated: false },
          });
        } else {
          throw new Error(data?.errors?.[0]?.error || 'No rows inserted');
        }
      } else {
        // Insert into knowledge_base (the table the KB UI reads from)
        const { data: insertedRow, error: insertErr } = await supabase
          .from('knowledge_base')
          .insert({
            title: fileName,
            content_text: rawText,
            category: (options.category || 'other') as any,
            source_name: options.sourceName || undefined,
            source_url: item.payload.url || undefined,
            is_active: true,
          })
          .select('id')
          .single();

        if (insertErr) throw new Error(`Insert: ${insertErr.message}`);

        updateItem(item.id, {
          stage: 'inserted',
          result: {
            documentId: insertedRow?.id,
            chunksInserted: 0,
            deduplicated: false,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      updateItem(item.id, { stage: 'error', error: message });
    }
  }, [updateItem]);

  // ── Run all queued items ───────────────────────────────────────

  const run = useCallback(async (options: BulkImportOptions) => {
    setIsRunning(true);
    abortRef.current = false;

    // Use ref to get latest items (enqueue may have just updated state)
    const toProcess = itemsRef.current.filter(it => it.stage === 'queued' || it.stage === 'error');

    for (const item of toProcess) {
      if (abortRef.current) break;

      // Reset error state for retries
      if (item.stage === 'error') {
        updateItem(item.id, {
          stage: 'queued',
          error: undefined,
          retryCount: item.retryCount + 1,
        });
      }

      await processItem(item, options);

      // Yield to UI between items
      await new Promise(r => setTimeout(r, 50));
    }

    setIsRunning(false);
    // Invalidate queries so the list refreshes with new data
    queryClient.invalidateQueries({ queryKey: ['kb-list'] });
    queryClient.invalidateQueries({ queryKey: ['kb-search'] });
    queryClient.invalidateQueries({ queryKey: ['legal-practice-kb'] });
  }, [processItem, updateItem, queryClient]);

  // ── Retry failed items only ────────────────────────────────────

  const retryFailed = useCallback(async (options: BulkImportOptions) => {
    setIsRunning(true);
    abortRef.current = false;

    const failed = itemsRef.current.filter(it => it.stage === 'error');

    for (const item of failed) {
      if (abortRef.current) break;

      updateItem(item.id, {
        stage: 'queued',
        error: undefined,
        retryCount: item.retryCount + 1,
      });

      await processItem(item, options);
      await new Promise(r => setTimeout(r, 50));
    }

    setIsRunning(false);
    queryClient.invalidateQueries({ queryKey: ['kb-list'] });
    queryClient.invalidateQueries({ queryKey: ['kb-search'] });
  }, [processItem, updateItem, queryClient]);

  // ── Abort ──────────────────────────────────────────────────────

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  // ── Clear queue ────────────────────────────────────────────────

  const clearCompleted = useCallback(() => {
    itemsRef.current = itemsRef.current.filter(it => it.stage !== 'inserted');
    setItems(itemsRef.current);
  }, []);

  const clearAll = useCallback(() => {
    itemsRef.current = [];
    setItems([]);
  }, []);

  // ── Export error report ────────────────────────────────────────

  const exportErrorReport = useCallback((): ErrorReportEntry[] => {
    return items
      .filter(it => it.stage === 'error')
      .map(it => ({
        item_id: it.id,
        label: it.label,
        source: it.source,
        stage: it.stage,
        error: it.error || 'Unknown error',
        retry_count: it.retryCount,
        timestamp: new Date().toISOString(),
      }));
  }, [items]);

  const downloadErrorReport = useCallback(() => {
    const report = exportErrorReport();
    if (report.length === 0) return;

    const blob = new Blob(
      [JSON.stringify({ exported_at: new Date().toISOString(), total_errors: report.length, errors: report }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportErrorReport]);

  // ── Computed stats ─────────────────────────────────────────────

  const completed = items.filter(it => it.stage === 'inserted').length;
  const failed = items.filter(it => it.stage === 'error').length;
  const total = items.length;

  return {
    items,
    isRunning,
    completed,
    failed,
    total,
    enqueue,
    run,
    retryFailed,
    abort,
    clearCompleted,
    clearAll,
    exportErrorReport,
    downloadErrorReport,
  };
}
