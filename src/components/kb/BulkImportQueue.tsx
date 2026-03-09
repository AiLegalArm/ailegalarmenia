/**
 * BulkImportQueue — displays import queue with per-item stage progress,
 * retry failed, and error report export.
 */

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  CheckCircle,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Download,
  Trash2,
  Square,
  FileText,
  Globe,
  ClipboardPaste,
  FileJson,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Copy,
} from 'lucide-react';
import {
  type QueueItem,
  type ImportStage,
  STAGE_ORDER,
} from '@/hooks/useBulkImport';

// ── Stage labels ─────────────────────────────────────────────────────

const STAGE_LABELS: Record<ImportStage, string> = {
  queued: '\u041e\u0447\u0435\u0440\u0435\u0434\u044c',
  parsed: '\u041f\u0430\u0440\u0441\u0438\u043d\u0433',
  normalized: '\u041d\u043e\u0440\u043c\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f',
  chunked: '\u0427\u0430\u043d\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435',
  jsonl: 'JSONL',
  inserted: '\u0412\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u043e',
  error: '\u041e\u0448\u0438\u0431\u043a\u0430',
};

const SOURCE_ICONS = {
  file: FileText,
  url: Globe,
  text: ClipboardPaste,
  jsonl_record: FileJson,
};

function stageProgress(stage: ImportStage): number {
  if (stage === 'error') return 0;
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0) return 0;
  return Math.round((idx / (STAGE_ORDER.length - 1)) * 100);
}

function stageBadgeVariant(stage: ImportStage): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (stage === 'inserted') return 'default';
  if (stage === 'error') return 'destructive';
  if (stage === 'queued') return 'outline';
  return 'secondary';
}

// ── Component ────────────────────────────────────────────────────────

interface BulkImportQueueProps {
  items: QueueItem[];
  isRunning: boolean;
  completed: number;
  failed: number;
  total: number;
  onRetryFailed: () => void;
  onAbort: () => void;
  onClearCompleted: () => void;
  onDownloadErrors: () => void;
  /** Optional: re-import all items from scratch */
  onReimportAll?: () => void;
}

export const BulkImportQueue = React.forwardRef<HTMLDivElement, BulkImportQueueProps>(function BulkImportQueue({
  items,
  isRunning,
  completed,
  failed,
  total,
  onRetryFailed,
  onAbort,
  onClearCompleted,
  onDownloadErrors,
  onReimportAll,
}, ref) {
  const overallProgress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const processing = items.find(it =>
    it.stage !== 'queued' && it.stage !== 'inserted' && it.stage !== 'error'
  );
  const [errorsExpanded, setErrorsExpanded] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const failedItems = items.filter(it => it.stage === 'error');

  const copyErrorsToClipboard = () => {
    const text = failedItems
      .map(it => `${it.label}\n  \u041e\u0448\u0438\u0431\u043a\u0430: ${it.error || 'Unknown'}\n`)
      .join('\n');
    navigator.clipboard.writeText(text);
  };

  return (
    <div ref={ref} className="space-y-4">
      {/* Overall progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {isRunning ? '\u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430...' : '\u041e\u0447\u0435\u0440\u0435\u0434\u044c \u0438\u043c\u043f\u043e\u0440\u0442\u0430'}
          </span>
          <span className="text-muted-foreground">
            {completed}/{total}
            {failed > 0 && (
              <span className="text-destructive ml-1">({failed} \u043e\u0448.)</span>
            )}
          </span>
        </div>
        <Progress value={overallProgress} className="h-2" />
      </div>

      {/* Stage pipeline for current item */}
      {processing && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-medium truncate">{processing.label}</p>
          <div className="flex gap-1">
            {STAGE_ORDER.map((stage, i) => {
              const currentIdx = STAGE_ORDER.indexOf(processing.stage);
              const isActive = i === currentIdx;
              const isDone = i < currentIdx;
              return (
                <div
                  key={stage}
                  className={`flex-1 h-1.5 rounded-full transition-colors ${
                    isDone
                      ? 'bg-primary'
                      : isActive
                      ? 'bg-primary animate-pulse'
                      : 'bg-muted-foreground/20'
                  }`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            {STAGE_ORDER.map(stage => (
              <span key={stage} className="truncate">{STAGE_LABELS[stage]}</span>
            ))}
          </div>
        </div>
      )}

      {/* Successful items (collapsed) */}
      {completed > 0 && (
        <ScrollArea className="max-h-[25vh]">
          <div className="space-y-1">
            {items.filter(it => it.stage === 'inserted').map(item => {
              const Icon = SOURCE_ICONS[item.source];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1 text-xs" title={item.label}>{item.label}</span>
                  <Badge variant="default" className="text-[10px] shrink-0">
                    <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                    {STAGE_LABELS.inserted}
                  </Badge>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Error detail section — collapsible with full error messages */}
      {failed > 0 && !isRunning && (
        <Collapsible open={errorsExpanded} onOpenChange={setErrorsExpanded}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center gap-2 rounded-t-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-left hover:bg-destructive/15 transition-colors">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-sm font-medium text-destructive flex-1">
                {failed} \u044d\u043b\u0435\u043c\u0435\u043d\u0442(\u043e\u0432) \u0441 \u043e\u0448\u0438\u0431\u043a\u0430\u043c\u0438
              </span>
              {errorsExpanded ? (
                <ChevronDown className="h-4 w-4 text-destructive shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-destructive shrink-0" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border border-t-0 border-destructive/30 rounded-b-lg overflow-hidden">
              <ScrollArea className="max-h-[40vh]">
                <div className="divide-y divide-destructive/10">
                  {failedItems.map(item => {
                    const Icon = SOURCE_ICONS[item.source];
                    const isExpanded = expandedItems.has(item.id);
                    return (
                      <div key={item.id} className="bg-destructive/5">
                        <button
                          onClick={() => toggleItem(item.id)}
                          className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-destructive/10 transition-colors"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-destructive/60 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground break-words leading-snug">
                              {item.label}
                            </p>
                            {!isExpanded && (
                              <p className="text-xs text-destructive/70 mt-0.5 truncate">
                                {item.error || 'Unknown error'}
                              </p>
                            )}
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-1" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-1" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 pl-9">
                            <div className="rounded bg-destructive/10 border border-destructive/20 p-2.5">
                              <p className="text-xs text-destructive font-mono whitespace-pre-wrap break-words leading-relaxed">
                                {item.error || 'Unknown error'}
                              </p>
                              {item.retryCount > 0 && (
                                <p className="text-[10px] text-muted-foreground mt-1.5">
                                  {'\u041f\u043e\u043f\u044b\u0442\u043e\u043a'}: {item.retryCount}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Error section actions */}
              <div className="flex items-center gap-2 px-3 py-2 border-t border-destructive/10 bg-destructive/5">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyErrorsToClipboard}>
                  <Copy className="h-3 w-3 mr-1" />
                  {'\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0432\u0441\u0435'}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDownloadErrors}>
                  <Download className="h-3 w-3 mr-1" />
                  JSON
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Processing items (in-flight, not yet done or error) */}
      {items.filter(it => !['inserted', 'error'].includes(it.stage)).length > 0 && (
        <ScrollArea className="max-h-[20vh]">
          <div className="space-y-1">
            {items.filter(it => !['inserted', 'error'].includes(it.stage)).map(item => {
              const Icon = SOURCE_ICONS[item.source];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded border px-3 py-1.5 text-sm"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1 text-xs" title={item.label}>{item.label}</span>
                  <Badge variant={stageBadgeVariant(item.stage)} className="text-[10px] shrink-0">
                    {item.stage === 'queued' ? null : <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />}
                    {STAGE_LABELS[item.stage]}
                  </Badge>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {isRunning && (
          <Button variant="destructive" size="sm" onClick={onAbort}>
            <Square className="h-3.5 w-3.5 mr-1" />
            {'\u0421\u0442\u043e\u043f'}
          </Button>
        )}
        {!isRunning && failed > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={onRetryFailed}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              {'\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u043e\u0448\u0438\u0431\u043a\u0438'}
            </Button>
            {onReimportAll && (
              <Button variant="outline" size="sm" onClick={onReimportAll}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                {'\u0418\u043c\u043f\u043e\u0440\u0442 \u0437\u0430\u043d\u043e\u0432\u043e'}
              </Button>
            )}
          </>
        )}
        {!isRunning && completed > 0 && (
          <Button variant="ghost" size="sm" onClick={onClearCompleted}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {'\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c'}
          </Button>
        )}
      </div>
    </div>
  );
});