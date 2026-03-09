
-- ============================================================
-- Upgrade search_kb_chunks: unified tsquery + unaccent + soft OR fallback
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_kb_chunks(
  p_query text,
  p_category text DEFAULT NULL,
  p_limit_chunks integer DEFAULT 50,
  p_limit_docs integer DEFAULT 10,
  p_chunks_per_doc integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result       JSONB;
  safe_q       TEXT;
  unaccented_q TEXT;
  tsq          tsquery;
  tsq_or       tsquery;
  use_phrase   BOOLEAN := FALSE;
  stripped_q   TEXT;
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
  WITH fts_matches AS (
    SELECT c.id AS chunk_id, c.kb_id, c.chunk_index, c.chunk_type, c.label,
           c.char_start,
           substring(c.chunk_text FROM 1 FOR 500) AS excerpt,
           CASE
             WHEN c.chunk_type = 'article' AND length(c.chunk_text) <= 20000 THEN c.chunk_text
             WHEN c.chunk_type = 'article' AND length(c.chunk_text) > 20000 THEN substring(c.chunk_text FROM 1 FOR 20000)
             ELSE NULL
           END AS full_text,
           ts_rank_cd(
             to_tsvector('simple', public.immutable_unaccent(c.chunk_text)),
             tsq
           ) AS score
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON kb.id = c.kb_id AND kb.is_active = true
    WHERE c.is_active = true
      AND to_tsvector('simple', public.immutable_unaccent(c.chunk_text)) @@ tsq
      AND (p_category IS NULL OR kb.category::text = p_category)
    ORDER BY score DESC
    LIMIT LEAST(p_limit_chunks, 50)
  ),
  label_matches AS (
    SELECT c.id AS chunk_id, c.kb_id, c.chunk_index, c.chunk_type, c.label,
           c.char_start,
           substring(c.chunk_text FROM 1 FOR 500) AS excerpt,
           CASE
             WHEN c.chunk_type = 'article' AND length(c.chunk_text) <= 20000 THEN c.chunk_text
             WHEN c.chunk_type = 'article' AND length(c.chunk_text) > 20000 THEN substring(c.chunk_text FROM 1 FOR 20000)
             ELSE NULL
           END AS full_text,
           0.5::real AS score
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON kb.id = c.kb_id AND kb.is_active = true
    WHERE c.is_active = true
      AND c.label ILIKE '%' || substring(safe_q FROM 1 FOR 100) || '%'
      AND NOT EXISTS (SELECT 1 FROM fts_matches f WHERE f.chunk_id = c.id)
      AND (p_category IS NULL OR kb.category::text = p_category)
    LIMIT 20
  ),
  all_chunks AS (
    SELECT * FROM fts_matches UNION ALL SELECT * FROM label_matches
  ),
  ranked_chunks AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY kb_id ORDER BY score DESC) AS rn
    FROM all_chunks
  ),
  top_docs AS (
    SELECT kb_id, MAX(score) AS max_score
    FROM ranked_chunks GROUP BY kb_id
    ORDER BY max_score DESC
    LIMIT LEAST(p_limit_docs, 10)
  ),
  doc_chunks AS (
    SELECT rc.* FROM ranked_chunks rc
    JOIN top_docs td ON td.kb_id = rc.kb_id
    WHERE rc.rn <= LEAST(p_chunks_per_doc, 5)
  )
  SELECT jsonb_build_object(
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', kb.id, 'title', kb.title, 'category', kb.category,
        'source_name', kb.source_name, 'article_number', kb.article_number,
        'source_url', kb.source_url, 'max_score', td.max_score
      ) ORDER BY td.max_score DESC)
      FROM top_docs td JOIN knowledge_base kb ON kb.id = td.kb_id
    ), '[]'::jsonb),
    'chunks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'doc_id', dc.kb_id, 'chunk_index', dc.chunk_index,
        'chunk_type', dc.chunk_type, 'label', dc.label,
        'char_start', dc.char_start, 'excerpt', dc.excerpt,
        'full_text', dc.full_text, 'score', dc.score
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
      or_fts AS (
        SELECT c.id AS chunk_id, c.kb_id, c.chunk_index, c.chunk_type, c.label,
               c.char_start,
               substring(c.chunk_text FROM 1 FOR 500) AS excerpt,
               CASE
                 WHEN c.chunk_type = 'article' AND length(c.chunk_text) <= 20000 THEN c.chunk_text
                 WHEN c.chunk_type = 'article' AND length(c.chunk_text) > 20000 THEN substring(c.chunk_text FROM 1 FOR 20000)
                 ELSE NULL
               END AS full_text,
               ts_rank_cd(to_tsvector('simple', public.immutable_unaccent(c.chunk_text)), tsq_or) AS score
        FROM knowledge_base_chunks c
        JOIN knowledge_base kb ON kb.id = c.kb_id AND kb.is_active = true
        WHERE c.is_active = true
          AND to_tsvector('simple', public.immutable_unaccent(c.chunk_text)) @@ tsq_or
          AND (p_category IS NULL OR kb.category::text = p_category)
          AND c.kb_id NOT IN (SELECT id FROM existing_ids)
        ORDER BY score DESC
        LIMIT 30
      ),
      or_ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY kb_id ORDER BY score DESC) AS rn FROM or_fts
      ),
      or_top AS (
        SELECT kb_id, MAX(score) AS max_score FROM or_ranked GROUP BY kb_id
        ORDER BY max_score DESC
        LIMIT GREATEST(LEAST(p_limit_docs, 10) - and_doc_count, 0)
      ),
      or_doc_chunks AS (
        SELECT rc.* FROM or_ranked rc JOIN or_top td ON td.kb_id = rc.kb_id
        WHERE rc.rn <= LEAST(p_chunks_per_doc, 5)
      )
      SELECT jsonb_build_object(
        'documents', (result->'documents') || COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', kb.id, 'title', kb.title, 'category', kb.category,
            'source_name', kb.source_name, 'article_number', kb.article_number,
            'source_url', kb.source_url, 'max_score', td.max_score
          ) ORDER BY td.max_score DESC)
          FROM or_top td JOIN knowledge_base kb ON kb.id = td.kb_id
        ), '[]'::jsonb),
        'chunks', (result->'chunks') || COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'doc_id', dc.kb_id, 'chunk_index', dc.chunk_index,
            'chunk_type', dc.chunk_type, 'label', dc.label,
            'char_start', dc.char_start, 'excerpt', dc.excerpt,
            'full_text', dc.full_text, 'score', dc.score
          ) ORDER BY dc.score DESC)
          FROM or_doc_chunks dc
        ), '[]'::jsonb)
      ) INTO result;
    END IF;
  END IF;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_kb_chunks(text, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_kb_chunks(text, text, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_kb_chunks(text, text, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_kb_chunks(text, text, integer, integer, integer) TO service_role;
