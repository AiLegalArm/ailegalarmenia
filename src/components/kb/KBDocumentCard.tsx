import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MoreVertical, 
  Eye, 
  Edit, 
  Trash2,
  Calendar,
  FileText,
  ExternalLink,
  Maximize2,
  Minimize2,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import type { Database } from '@/integrations/supabase/types';
import { extractRelevantSnippets, highlightTerms } from '@/lib/snippet-extractor';

type KnowledgeBase = Database['public']['Tables']['knowledge_base']['Row'];
type KbCategory = Database['public']['Enums']['kb_category'];

// Partial type that works for both full documents and search results
type KBDocumentType = {
  id: string;
  title: string;
  content_text: string;
  category: KbCategory | string;
  source_name?: string | null;
  version_date?: string | null;
  source_url?: string | null;
  article_number?: string | null;
  chunks?: Array<{
    doc_id: string;
    chunk_index: number;
    chunk_type: string;
    label: string | null;
    char_start: number;
    excerpt: string;
    full_text: string | null;
    score: number;
  }>;
};

interface KBDocumentCardProps {
  document: KBDocumentType;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  isAdmin?: boolean;
  rank?: number;
  searchQuery?: string;
}

const categoryColors: Partial<Record<KbCategory, string>> = {
  constitution: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  civil_code: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  criminal_code: 'bg-red-500/10 text-red-700 dark:text-red-400',
  labor_code: 'bg-green-500/10 text-green-700 dark:text-green-400',
  family_code: 'bg-pink-500/10 text-pink-700 dark:text-pink-400',
  administrative_code: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  tax_code: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  court_practice: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  legal_commentary: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  other: 'bg-gray-500/10 text-gray-700 dark:text-gray-400',
  criminal_procedure_code: 'bg-red-400/10 text-red-600 dark:text-red-300',
  civil_procedure_code: 'bg-blue-400/10 text-blue-600 dark:text-blue-300',
  administrative_procedure_code: 'bg-purple-400/10 text-purple-600 dark:text-purple-300',
  administrative_violations_code: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  land_code: 'bg-lime-500/10 text-lime-700 dark:text-lime-400',
  forest_code: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  water_code: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  urban_planning_code: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
  electoral_code: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  state_duty_law: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  citizenship_law: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
  public_service_law: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400',
  human_rights_law: 'bg-amber-600/10 text-amber-800 dark:text-amber-300',
  anti_corruption_body_law: 'bg-red-600/10 text-red-800 dark:text-red-300',
  corruption_prevention_law: 'bg-orange-600/10 text-orange-800 dark:text-orange-300',
  mass_media_law: 'bg-cyan-600/10 text-cyan-800 dark:text-cyan-300',
  education_law: 'bg-blue-600/10 text-blue-800 dark:text-blue-300',
  healthcare_law: 'bg-green-600/10 text-green-800 dark:text-green-300',
  echr: 'bg-indigo-600/10 text-indigo-800 dark:text-indigo-300',
  eaeu_customs_code: 'bg-stone-500/10 text-stone-700 dark:text-stone-400',
};

/** Inline expandable preview for documents without chunks */
const FallbackContentPreview = React.forwardRef<HTMLDivElement, {
  text: string;
  searchQuery?: string;
  collapseLabel: string;
  expandLabel: string;
}>(function FallbackContentPreview({
  text,
  searchQuery,
  collapseLabel,
  expandLabel,
}, ref) {
  const [expanded, setExpanded] = useState(false);
  const previewLen = 300;
  const isLong = text.length > previewLen;
  const displayText = expanded ? text : text.substring(0, previewLen) + (isLong ? '...' : '');

  return (
    <div ref={ref} className="mb-3 space-y-1">
      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
        {searchQuery
          ? highlightTerms(displayText, searchQuery).map((seg, i) =>
              seg.highlight ? (
                <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{seg.text}</mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )
          : displayText}
      </p>
      {isLong && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-primary"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <><Minimize2 className="mr-1 h-3 w-3" />{collapseLabel}</>
          ) : (
            <><Maximize2 className="mr-1 h-3 w-3" />{expandLabel}</>
          )}
        </Button>
      )}
    </div>
  );
});

const getCategoryColor = (category: KbCategory): string => {
  return categoryColors[category] || 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
};

export function KBDocumentCard({ 
  document, 
  onView, 
  onEdit, 
  onDelete, 
  isAdmin,
  rank,
  searchQuery,
}: KBDocumentCardProps) {
  const { t } = useTranslation('kb');

  const [expandedChunks, setExpandedChunks] = useState<Map<number, string>>(new Map());
  const [loadingChunks, setLoadingChunks] = useState<Set<number>>(new Set());

  // Use server-returned chunks if available, otherwise fallback to client-side extraction
  const serverChunks = document.chunks || [];
  const clientSnippets = serverChunks.length === 0 && searchQuery
    ? extractRelevantSnippets(document.content_text, searchQuery, 3, 200)
    : [];

  const handleExpandChunk = async (chunkIndex: number) => {
    if (expandedChunks.has(chunkIndex)) {
      setExpandedChunks(prev => { const m = new Map(prev); m.delete(chunkIndex); return m; });
      return;
    }
    setLoadingChunks(prev => new Set(prev).add(chunkIndex));
    try {
      const { data } = await supabase.rpc('get_kb_chunk_full', {
        p_kb_id: document.id,
        p_chunk_index: chunkIndex,
      });
      if (data) {
        const row = Array.isArray(data) ? data[0] : data;
        const text = typeof row === 'object' && row !== null && 'chunk_text' in row
          ? String((row as Record<string, unknown>).chunk_text)
          : String(row);
        setExpandedChunks(prev => new Map(prev).set(chunkIndex, text));
      }
    } finally {
      setLoadingChunks(prev => { const s = new Set(prev); s.delete(chunkIndex); return s; });
    }
  };

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex-1 space-y-1 pr-2">
          <CardTitle className="text-sm sm:text-base font-semibold leading-snug break-words whitespace-normal">
            {document.title}
          </CardTitle>
          {document.article_number && (
            <p className="text-xs sm:text-sm font-medium text-primary">
              {t('article_number')}: {document.article_number}
            </p>
          )}
          {document.source_name && (
            <p className="text-xs text-muted-foreground truncate">
              {document.source_name}
            </p>
          )}
        </div>
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onView && (
                <DropdownMenuItem onClick={() => onView(document.id)}>
                  <Eye className="mr-2 h-4 w-4" />
                  {t('common:view', 'View')}
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(document.id)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t('edit_document')}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem 
                  onClick={() => onDelete(document.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('delete_document')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent>
        {serverChunks.length > 0 ? (
          <div className="mb-3 space-y-2">
            {serverChunks.map((chunk, idx) => {
              const hasFullText = chunk.chunk_type === 'article' && !!chunk.full_text;
              const isExpanded = expandedChunks.has(chunk.chunk_index);
              const isLoading = loadingChunks.has(chunk.chunk_index);

              let displayText: string;
              let showFull: boolean;
              if (isExpanded) {
                displayText = expandedChunks.get(chunk.chunk_index)!;
                showFull = true;
              } else {
                // Default: always show excerpt first (collapsed)
                displayText = chunk.excerpt;
                showFull = false;
              }

              return (
                <div
                  key={idx}
                  className="rounded border-l-2 border-primary/40 bg-muted/40 px-2.5 py-1.5 text-xs leading-relaxed text-foreground/80 overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-1 min-w-0">
                    <div className="flex-1">
                      {chunk.label && (
                        <span className="font-semibold text-primary text-[10px] block mb-0.5">
                          {chunk.label}
                        </span>
                      )}
                      <span className={showFull ? 'whitespace-pre-wrap break-words overflow-hidden' : 'break-words'}>
                        {searchQuery && !showFull
                          ? highlightTerms(displayText, searchQuery).map((seg, i) =>
                              seg.highlight ? (
                                <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{seg.text}</mark>
                              ) : (
                                <span key={i}>{seg.text}</span>
                              )
                            )
                          : displayText}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 mt-0.5"
                      onClick={() => {
                        if (showFull) {
                          // Collapse back to excerpt
                          setExpandedChunks(prev => { const m = new Map(prev); m.delete(chunk.chunk_index); return m; });
                        } else if (hasFullText) {
                          // Expand using inline full_text
                          setExpandedChunks(prev => new Map(prev).set(chunk.chunk_index, chunk.full_text!));
                        } else {
                          // Expand via RPC
                          handleExpandChunk(chunk.chunk_index);
                        }
                      }}
                      title={showFull ? t('collapse') : t('show_full_article')}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : showFull ? (
                        <Minimize2 className="h-3 w-3" />
                      ) : (
                        <Maximize2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : clientSnippets.length > 0 ? (
          <div className="mb-3 space-y-2">
            {clientSnippets.map((snippet, idx) => (
              <div
                key={idx}
                className="rounded border-l-2 border-primary/40 bg-muted/40 px-2.5 py-1.5 text-xs leading-relaxed text-foreground/80"
              >
                {highlightTerms(snippet.text, searchQuery!).map((seg, i) =>
                  seg.highlight ? (
                    <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  )
                )}
              </div>
            ))}
          </div>
        ) : document.content_text ? (
          <FallbackContentPreview
            text={document.content_text}
            searchQuery={searchQuery}
            collapseLabel={t('collapse', 'Collapse')}
            expandLabel={t('show_full_article', 'Show full')}
          />
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">
            {t('no_chunks_found', '\u0556\u0580\u0561\u0563\u0574\u0565\u0576\u057F\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C')}
          </p>
        )}
        
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={getCategoryColor(document.category as KbCategory)}>
            {t(`category_${document.category}`)}
          </Badge>
          {rank !== undefined && rank !== null && (() => {
            const n = typeof rank === 'number' ? rank : Number(rank);
            if (!Number.isFinite(n) || n <= 0) return null;
            return (
              <Badge variant="outline" className="text-xs">
                {t('relevance')}: {n}%
              </Badge>
            );
          })()}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          {document.source_name && (
            <div className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              <span className="truncate max-w-[120px]">{document.source_name}</span>
            </div>
          )}
          {document.version_date && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(document.version_date), 'dd.MM.yyyy')}</span>
            </div>
          )}
          {document.source_url && (
            <a 
              href={document.source_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t('source')}
            </a>
          )}
        </div>

        {!isAdmin && onView && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="mt-3 w-full"
            onClick={() => onView(document.id)}
          >
            <Eye className="mr-2 h-4 w-4" />
            {t('common:view', 'View')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
