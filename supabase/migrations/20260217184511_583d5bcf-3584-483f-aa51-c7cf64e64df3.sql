
-- Upgrade search_legal_practice_chunks: add soft OR fallback
CREATE OR REPLACE FUNCTION public.search_legal_practice_chunks(
  p_query text,
  category_filter text DEFAULT NULL,
  p_limit_chunks integer DEFAULT 120,
  p_limit_docs integer DEFAULT 20,
  p_chunks_per_doc integer DEFAULT 4
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  safe_q       TEXT;
  tsq          tsquery;
  tsq_or       tsquery;
  use_phrase   BOOLEAN := FALSE;
  stripped_q   TEXT;
  unaccented_q TEXT;
  result       JSONB;
  and_doc_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  safe_q := regexp_replace(trim(p_query), '\s+', ' ', 'g');
  safe_q := substring(safe_q FROM 1 FOR 200);

  IF length(safe_q) < 2 THEN
    RETURN jsonb_build_object('documents', '[]'::jsonb, 'chunks', '[]'::jsonb);
  END IF;

  unaccented_q := public.immutable_unaccent(safe_q);

  IF safe_q ~ '"' OR (safe_q ~ ' ' AND length(safe_q) >= 12) THEN
    use_phrase := TRUE;
    stripped_q := public.immutable_unaccent(replace(safe_q, '"', ''));
  END IF;

  IF use_phrase THEN
    BEGIN
      tsq := phraseto_tsquery('simple', stripped_q);
    EXCEPTION WHEN OTHERS THEN
      tsq := plainto_tsquery('simple', stripped_q);
    END;
    IF tsq IS NULL OR tsq = ''::tsquery THEN
      tsq := plainto_tsquery('simple', stripped_q);
    END IF;
  ELSE
    BEGIN
      tsq := websearch_to_tsquery('simple', unaccented_q);
    EXCEPTION WHEN OTHERS THEN
      tsq := plainto_tsquery('simple', unaccented_q);
    END;
    IF tsq IS NULL OR tsq = ''::tsquery THEN
      tsq := plainto_tsquery('simple', unaccented_q);
    END IF;
  END IF;

  IF tsq IS NULL OR tsq = ''::tsquery THEN
    RETURN jsonb_build_object('documents', '[]'::jsonb, 'chunks', '[]'::jsonb);
  END IF;

  -- AND query
  WITH matching_chunks AS (
    SELECT c.doc_id, c.chunk_index,
           substring(c.chunk_text FROM 1 FOR 600) AS excerpt,
           ts_rank_cd(
             to_tsvector('simple', public.immutable_unaccent(c.chunk_text)), tsq
           ) AS score
    FROM public.legal_practice_kb_chunks c
    JOIN public.legal_practice_kb lpk ON lpk.id = c.doc_id AND lpk.is_active = true
    WHERE to_tsvector('simple', public.immutable_unaccent(c.chunk_text)) @@ tsq
      AND (category_filter IS NULL OR lpk.practice_category::text = category_filter)
    ORDER BY score DESC
    LIMIT LEAST(p_limit_chunks, 300)
  ),
  ranked_chunks AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY doc_id ORDER BY score DESC) AS rn
    FROM matching_chunks
  ),
  top_docs AS (
    SELECT doc_id, MAX(score) AS max_score
    FROM ranked_chunks GROUP BY doc_id
    ORDER BY max_score DESC
    LIMIT LEAST(p_limit_docs, 50)
  ),
  doc_chunks AS (
    SELECT rc.doc_id, rc.chunk_index, rc.excerpt, rc.score
    FROM ranked_chunks rc JOIN top_docs td ON td.doc_id = rc.doc_id
    WHERE rc.rn <= LEAST(p_chunks_per_doc, 8)
  )
  SELECT jsonb_build_object(
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', lpk.id, 'title', lpk.title,
        'practice_category', lpk.practice_category,
        'court_type', lpk.court_type, 'outcome', lpk.outcome,
        'decision_date', lpk.decision_date, 'source_url', lpk.source_url,
        'max_score', td.max_score
      ) ORDER BY td.max_score DESC)
      FROM top_docs td
      JOIN public.legal_practice_kb lpk ON lpk.id = td.doc_id
    ), '[]'::jsonb),
    'chunks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'doc_id', dc.doc_id, 'chunk_index', dc.chunk_index,
        'excerpt', dc.excerpt, 'score', dc.score
      ) ORDER BY dc.score DESC)
      FROM doc_chunks dc
    ), '[]'::jsonb)
  ) INTO result;

  and_doc_count := COALESCE(jsonb_array_length(result->'documents'), 0);

  -- SOFT OR FALLBACK
  IF and_doc_count < 5 AND NOT use_phrase THEN
    BEGIN
      tsq_or := replace(unaccented_q::text, ' ', ' | ')::tsquery;
    EXCEPTION WHEN OTHERS THEN
      tsq_or := NULL;
    END;

    IF tsq_or IS NOT NULL AND tsq_or != ''::tsquery AND tsq_or IS DISTINCT FROM tsq THEN
      WITH existing_ids AS (
        SELECT (e->>'id')::uuid AS id FROM jsonb_array_elements(result->'documents') e
      ),
      or_chunks AS (
        SELECT c.doc_id, c.chunk_index,
               substring(c.chunk_text FROM 1 FOR 600) AS excerpt,
               ts_rank_cd(
                 to_tsvector('simple', public.immutable_unaccent(c.chunk_text)), tsq_or
               ) AS score
        FROM public.legal_practice_kb_chunks c
        JOIN public.legal_practice_kb lpk ON lpk.id = c.doc_id AND lpk.is_active = true
        WHERE to_tsvector('simple', public.immutable_unaccent(c.chunk_text)) @@ tsq_or
          AND (category_filter IS NULL OR lpk.practice_category::text = category_filter)
          AND c.doc_id NOT IN (SELECT id FROM existing_ids)
        ORDER BY score DESC
        LIMIT LEAST(p_limit_chunks, 200)
      ),
      or_ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY doc_id ORDER BY score DESC) AS rn FROM or_chunks
      ),
      or_top AS (
        SELECT doc_id, MAX(score) AS max_score FROM or_ranked GROUP BY doc_id
        ORDER BY max_score DESC
        LIMIT GREATEST(LEAST(p_limit_docs, 50) - and_doc_count, 0)
      ),
      or_doc_chunks AS (
        SELECT rc.doc_id, rc.chunk_index, rc.excerpt, rc.score
        FROM or_ranked rc JOIN or_top td ON td.doc_id = rc.doc_id
        WHERE rc.rn <= LEAST(p_chunks_per_doc, 8)
      )
      SELECT jsonb_build_object(
        'documents', (result->'documents') || COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', lpk.id, 'title', lpk.title,
            'practice_category', lpk.practice_category,
            'court_type', lpk.court_type, 'outcome', lpk.outcome,
            'decision_date', lpk.decision_date, 'source_url', lpk.source_url,
            'max_score', td.max_score
          ) ORDER BY td.max_score DESC)
          FROM or_top td
          JOIN public.legal_practice_kb lpk ON lpk.id = td.doc_id
        ), '[]'::jsonb),
        'chunks', (result->'chunks') || COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'doc_id', dc.doc_id, 'chunk_index', dc.chunk_index,
            'excerpt', dc.excerpt, 'score', dc.score
          ) ORDER BY dc.score DESC)
          FROM or_doc_chunks dc
        ), '[]'::jsonb)
      ) INTO result;
    END IF;
  END IF;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_legal_practice_chunks(text, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_legal_practice_chunks(text, text, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_legal_practice_chunks(text, text, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_legal_practice_chunks(text, text, integer, integer, integer) TO service_role;
