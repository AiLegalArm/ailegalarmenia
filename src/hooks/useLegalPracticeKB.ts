import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PracticeCategory = "criminal" | "civil" | "administrative" | "echr" | "constitutional" | "bankruptcy";
export type CourtType = "first_instance" | "appeal" | "cassation" | "constitutional" | "echr";
export type Outcome = "granted" | "rejected" | "partial" | "remanded" | "discontinued";

export interface DecisionMap {
  legal_question?: string;
  holding?: string;
  tests_or_criteria?: string;
  application_to_facts?: string;
  remedy?: string;
  references?: string[];
}

export interface KeyParagraph {
  tag: string;
  chunkIdx: number;
  excerpt?: string;
}

export interface TopChunk {
  chunkIndex: number;
  text: string;
}

export interface KBDocument {
  id: string;
  title: string;
  practice_category: PracticeCategory;
  court_type: CourtType;
  outcome: Outcome;
  applied_articles: Array<{ code: string; articles: string[] }>;
  key_violations: string[];
  legal_reasoning_summary: string | null;
  decision_map: DecisionMap | null;
  key_paragraphs: KeyParagraph[];
  top_chunks: TopChunk[];
  totalChunks: number;
  returnedChunks?: number;
  max_score?: number;
}

export interface KBChunk {
  id: string;
  title: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  meta?: {
    idx: number;
    start: number;
    end: number;
    label?: string;
  };
}

interface UseKBState {
  documents: KBDocument[];
  isSearching: boolean;
  searchError: string | null;
  loadedChunks: Map<string, KBChunk>; // key: `${docId}:${chunkIndex}`
  isLoadingChunk: boolean;
  chunkError: string | null;
}

export function useLegalPracticeKB() {
  const [state, setState] = useState<UseKBState>({
    documents: [],
    isSearching: false,
    searchError: null,
    loadedChunks: new Map(),
    isLoadingChunk: false,
    chunkError: null,
  });

  /**
   * Search KB documents
   */
  const searchKB = useCallback(async (
    query: string,
    category?: PracticeCategory | null,
    limitDocs: number = 5,
    limitChunksPerDoc: number = 3
  ) => {
    setState((s) => ({ ...s, isSearching: true, searchError: null }));

    try {
      // Run edge-function search + chunk-RPC search in parallel
      const edgePromise = supabase.functions.invoke("kb-search", {
        body: {
          query,
          category: category || null,
          limitDocs,
          limitChunksPerDoc,
        },
      });

      const chunkPromise = supabase.rpc("search_legal_practice_kb", {
        search_query: query,
        category_filter: category || undefined,
        limit_docs: 50,
      }).then(
        (res) => res,
        () => ({ data: null, error: { message: "chunk search unavailable" } })
      );

      const [edgeResult, chunkResult] = await Promise.all([edgePromise, chunkPromise]);

      // Edge function may fail (timeout, etc.) — treat as soft failure
      const edgeDocs: KBDocument[] = edgeResult.error ? [] : (edgeResult.data?.documents || []);

      // Merge chunk-RPC results (if any) with edge results
      const seenIds = new Set(edgeDocs.map((d) => d.id));
      if (chunkResult.data && Array.isArray(chunkResult.data)) {
        for (const row of chunkResult.data) {
          if (seenIds.has(row.id)) continue;
          seenIds.add(row.id);

          // Convert RPC shape to KBDocument
          let appliedArticles: Array<{ code: string; articles: string[] }> = [];
          try {
            const aa = row.applied_articles as { sources?: Array<{ act: string; articles: Array<{ article: string }> }> } | null;
            if (aa?.sources) {
              appliedArticles = aa.sources.map((s: { act: string; articles: Array<{ article: string }> }) => ({
                code: s.act,
                articles: (s.articles || []).map((a: { article: string }) => a.article),
              }));
            }
          } catch { /* ignore */ }

          edgeDocs.push({
            id: row.id,
            title: row.title,
            practice_category: row.practice_category as PracticeCategory,
            court_type: row.court_type as CourtType,
            outcome: row.outcome as Outcome,
            applied_articles: appliedArticles,
            key_violations: row.key_violations || [],
            legal_reasoning_summary: row.legal_reasoning_summary || null,
            decision_map: (row.decision_map as DecisionMap) || null,
            key_paragraphs: Array.isArray(row.key_paragraphs) ? row.key_paragraphs as KeyParagraph[] : [],
            top_chunks: [],
            totalChunks: row.total_chunks || 0,
            max_score: Number(row.relevance_score ?? 0) || 0,
          });
        }
      }

      // Limit to top 20 merged results
      const documents = edgeDocs.slice(0, 20);

      setState((s) => ({
        ...s,
        documents,
        isSearching: false,
        searchError: null,
      }));

      return documents;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed";
      setState((s) => ({
        ...s,
        documents: [],
        isSearching: false,
        searchError: message,
      }));
      return [];
    }
  }, []);

  /**
   * Load a specific chunk by docId and chunkIndex
   */
  const loadChunk = useCallback(async (
    docId: string,
    chunkIndex: number
  ): Promise<KBChunk | null> => {
    const key = `${docId}:${chunkIndex}`;

    // Check cache first
    if (state.loadedChunks.has(key)) {
      return state.loadedChunks.get(key)!;
    }

    setState((s) => ({ ...s, isLoadingChunk: true, chunkError: null }));

    try {
      const { data, error } = await supabase.functions.invoke("kb-get-chunk", {
        body: { docId, chunkIndex },
      });

      if (error) {
        throw new Error(error.message || "Failed to load chunk");
      }

      const chunk: KBChunk = {
        id: data.id,
        title: data.title,
        chunkIndex: data.chunkIndex,
        totalChunks: data.totalChunks,
        text: data.text,
        meta: data.meta,
      };

      setState((s) => {
        const newMap = new Map(s.loadedChunks);
        newMap.set(key, chunk);
        return {
          ...s,
          loadedChunks: newMap,
          isLoadingChunk: false,
          chunkError: null,
        };
      });

      return chunk;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load chunk";
      setState((s) => ({
        ...s,
        isLoadingChunk: false,
        chunkError: message,
      }));
      return null;
    }
  }, [state.loadedChunks]);

  /**
   * Get a cached chunk without network call
   */
  const getCachedChunk = useCallback((docId: string, chunkIndex: number): KBChunk | null => {
    return state.loadedChunks.get(`${docId}:${chunkIndex}`) || null;
  }, [state.loadedChunks]);

  /**
   * Clear all state
   */
  const clearSearch = useCallback(() => {
    setState({
      documents: [],
      isSearching: false,
      searchError: null,
      loadedChunks: new Map(),
      isLoadingChunk: false,
      chunkError: null,
    });
  }, []);

  /** Directly set documents from an external source (e.g. unified search) */
  const setDocuments = useCallback((docs: KBDocument[]) => {
    setState((s) => ({ ...s, documents: docs, isSearching: false, searchError: null }));
  }, []);

  return {
    // State
    documents: state.documents,
    isSearching: state.isSearching,
    searchError: state.searchError,
    loadedChunks: state.loadedChunks,
    isLoadingChunk: state.isLoadingChunk,
    chunkError: state.chunkError,

    // Actions
    searchKB,
    loadChunk,
    getCachedChunk,
    clearSearch,
    setDocuments,
  };
}
