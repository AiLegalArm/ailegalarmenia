CREATE OR REPLACE FUNCTION public.search_legal_practice_kb(
  search_query text,
  category_filter text DEFAULT NULL,
  limit_docs integer DEFAULT 5
)
RETURNS TABLE(
  id uuid, title text, practice_category practice_category, court_type court_type,
  outcome case_outcome, applied_articles jsonb, key_violations text[],
  legal_reasoning_summary text, description text, decision_map jsonb,
  key_paragraphs jsonb, content_chunks text[], chunk_index_meta jsonb,
  total_chunks integer, relevance_score real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tokens text[];
  tok text;
  i int;
BEGIN
  -- Tokenize: split on whitespace, trim, remove short/empty, limit 8
  SELECT array_agg(t) INTO tokens
  FROM (
    SELECT trim(u) AS t
    FROM unnest(string_to_array(search_query, ' ')) AS u
    WHERE length(trim(u)) >= 2
    LIMIT 8
  ) sub
  WHERE t IS NOT NULL;

  IF tokens IS NULL OR array_length(tokens, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Try AND match first (all tokens must appear somewhere)
  RETURN QUERY
  SELECT
    lpk.id, lpk.title, lpk.practice_category, lpk.court_type, lpk.outcome,
    lpk.applied_articles, lpk.key_violations, lpk.legal_reasoning_summary,
    lpk.description, lpk.decision_map, lpk.key_paragraphs, lpk.content_chunks,
    lpk.chunk_index_meta,
    COALESCE(array_length(lpk.content_chunks, 1), 0)::integer AS total_chunks,
    (
      COALESCE(similarity(lpk.title, search_query), 0) * 0.4 +
      COALESCE(similarity(lpk.description, search_query), 0) * 0.3 +
      COALESCE(similarity(lpk.legal_reasoning_summary, search_query), 0) * 0.3
    )::real AS relevance_score
  FROM public.legal_practice_kb lpk
  WHERE lpk.is_active = true
    AND (category_filter IS NULL OR lpk.practice_category::text = category_filter)
    AND (
      SELECT bool_and(
        lpk.title ILIKE '%' || tk || '%'
        OR lpk.description ILIKE '%' || tk || '%'
        OR lpk.legal_reasoning_summary ILIKE '%' || tk || '%'
        OR EXISTS (SELECT 1 FROM unnest(lpk.key_violations) kv WHERE kv ILIKE '%' || tk || '%')
      )
      FROM unnest(tokens) AS tk
    )
  ORDER BY relevance_score DESC
  LIMIT limit_docs;

  -- If AND returned rows, we're done
  IF FOUND THEN
    RETURN;
  END IF;

  -- Fallback: OR match (any token matches)
  RETURN QUERY
  SELECT
    lpk.id, lpk.title, lpk.practice_category, lpk.court_type, lpk.outcome,
    lpk.applied_articles, lpk.key_violations, lpk.legal_reasoning_summary,
    lpk.description, lpk.decision_map, lpk.key_paragraphs, lpk.content_chunks,
    lpk.chunk_index_meta,
    COALESCE(array_length(lpk.content_chunks, 1), 0)::integer AS total_chunks,
    (
      COALESCE(similarity(lpk.title, search_query), 0) * 0.4 +
      COALESCE(similarity(lpk.description, search_query), 0) * 0.3 +
      COALESCE(similarity(lpk.legal_reasoning_summary, search_query), 0) * 0.3
    )::real AS relevance_score
  FROM public.legal_practice_kb lpk
  WHERE lpk.is_active = true
    AND (category_filter IS NULL OR lpk.practice_category::text = category_filter)
    AND (
      SELECT bool_or(
        lpk.title ILIKE '%' || tk || '%'
        OR lpk.description ILIKE '%' || tk || '%'
        OR lpk.legal_reasoning_summary ILIKE '%' || tk || '%'
        OR EXISTS (SELECT 1 FROM unnest(lpk.key_violations) kv WHERE kv ILIKE '%' || tk || '%')
      )
      FROM unnest(tokens) AS tk
    )
  ORDER BY relevance_score DESC
  LIMIT limit_docs;
END;
$function$;