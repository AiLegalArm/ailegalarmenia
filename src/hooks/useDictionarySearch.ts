import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DictionaryResult {
  id: string;
  lemma: string;
  part_of_speech: string | null;
  definition: string | null;
  examples: string[] | null;
  forms: string[] | null;
  match_type: string;
  similarity_score: number;
}

interface SearchResponse {
  q: string;
  q_norm: string;
  results: DictionaryResult[];
  total: number;
  latency_ms: number;
}

export function useDictionarySearch() {
  const [results, setResults] = useState<DictionaryResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      setLatencyMs(null);
      return;
    }

    // Cancel previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'dictionary-search',
        {
          body: { q: trimmed, limit: 30, offset: 0 },
        }
      );

      // If aborted, ignore
      if (controller.signal.aborted) return;

      if (fnError) {
        setError(fnError.message);
        setResults([]);
        return;
      }

      const resp = data as SearchResponse;
      setResults(resp.results || []);
      setLatencyMs(resp.latency_ms ?? null);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
    setLatencyMs(null);
  }, []);

  return { results, isLoading, error, latencyMs, search, clear };
}
