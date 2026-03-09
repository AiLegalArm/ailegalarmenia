import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { appendReferenceBlock, clearReferences, useReferencesText } from "@/lib/references-store";
import { useTranslation } from "react-i18next";
import { Search, FileText, ChevronDown, ChevronRight, Loader2, Scale, AlertTriangle, BookOpen, Gavel, Maximize2, Minimize2, Copy, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLegalPracticeKB, type KBDocument, type PracticeCategory } from "@/hooks/useLegalPracticeKB";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { highlightTerms } from "@/lib/snippet-extractor";

const CATEGORY_LABELS: Record<PracticeCategory, string> = {
  criminal: "\u0554\u0580\u0565\u0561\u056F\u0561\u0576",
  civil: "\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576",
  administrative: "\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576",
  echr: "\u0544\u053B\u0535\u0534",
  constitutional: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
  bankruptcy: "\u054D\u0576\u0561\u0576\u056F\u0561\u0575\u056B\u0576",
};

const COURT_LABELS: Record<string, string> = {
  first_instance: "\u0531\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576",
  appeal: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579",
  cassation: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F",
  constitutional: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576",
  echr: "\u0544\u053B\u0535\u0534",
};

const OUTCOME_LABELS: Record<string, string> = {
  granted: "\u0532\u0561\u057E\u0561\u0580\u0561\u0580\u057E\u0565\u056C \u0567",
  rejected: "\u0544\u0565\u0580\u056A\u057E\u0565\u056C \u0567",
  partial: "\u0544\u0561\u057D\u0576\u0561\u056F\u056B",
  remanded: "\u054E\u0565\u0580\u0561\u0564\u0561\u0580\u0571\u057E\u0565\u056C",
  discontinued: "\u053F\u0561\u0580\u0573\u057E\u0565\u056C \u0567",
};

function renderValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.map(renderValue).filter(Boolean).join(", ");
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    for (const key of ["text", "title", "name", "value", "description"]) {
      if (typeof obj[key] === "string") return obj[key] as string;
    }
    const parts = Object.entries(obj)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => {
        const rendered = renderValue(v);
        return rendered ? `${k}: ${rendered}` : "";
      })
      .filter(Boolean);
    return parts.join("; ");
  }
  return String(val);
}

/**
 * Safely clean JSON artifacts from text that might contain raw JSON data.
 * Only attempts JSON.parse when text is short (<5000 chars), starts with '{',
 * and contains a known content key — avoiding false positives on legal text
 * that may contain braces (e.g. "{...}" in Armenian legal citations).
 */
function cleanJsonArtifacts(text: string): string {
  if (!text) return "";

  const trimmed = text.trimStart();
  const shouldTryParse =
    trimmed.length < 5000 &&
    trimmed.startsWith("{") &&
    trimmed.endsWith("}") &&
    /"(?:text|title|value|name|description)"\s*:/.test(trimmed);

  if (shouldTryParse) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        return renderValue(parsed);
      }
    } catch { /* not valid JSON, fall through */ }
  }

  // Minimal unescape only
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, "\t");
}

// ================================================================
// Types
// ================================================================

interface KBChunkResult {
  doc_id: string;
  chunk_index: number;
  chunk_type: string;
  label: string | null;
  char_start: number;
  excerpt: string;
  full_text: string | null;
  score: number;
}

interface KBSearchResult {
  id: string;
  title: string;
  category: string;
  source_name: string | null;
  article_number: string | null;
  source_url: string | null;
  max_score: number;
  relevancePct: number;
  chunks: KBChunkResult[];
}

/** Unified merged item for cross-source ranking */
export interface MergedSearchItem {
  source: "kb" | "practice";
  id: string;
  title: string;
  category: string;
  normalizedScore: number;
  preview: string;
  meta: Record<string, string>;
  /** Best chunk index for insertion (if available) */
  chunkIndex?: number;
  /** Pre-built text for insertion (no extra network call) */
  insertText?: string;
}

type ViewFilter = "all" | "kb" | "practice";

// ================================================================
// Score normalization & noise control
// ================================================================

/** Items with normalizedScore below this are hidden (unless in top MIN_VISIBLE) */
const MERGED_SCORE_THRESHOLD = 0.15;
/** Always show at least this many items regardless of score */
const MERGED_MIN_VISIBLE = 10;
/** Page size for "show more" */
const MERGED_PAGE_SIZE = 30;

/**
 * Normalize scores within a set to 0..1 range using max-normalization.
 * If all scores are 0 or empty, returns 0 for all.
 */
function normalizeScores(scores: number[]): number[] {
  const max = Math.max(...scores, 0);
  if (max === 0) return scores.map(() => 0);
  return scores.map((s) => s / max);
}

// ================================================================
// Main Panel
// ================================================================

interface KBSearchPanelProps {
  caseId?: string;
  onInsertReference?: (docId: string, chunkIndex: number, text: string) => void;
  /** @deprecated Use the centralized references store instead */
  onReferencesChange?: (referencesText: string) => void;
}

export function KBSearchPanel({ caseId, onInsertReference, onReferencesChange }: KBSearchPanelProps) {
  const storeKey = caseId || "_global";
  const storeReferencesText = useReferencesText(storeKey);
  const { t } = useTranslation("kb");
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [mergedVisibleCount, setMergedVisibleCount] = useState(MERGED_PAGE_SIZE);

  // Internal references collector (used when no external consumer)
  const [collectedRefs, setCollectedRefs] = useState<string[]>([]);
  const [refsOpen, setRefsOpen] = useState(false);
  const refsTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Practice search state
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [loadedChunkIndexes, setLoadedChunkIndexes] = useState<Map<string, number[]>>(new Map());

  const {
    documents,
    isSearching,
    searchError,
    isLoadingChunk,
    loadChunk,
    getCachedChunk,
    searchKB: searchPractice,
    clearSearch: clearPractice,
    setDocuments: setPracticeDocuments,
  } = useLegalPracticeKB();

  // KB legislation search state
  const [kbResults, setKbResults] = useState<KBSearchResult[]>([]);
  const [isSearchingKB, setIsSearchingKB] = useState(false);
  const [expandedKBDocs, setExpandedKBDocs] = useState<Set<string>>(new Set());

  // ─── Merged results ────────────────────────────────────────────────
  const mergedResults = useMemo<MergedSearchItem[]>(() => {
    const items: MergedSearchItem[] = [];

    // Normalize KB scores
    const kbScores = kbResults.map((r) => Number(r.max_score) || 0);
    const kbNorm = normalizeScores(kbScores);

    for (let i = 0; i < kbResults.length; i++) {
      const r = kbResults[i];
      const bestChunk = r.chunks.length > 0 ? r.chunks[0] : null;
      const preview = bestChunk ? (bestChunk.excerpt || "").substring(0, 300) : "";
      const insertSnippet = bestChunk
        ? (bestChunk.label ? bestChunk.label + "\n" : "") + bestChunk.excerpt
        : "";
      items.push({
        source: "kb",
        id: r.id,
        title: r.title,
        category: r.category,
        normalizedScore: kbNorm[i],
        preview,
        meta: {
          ...(r.source_name ? { source: r.source_name } : {}),
          ...(r.article_number ? { article: r.article_number } : {}),
        },
        chunkIndex: bestChunk?.chunk_index,
        insertText: insertSnippet || undefined,
      });
    }

    // Normalize Practice scores using real max_score from RPC
    const practiceScores = documents.map((d) => Number(d.max_score) || 0);
    const allZero = practiceScores.every((s) => s === 0);
    const practiceNorm = allZero
      ? documents.map((_, idx) => documents.length > 1 ? 1 - idx / documents.length : 1)
      : normalizeScores(practiceScores);

    for (let i = 0; i < documents.length; i++) {
      const d = documents[i];
      const hasTopChunk = d.top_chunks.length > 0;
      const preview = d.legal_reasoning_summary
        ? d.legal_reasoning_summary.substring(0, 300)
        : hasTopChunk
          ? d.top_chunks[0].text.substring(0, 300)
          : "";
      const insertSnippet = hasTopChunk
        ? d.top_chunks[0].text
        : d.legal_reasoning_summary || "";
      items.push({
        source: "practice",
        id: d.id,
        title: d.title,
        category: d.practice_category,
        normalizedScore: practiceNorm[i],
        preview,
        meta: {
          court: COURT_LABELS[d.court_type] || d.court_type,
          outcome: OUTCOME_LABELS[d.outcome] || d.outcome,
        },
        chunkIndex: hasTopChunk ? d.top_chunks[0].chunkIndex : undefined,
        insertText: insertSnippet || undefined,
      });
    }

    // Sort by normalizedScore descending, stable
    items.sort((a, b) => b.normalizedScore - a.normalizedScore);
    return items;
  }, [kbResults, documents]);

  // ─── Search handlers ───────────────────────────────────────────────
  const searchKBLegislation = useCallback(async (searchQuery: string) => {
    setIsSearchingKB(true);
    try {
      const trimmed = searchQuery.trim();
      if (trimmed.length < 2) { setIsSearchingKB(false); return; }

      const { data, error } = await supabase.rpc("search_kb_chunks", {
        p_query: trimmed,
        p_category: null,
        p_limit_chunks: 50,
        p_limit_docs: 10,
        p_chunks_per_doc: 3,
      });

      if (error) throw error;

      const parsed = data as unknown as { documents: Array<{
        id: string; title: string; category: string;
        source_name: string | null; article_number: string | null;
        source_url: string | null; max_score: number;
      }>; chunks: KBChunkResult[] };

      const chunksByDoc = new Map<string, KBChunkResult[]>();
      for (const chunk of parsed.chunks || []) {
        const arr = chunksByDoc.get(chunk.doc_id) || [];
        arr.push(chunk);
        chunksByDoc.set(chunk.doc_id, arr);
      }

      const docs = parsed.documents || [];
      const globalMax = docs.reduce((mx, d) => Math.max(mx, Number(d.max_score) || 0), 0);

      const results: KBSearchResult[] = docs.map((doc) => {
        const raw = Number(doc.max_score) || 0;
        const relevancePct = globalMax > 0 ? Math.round((raw / globalMax) * 100) : 0;
        return { ...doc, relevancePct, chunks: chunksByDoc.get(doc.id) || [] };
      });

      setKbResults(results);
    } catch (err) {
      console.error("KB chunk search error:", err);
      setKbResults([]);
    } finally {
      setIsSearchingKB(false);
    }
  }, []);

  // ─── Unified search via Edge function (with fallback) ────────────
  const searchUnified = useCallback(async (searchQuery: string, cat: string | null) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) return false;

    try {
      const { data, error } = await supabase.functions.invoke("kb-unified-search", {
        body: {
          query: trimmed,
          category: cat,
          kbCategory: null,
        },
      });

      if (error) throw error;
      if (!data || !data.merged) throw new Error("Invalid response");

      // ── Hydrate KB state from unified response ──
      const kbDocs = data.kb?.documents || [];
      const kbChunksRaw = data.kb?.chunks || [];
      const chunksByDoc = new Map<string, KBChunkResult[]>();
      for (const chunk of kbChunksRaw) {
        const arr = chunksByDoc.get(chunk.doc_id) || [];
        arr.push(chunk);
        chunksByDoc.set(chunk.doc_id, arr);
      }
      const globalMax = kbDocs.reduce((mx: number, d: { max_score: number }) => Math.max(mx, Number(d.max_score) || 0), 0);
      const parsedKb: KBSearchResult[] = kbDocs.map((doc: { id: string; title: string; category: string; source_name: string | null; article_number: string | null; source_url: string | null; max_score: number }) => {
        const raw = Number(doc.max_score) || 0;
        const relevancePct = globalMax > 0 ? Math.round((raw / globalMax) * 100) : 0;
        return { ...doc, relevancePct, chunks: chunksByDoc.get(doc.id) || [] };
      });
      setKbResults(parsedKb);

      // ── Hydrate Practice state from unified response (Model 1) ──
      const practiceItems: KBDocument[] = (data.practice || []).map((p: {
        id: string; title: string; practice_category: string; court_type: string;
        outcome: string; decision_date: string | null; source_url: string | null;
        max_score: number; top_chunks: Array<{ chunkIndex: number; text: string }>;
        returnedChunks: number; totalChunks: number; preview: string;
      }) => ({
        id: p.id,
        title: p.title,
        practice_category: p.practice_category as PracticeCategory,
        court_type: p.court_type,
        outcome: p.outcome,
        applied_articles: [],
        key_violations: [],
        legal_reasoning_summary: p.top_chunks?.[0]?.text ?? null,
        decision_map: null,
        key_paragraphs: [],
        top_chunks: p.top_chunks || [],
        totalChunks: p.totalChunks || 0,
        returnedChunks: p.returnedChunks || 0,
        max_score: Number(p.max_score) || 0,
      }));
      setPracticeDocuments(practiceItems);

      return true;
    } catch (e) {
      console.warn("Unified search failed, falling back to parallel RPCs", e);
      return false;
    }
  }, [setPracticeDocuments]);

  // ─── Load recent practice docs on mount (no query needed) ────────
  useEffect(() => {
    let cancelled = false;
    const loadRecent = async () => {
      try {
        const { data, error } = await supabase
          .from("legal_practice_kb")
          .select("id, title, practice_category, court_type, outcome, legal_reasoning_summary, key_violations, applied_articles, decision_map, key_paragraphs, content_chunks, is_active")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(50);
        if (cancelled || error || !data) return;
        const docs = data.map((row) => ({
          id: row.id,
          title: row.title,
          practice_category: row.practice_category as import("@/hooks/useLegalPracticeKB").PracticeCategory,
          court_type: row.court_type as import("@/hooks/useLegalPracticeKB").CourtType,
          outcome: row.outcome as import("@/hooks/useLegalPracticeKB").Outcome,
          applied_articles: [],
          key_violations: (row.key_violations as string[]) || [],
          legal_reasoning_summary: (row.legal_reasoning_summary as string) || null,
          decision_map: null,
          key_paragraphs: [],
          top_chunks: [],
          totalChunks: Array.isArray(row.content_chunks) ? (row.content_chunks as string[]).length : 0,
          max_score: 0,
        }));
        setPracticeDocuments(docs);
      } catch { /* silent */ }
    };
    loadRecent();
    return () => { cancelled = true; };
  }, [setPracticeDocuments]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setMergedVisibleCount(MERGED_PAGE_SIZE);

    // Try unified endpoint first (single request for both KB + Practice)
    const unifiedOk = await searchUnified(searchQuery, null);

    // If unified failed, fall back to separate parallel searches
    if (!unifiedOk) {
      await Promise.all([
        searchKBLegislation(searchQuery),
        searchPractice(searchQuery, null),
      ]);
    }
  }, [searchUnified, searchKBLegislation, searchPractice]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      clearPractice();
      setKbResults([]);
      clearReferences(storeKey);
      setCollectedRefs([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      runSearch(value);
    }, 500);
  };

  const toggleDocExpanded = (docId: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      next.has(docId) ? next.delete(docId) : next.add(docId);
      return next;
    });
  };

  const toggleKBDocExpanded = (docId: string) => {
    setExpandedKBDocs((prev) => {
      const next = new Set(prev);
      next.has(docId) ? next.delete(docId) : next.add(docId);
      return next;
    });
  };

  const handleLoadNextChunk = async (doc: KBDocument) => {
    const currentLoaded = loadedChunkIndexes.get(doc.id) || [];
    const lastLoaded = currentLoaded.length > 0 ? Math.max(...currentLoaded) : -1;
    const nextIndex = lastLoaded + 1;
    if (nextIndex >= doc.totalChunks) return;

    const chunk = await loadChunk(doc.id, nextIndex);
    if (chunk) {
      setLoadedChunkIndexes((prev) => {
        const next = new Map(prev);
        next.set(doc.id, [...(next.get(doc.id) || []), nextIndex]);
        return next;
      });
    }
  };

  const handleInsertReference = useCallback((docId: string, chunkIndex: number, text: string) => {
    if (onInsertReference) {
      onInsertReference(docId, chunkIndex, text);
    } else {
      // Use centralized store
      appendReferenceBlock(storeKey, text);
      // Also notify legacy callback if provided
      onReferencesChange?.(storeReferencesText ? storeReferencesText + "\n\n---\n\n" + text : text);
      setCollectedRefs((prev) => [...prev, text]);
      setRefsOpen(true);
      setTimeout(() => refsTextareaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    }
  }, [onInsertReference, onReferencesChange, storeReferencesText]);

  const clearAll = () => {
    clearPractice();
    setKbResults([]);
    clearReferences(storeKey);
    setCollectedRefs([]);
  };

  const hasAnyResults = documents.length > 0 || kbResults.length > 0;
  const isLoading = isSearching || isSearchingKB;

  // ─── Scroll to source card on merged item click ────────────────────
  const handleMergedItemClick = (item: MergedSearchItem) => {
    if (item.source === "kb") {
      setViewFilter("kb");
      setExpandedKBDocs((prev) => new Set(prev).add(item.id));
    } else {
      setViewFilter("practice");
      setExpandedDocs((prev) => new Set(prev).add(item.id));
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          {t("unified_search_title", "\u0548\u0580\u0578\u0576\u0578\u0582\u0574")}
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {t("disclaimer", "Справочная информация. Не является юридической консультацией.")}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Search controls — single input only */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search_kb", "Поиск по законодательству и судебной практике...")}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="pl-8 pr-8 h-9"
          />
          {isLoading && (
            <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* View filter tabs */}
        {(hasAnyResults || documents.length > 0) && (
          <Tabs value={viewFilter} onValueChange={(v) => setViewFilter(v as ViewFilter)} className="w-full">
            <TabsList className="w-full h-8">
              <TabsTrigger value="all" className="flex-1 text-xs h-7">
                {t("filter_all", "\u0532\u0578\u056C\u0578\u0580\u0568")} ({mergedResults.length})
              </TabsTrigger>
              <TabsTrigger value="kb" className="flex-1 text-xs h-7">
                <BookOpen className="h-3 w-3 mr-1" />
                {t("filter_kb", "\u0555\u0580\u0565\u0576\u057D\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576")} ({kbResults.length})
              </TabsTrigger>
              <TabsTrigger value="practice" className="flex-1 text-xs h-7">
                <Gavel className="h-3 w-3 mr-1" />
                {t("filter_practice", "\u054A\u0580\u0561\u056F\u057F\u056B\u056F\u0561")} ({documents.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {searchError && (
          <Alert variant="destructive" className="py-2 mb-2">
            <AlertDescription className="text-xs">{searchError}</AlertDescription>
          </Alert>
        )}

        <ScrollArea className="flex-1">
          <div className="space-y-3">
            {/* ─── ALL: merged view ─── */}
            {viewFilter === "all" && mergedResults.length > 0 && (() => {
              // Apply noise threshold: keep items above threshold OR in top MIN_VISIBLE
              const filtered = mergedResults.filter(
                (item, idx) => idx < MERGED_MIN_VISIBLE || item.normalizedScore >= MERGED_SCORE_THRESHOLD
              );
              const visible = filtered.slice(0, mergedVisibleCount);
              const hiddenCount = mergedResults.length - filtered.length;
              const hasMore = mergedVisibleCount < filtered.length;

              return (
                <div className="space-y-1.5">
                  {visible.map((item) => (
                    <MergedResultCard
                      key={`${item.source}-${item.id}`}
                      item={item}
                      searchQuery={query}
                      onClick={() => handleMergedItemClick(item)}
                      onInsert={onInsertReference && item.insertText ? () => {
                        const MAX_INSERT = 800;
                        const sourceLabel = item.source === "kb" ? t("source_kb", "\u0555\u0580\u0565\u0576\u057D\u0564\u0580.") : t("source_practice", "\u054A\u0580\u0561\u056F\u057F.");
                        const metaParts = [sourceLabel, item.title, ...Object.values(item.meta)].filter(Boolean);
                        const header = `[${metaParts.join(" | ")}]`;
                        const raw = item.insertText!;
                        const body = raw.length > MAX_INSERT ? raw.substring(0, MAX_INSERT) + "\u2026" : raw;
                        const chunkIdx = item.chunkIndex ?? -1;
                        const sanitizeMeta = (m: Record<string, string>): Record<string, string> => {
                          const out: Record<string, string> = {};
                          for (const [k, v] of Object.entries(m)) {
                            if (v != null && v !== "") out[k] = String(v);
                          }
                          return out;
                        };
                        const refJson: Record<string, unknown> = {
                          source: item.source,
                          docId: item.id,
                          chunkIndex: chunkIdx,
                          title: item.title,
                          meta: sanitizeMeta(item.meta),
                        };
                        if (chunkIdx === -1) refJson.snippet_only = true;
                        const jsonBlock = "```json\n" + JSON.stringify(refJson, ["source","docId","chunkIndex","title","meta","snippet_only"]) + "\n```";
                        const text = header + "\n" + body + "\n" + jsonBlock;
                        onInsertReference!(item.id, chunkIdx, text);
                      } : undefined}
                    />
                  ))}
                  <div className="flex items-center gap-2 pt-1">
                    {hasMore && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setMergedVisibleCount((c) => c + MERGED_PAGE_SIZE)}
                      >
                        {t("merged_show_more", "\u0551\u0578\u0582\u0575\u0581 \u057f\u0561\u056c \u0561\u057e\u0565\u056c\u056b\u0576")} ({filtered.length - mergedVisibleCount})
                      </Button>
                    )}
                    {!hasMore && mergedVisibleCount > MERGED_PAGE_SIZE && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setMergedVisibleCount(MERGED_PAGE_SIZE)}
                      >
                        {t("merged_show_less", "\u053f\u0580\u0573\u0565\u056c")}
                      </Button>
                    )}
                  </div>
                  {hiddenCount > 0 && (
                    <p className="text-[11px] text-muted-foreground text-center pt-1">
                      {t("merged_low_relevance_hidden", {
                        defaultValue: "{{count}} \u0581\u0561\u056e\u0580 \u0570\u0561\u0574\u0561\u057a\u0561\u057f\u0561\u057d\u056d\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u0561\u0580\u0564\u0575\u0578\u0582\u0576\u0584 \u0569\u0561\u0584\u0576\u057e\u0561\u056e \u0565\u0576",
                        count: hiddenCount,
                      })}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* ─── KB: legislation results ─── */}
            {viewFilter === "kb" && kbResults.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  {"\u0555\u0580\u0565\u0576\u057D\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576"} ({kbResults.length})
                </div>
                {kbResults.map((result) => (
                  <KBLawCard
                    key={result.id}
                    result={result}
                    searchQuery={query}
                    isExpanded={expandedKBDocs.has(result.id)}
                    onToggle={() => toggleKBDocExpanded(result.id)}
                    onInsertReference={onInsertReference ? handleInsertReference : undefined}
                  />
                ))}
              </div>
            )}

            {/* ─── PRACTICE: court decisions ─── */}
            {viewFilter === "practice" && documents.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <Gavel className="h-3.5 w-3.5" />
                  {"\u0534\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561"} ({documents.length})
                </div>
                {documents.map((doc) => (
                  <KBDocumentCard
                    key={doc.id}
                    document={doc}
                    isExpanded={expandedDocs.has(doc.id)}
                    onToggle={() => toggleDocExpanded(doc.id)}
                    loadedChunkIndexes={loadedChunkIndexes.get(doc.id) || []}
                    onLoadNextChunk={() => handleLoadNextChunk(doc)}
                    isLoadingChunk={isLoadingChunk}
                    getCachedChunk={getCachedChunk}
                    onInsertReference={handleInsertReference}
                  />
                ))}
              </div>
            )}

            {/* Empty state after search */}
            {!hasAnyResults && !isLoading && query.trim().length >= 2 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {"\u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580 \u0579\u0565\u0576 \u0563\u057F\u0576\u057E\u0565\u056C"}
              </div>
            )}

            {/* Default state: show practice docs before any search */}
            {!query.trim() && documents.length === 0 && !isLoading && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Gavel className="h-8 w-8 mx-auto mb-2 opacity-30" />
                {"\u0531\u056f\u056f\u0561\u056e\u0561\u0562\u0561\u0576\u0561\u056f\u0561\u0576 \u0563\u0580\u0561\u057c\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580 \u0579\u056f\u0561\u0576"}
              </div>
            )}

            {/* Empty for current filter */}
            {hasAnyResults && query.trim() && (
              (viewFilter === "kb" && kbResults.length === 0) ||
              (viewFilter === "practice" && documents.length === 0)
            ) && (
              <div className="text-center py-4 text-muted-foreground text-xs">
                {t("no_results_in_filter", "\u0531\u0575\u057D \u0562\u0561\u056A\u0576\u0578\u0582\u0574 \u0561\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580 \u0579\u056F\u0561\u0576")}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ─── Internal references panel ─── */}
        {!onInsertReference && (
          <Collapsible open={refsOpen} onOpenChange={setRefsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1.5">
                <ClipboardList className="h-3 w-3" />
                {t("references_title", "\u0540\u0572\u0578\u0582\u0574\u0576\u0565\u0580")}
                {collectedRefs.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 ml-1">
                    {collectedRefs.length}
                  </Badge>
                )}
                {refsOpen ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronRight className="h-3 w-3 ml-auto" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1.5">
              {collectedRefs.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-2">
                  {t("references_empty", "\u0540\u0572\u0578\u0582\u0574\u0576\u0565\u0580 \u0579\u056F\u0561\u0576\u0589 \u054D\u0565\u0572\u0574\u0565\u0584 Insert \u056F\u0578\u0573\u0561\u056F\u0568\u0589")}
                </p>
              ) : (
                <>
                  <Textarea
                    ref={refsTextareaRef}
                    readOnly
                    value={storeReferencesText || collectedRefs.join("\n\n---\n\n")}
                    className="text-xs min-h-[100px] max-h-[200px] resize-y"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={async () => {
                        const text = collectedRefs.join("\n\n---\n\n");
                        try {
                          await navigator.clipboard.writeText(text);
                          toast.success(t("references_copied", "\u054A\u0561\u057F\u0573\u0565\u0576\u057E\u0565\u0581"));
                        } catch {
                          // Fallback: select textarea content
                          try {
                            refsTextareaRef.current?.select();
                            document.execCommand("copy");
                            toast.success(t("references_copied", "\u054A\u0561\u057F\u0573\u0565\u0576\u057E\u0565\u0581"));
                          } catch {
                            toast.error("Copy failed");
                          }
                        }
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      {t("copy_references", "\u054A\u0561\u057F\u0573\u0565\u0576\u0565\u056C")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() => { setCollectedRefs([]); clearReferences(storeKey); onReferencesChange?.(""); }}
                    >
                      {t("clear", "\u0544\u0561\u0584\u0580\u0565\u056C")}
                    </Button>
                  </div>
                </>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {hasAnyResults && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs">
            {"\u0544\u0561\u0584\u0580\u0565\u056C \u0561\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u0568"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ================================================================
// Merged Result Card (compact, click-to-navigate)
// ================================================================

function MergedResultCard({ item, searchQuery, onClick, onInsert }: { item: MergedSearchItem; searchQuery?: string; onClick: () => void; onInsert?: () => void }) {
  const { t } = useTranslation("kb");
  const scorePct = Math.round(item.normalizedScore * 100);

  const renderHighlighted = (text: string, maxLen?: number) => {
    const truncated = maxLen && text.length > maxLen ? text.substring(0, maxLen) + "\u2026" : text;
    if (!searchQuery) return truncated;
    return highlightTerms(truncated, searchQuery).map((seg, i) =>
      seg.highlight ? (
        <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{seg.text}</mark>
      ) : (
        <span key={i}>{seg.text}</span>
      )
    );
  };

  return (
    <div className="w-full text-left border rounded-md px-3 py-2 bg-card hover:bg-accent/50 transition-colors flex items-start gap-2">
      <button onClick={onClick} className="flex items-start gap-2 flex-1 min-w-0 text-left">
        {item.source === "kb" ? (
          <BookOpen className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
        ) : (
          <Gavel className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium whitespace-normal break-words leading-tight">
              {renderHighlighted(item.title)}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <Badge variant={item.source === "kb" ? "default" : "secondary"} className="text-[10px] py-0 px-1.5 h-4">
              {item.source === "kb"
                ? t("source_kb", "\u0555\u0580\u0565\u0576\u057D\u0564\u0580.")
                : t("source_practice", "\u054A\u0580\u0561\u056F\u057F.")}
            </Badge>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
              {item.category}
            </Badge>
            {scorePct > 0 && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                {scorePct}%
              </Badge>
            )}
            {Object.entries(item.meta).map(([k, v]) => (
              <Badge key={k} variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                {v}
              </Badge>
            ))}
          </div>
          {item.preview && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
              {renderHighlighted(item.preview, 300)}
            </p>
          )}
        </div>
      </button>
      {onInsert && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 mt-0.5"
          title={t("insert_reference", "Insert reference")}
          onClick={(e) => { e.stopPropagation(); onInsert(); }}
        >
          <FileText className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

// ================================================================
// KB Law Card (knowledge_base results)
// ================================================================

interface KBLawCardProps {
  result: KBSearchResult;
  searchQuery: string;
  isExpanded: boolean;
  onToggle: () => void;
  onInsertReference?: (docId: string, chunkIndex: number, text: string) => void;
}

function KBLawCard({ result, searchQuery, isExpanded, onToggle, onInsertReference }: KBLawCardProps) {
  const { t } = useTranslation("kb");
  const chunks = result.chunks;
  const [expandedChunks, setExpandedChunks] = useState<Map<number, string>>(new Map());
  const [loadingChunks, setLoadingChunks] = useState<Set<number>>(new Set());

  const handleExpandChunk = async (chunkIndex: number) => {
    if (expandedChunks.has(chunkIndex)) {
      setExpandedChunks((prev) => { const next = new Map(prev); next.delete(chunkIndex); return next; });
      return;
    }

    setLoadingChunks((prev) => new Set(prev).add(chunkIndex));
    try {
      const { data, error } = await supabase.rpc("get_kb_chunk_full", {
        p_kb_id: result.id,
        p_chunk_index: chunkIndex,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const text = typeof row === "object" && row !== null && "chunk_text" in row
        ? String((row as Record<string, unknown>).chunk_text)
        : typeof row === "string" ? row : "";
      if (!text) throw new Error("chunk_text missing from RPC response");
      setExpandedChunks((prev) => new Map(prev).set(chunkIndex, text));
    } catch (err) {
      console.error("Failed to load full chunk:", err);
    } finally {
      setLoadingChunks((prev) => { const next = new Set(prev); next.delete(chunkIndex); return next; });
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button className="flex items-start gap-2 w-full text-left">
            {isExpanded ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-sm">{result.title}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs py-0">{result.category}</Badge>
                {result.source_name && <Badge variant="secondary" className="text-xs py-0">{result.source_name}</Badge>}
                {chunks.length > 0 && (
                  <Badge variant="secondary" className="text-xs py-0">
                    {chunks.length} {chunks.length === 1 ? "fragment" : "fragments"}
                  </Badge>
                )}
                {Number.isFinite(result.relevancePct) && result.relevancePct > 0 && (
                  <Badge variant="outline" className="text-xs py-0">{t('relevance')}: {result.relevancePct}%</Badge>
                )}
              </div>
              {!isExpanded && chunks.length > 0 && (
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                  {chunks[0].label && <span className="font-medium">{chunks[0].label}: </span>}
                  {chunks[0].excerpt}
                </p>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-2">
          {chunks.length > 0 ? (
            chunks.map((chunk, idx) => {
              const hasFullText = chunk.chunk_type === 'article' && !!chunk.full_text;
              const isManuallyCollapsed = expandedChunks.get(chunk.chunk_index) === '__collapsed__';
              const isRpcExpanded = expandedChunks.has(chunk.chunk_index) && !isManuallyCollapsed;
              const isChunkLoading = loadingChunks.has(chunk.chunk_index);

              let displayText: string;
              let showFull: boolean;
              if (isRpcExpanded) {
                displayText = expandedChunks.get(chunk.chunk_index)!;
                showFull = true;
              } else if (isManuallyCollapsed) {
                displayText = chunk.excerpt;
                showFull = false;
              } else {
                displayText = chunk.excerpt;
                showFull = false;
              }

              const handleToggle = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (showFull) {
                  setExpandedChunks((prev) => { const m = new Map(prev); m.delete(chunk.chunk_index); return m; });
                } else if (hasFullText) {
                  setExpandedChunks((prev) => new Map(prev).set(chunk.chunk_index, chunk.full_text!));
                } else {
                  handleExpandChunk(chunk.chunk_index);
                }
              };

              return (
                <div key={idx} className="border rounded-lg p-3 bg-secondary/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-primary flex items-center gap-1.5">
                      <BookOpen className="h-3 w-3" />
                      {chunk.label || `${chunk.chunk_type} #${chunk.chunk_index}`}
                    </span>
                    <span className="text-muted-foreground">score: {(chunk.score * 100).toFixed(0)}%</span>
                  </div>
                  <div className={`text-sm text-foreground/90 leading-relaxed ${showFull ? 'whitespace-pre-wrap' : ''}`}>
                    {highlightTerms(displayText, searchQuery).map((seg, i) =>
                      seg.highlight ? (
                        <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">{seg.text}</mark>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-3" disabled={isChunkLoading} onClick={handleToggle}>
                      {isChunkLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : showFull ? <Minimize2 className="h-3 w-3 mr-1" /> : <Maximize2 className="h-3 w-3 mr-1" />}
                      {isChunkLoading ? t("kb_loading") : showFull ? t("kb_collapse") : t("kb_show_full")}
                    </Button>
                    {onInsertReference && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-3 text-primary"
                        onClick={(e) => { e.stopPropagation(); onInsertReference(result.id, chunk.chunk_index, displayText); }}>
                        {"\u054f\u0565\u0572\u0561\u0564\u0580\u0565\u056c \u0578\u0580\u057a\u0565\u057d KB \u0570\u0572\u0578\u0582\u0574"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="border rounded-lg p-3 bg-secondary/20">
              <p className="text-sm text-muted-foreground italic">{"\u0549\u0561\u0576\u056f\u0565\u0580 \u0579\u0565\u0576 \u0563\u057f\u0576\u057e\u0565\u056c"}</p>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ================================================================
// Practice Document Card (legal_practice_kb results)
// ================================================================

interface KBDocumentCardProps {
  document: KBDocument;
  isExpanded: boolean;
  onToggle: () => void;
  loadedChunkIndexes: number[];
  onLoadNextChunk: () => void;
  isLoadingChunk: boolean;
  getCachedChunk: (docId: string, chunkIndex: number) => ReturnType<ReturnType<typeof useLegalPracticeKB>["getCachedChunk"]>;
  onInsertReference: (docId: string, chunkIndex: number, text: string) => void;
}

function KBDocumentCard({
  document,
  isExpanded,
  onToggle,
  loadedChunkIndexes,
  onLoadNextChunk,
  isLoadingChunk,
  getCachedChunk,
  onInsertReference,
}: KBDocumentCardProps) {
  const { t } = useTranslation("kb");
  const [showDecisionMap, setShowDecisionMap] = useState(false);
  const hasMoreChunks = loadedChunkIndexes.length + document.top_chunks.length < document.totalChunks;

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-card">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <button className="flex items-start gap-2 w-full text-left">
            {isExpanded ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-sm whitespace-normal break-words">{document.title}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="outline" className="text-xs py-0">{COURT_LABELS[document.court_type] || document.court_type}</Badge>
                <Badge variant="secondary" className="text-xs py-0">{OUTCOME_LABELS[document.outcome] || document.outcome}</Badge>
                {document.top_chunks.length > 0 && (
                  <Badge variant="secondary" className="text-xs py-0">
                    {document.top_chunks.length} {t("snippet", { count: document.top_chunks.length })}
                  </Badge>
                )}
              </div>
              {!isExpanded && document.legal_reasoning_summary && (
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3 whitespace-normal break-words">
                  {document.legal_reasoning_summary.substring(0, 400)}
                </p>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {document.decision_map && (
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs w-full justify-start"
                onClick={() => setShowDecisionMap(!showDecisionMap)}>
                {showDecisionMap ? "\u053F\u0580\u0573\u0565\u056C \u0584\u0561\u0580\u057F\u0565\u0566\u0568" : "\u0532\u0561\u0581\u0565\u056C \u056B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0584\u0561\u0580\u057F\u0565\u0566\u0568"}
              </Button>
              {showDecisionMap && (
                <div className="bg-muted/50 rounded p-2 text-xs space-y-1.5">
                  {document.decision_map.legal_question && (
                    <div><span className="font-medium">{"\u053B\u0580\u0561\u057E\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581"}:</span> {renderValue(document.decision_map.legal_question)}</div>
                  )}
                  {document.decision_map.holding && (
                    <div><span className="font-medium">{"\u0534\u056B\u0580\u0584\u0578\u0580\u0578\u0577\u0578\u0582\u0574"}:</span> {renderValue(document.decision_map.holding)}</div>
                  )}
                  {document.decision_map.tests_or_criteria && (
                    <div><span className="font-medium">{"\u0539\u0565\u057D\u057F\u0565\u0580/\u0579\u0561\u0583\u0561\u0576\u056B\u0577\u0576\u0565\u0580"}:</span> {renderValue(document.decision_map.tests_or_criteria)}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {document.top_chunks.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                {"\u0540\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576 \u0570\u0561\u057F\u057E\u0561\u056E\u0576\u0565\u0580"} ({document.top_chunks.length}/{document.totalChunks})
              </div>
              {document.top_chunks.map((chunk) => (
                <ChunkDisplay key={chunk.chunkIndex} docId={document.id} chunkIndex={chunk.chunkIndex}
                  totalChunks={document.totalChunks} text={chunk.text} onInsertReference={onInsertReference} />
              ))}
            </div>
          ) : document.legal_reasoning_summary ? (
            <div className="border rounded-lg p-3 bg-secondary/20 space-y-2">
              <span className="font-semibold text-xs text-primary flex items-center gap-1.5">
                <Gavel className="h-3 w-3" />{"\u053b\u0580\u0561\u057e\u0561\u056f\u0561\u0576 \u0570\u056b\u0574\u0576\u0561\u057e\u0578\u0580\u0578\u0582\u0574"}
              </span>
              <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{document.legal_reasoning_summary}</div>
            </div>
          ) : null}

          {loadedChunkIndexes.map((idx) => {
            const chunk = getCachedChunk(document.id, idx);
            if (!chunk) return null;
            return <ChunkDisplay key={`loaded-${idx}`} docId={document.id} chunkIndex={chunk.chunkIndex}
              totalChunks={chunk.totalChunks} text={chunk.text} onInsertReference={onInsertReference} />;
          })}

          {hasMoreChunks && (
            <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={onLoadNextChunk} disabled={isLoadingChunk}>
              {isLoadingChunk ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {"\u0532\u0561\u0581\u0565\u056C \u0570\u0561\u057B\u0578\u0580\u0564 \u0570\u0561\u057F\u057E\u0561\u056E\u0568"}
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ================================================================
// Chunk Display
// ================================================================

interface ChunkDisplayProps {
  docId: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  onInsertReference: (docId: string, chunkIndex: number, text: string) => void;
}

function ChunkDisplay({ docId, chunkIndex, totalChunks, text, onInsertReference }: ChunkDisplayProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const cleanText = cleanJsonArtifacts(text);
  const displayText = isCollapsed ? cleanText.substring(0, 300) : cleanText;
  const canCollapse = cleanText.length > 300;

  return (
    <div className="border rounded-lg p-3 bg-secondary/20 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-primary flex items-center gap-1.5">
          <Gavel className="h-3 w-3" />{"\u0531\u0576\u0561\u056C\u0578\u0563 \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u057A\u0580\u0561\u056F\u057F\u056B\u056F\u0561 (KB)"}
        </span>
        <Badge variant="outline" className="text-[10px] py-0 px-1.5">{chunkIndex + 1}/{totalChunks}</Badge>
      </div>
      <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-normal">
        {displayText}
        {isCollapsed && canCollapse && "..."}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
        {canCollapse && (
          <Button variant="ghost" size="sm" className="h-7 text-xs px-3" onClick={() => setIsCollapsed(!isCollapsed)}>
            {isCollapsed ? "\u0538\u0576\u0564\u056C\u0561\u0575\u0576\u0565\u056C" : "\u053F\u0580\u0573\u0565\u056C"}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 text-xs px-3 text-primary"
          onClick={() => onInsertReference(docId, chunkIndex, text)}>
          {"\u054F\u0565\u0572\u0561\u0564\u0580\u0565\u056C \u0578\u0580\u057A\u0565\u057D KB \u0570\u0572\u0578\u0582\u0574"}
        </Button>
      </div>
    </div>
  );
}
