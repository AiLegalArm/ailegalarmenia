
CREATE OR REPLACE FUNCTION public.search_legal_practice_kb(
  search_query text,
  category_filter text DEFAULT NULL::text,
  limit_docs integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  title text,
  practice_category practice_category,
  court_type court_type,
  outcome case_outcome,
  applied_articles jsonb,
  key_violations text[],
  legal_reasoning_summary text,
  description text,
  decision_map jsonb,
  key_paragraphs jsonb,
  content_chunks text[],
  chunk_index_meta jsonb,
  total_chunks integer,
  relevance_score real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  safe_q     TEXT;
  tsq        tsquery;
  use_phrase BOOLEAN := FALSE;
  stripped_q TEXT;
BEGIN
  -- ── AUTH GUARD ──
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ── SANITIZE ──
  safe_q := regexp_replace(trim(search_query), '\s+', ' ', 'g');
  safe_q := substring(safe_q FROM 1 FOR 200);

  IF length(safe_q) < 2 THEN
    RETURN;
  END IF;

  -- ── QUERY PARSING ──
  -- Detect phrase intent: quoted text OR long multi-word query
  IF safe_q ~ '"' OR (safe_q ~ ' ' AND length(safe_q) >= 12) THEN
    use_phrase := TRUE;
    stripped_q := replace(safe_q, '"', '');
  END IF;

  -- Build tsquery with fallback chain
  IF use_phrase THEN
    BEGIN
      tsq := phraseto_tsquery('simple', stripped_q);
    EXCEPTION WHEN OTHERS THEN
      tsq := plainto_tsquery('simple', stripped_q);
    END;
    -- If phrase produced empty tsquery, fallback
    IF tsq IS NULL OR tsq = ''::tsquery THEN
      tsq := plainto_tsquery('simple', stripped_q);
    END IF;
  ELSE
    BEGIN
      tsq := websearch_to_tsquery('simple', safe_q);
    EXCEPTION WHEN OTHERS THEN
      tsq := plainto_tsquery('simple', safe_q);
    END;
    IF tsq IS NULL OR tsq = ''::tsquery THEN
      tsq := plainto_tsquery('simple', safe_q);
    END IF;
  END IF;

  -- Final guard: if still empty, nothing to search
  IF tsq IS NULL OR tsq = ''::tsquery THEN
    RETURN;
  END IF;

  -- ── MAIN QUERY ──
  -- Uses idx_legal_practice_kb_search (composite GIN on title+content_text+summary)
  RETURN QUERY
  SELECT
    lpk.id,
    lpk.title,
    lpk.practice_category,
    lpk.court_type,
    lpk.outcome,
    lpk.applied_articles,
    lpk.key_violations,
    -- Snippet: prefer summary; if null, extract ~500 chars around first match
    CASE
      WHEN lpk.legal_reasoning_summary IS NOT NULL
           AND length(lpk.legal_reasoning_summary) > 0
        THEN lpk.legal_reasoning_summary
      ELSE substring(lpk.content_text FROM
        GREATEST(1, COALESCE(position(safe_q IN lpk.content_text), 1) - 200)
        FOR 500
      )
    END AS legal_reasoning_summary,
    lpk.description,
    lpk.decision_map,
    lpk.key_paragraphs,
    lpk.content_chunks,
    lpk.chunk_index_meta,
    COALESCE(array_length(lpk.content_chunks, 1), 0)::integer AS total_chunks,
    (
      ts_rank_cd(
        to_tsvector('simple',
          lpk.title || ' ' || COALESCE(lpk.content_text, '') || ' ' || COALESCE(lpk.legal_reasoning_summary, '')
        ),
        tsq
      ) * 0.85
      + COALESCE(similarity(lpk.title, safe_q), 0) * 0.15
    )::real AS relevance_score
  FROM public.legal_practice_kb lpk
  WHERE lpk.is_active = true
    AND (category_filter IS NULL OR lpk.practice_category::text = category_filter)
    AND to_tsvector('simple',
          lpk.title || ' ' || COALESCE(lpk.content_text, '') || ' ' || COALESCE(lpk.legal_reasoning_summary, '')
        ) @@ tsq
  ORDER BY relevance_score DESC
  LIMIT LEAST(limit_docs, 50);
END;
$function$;
