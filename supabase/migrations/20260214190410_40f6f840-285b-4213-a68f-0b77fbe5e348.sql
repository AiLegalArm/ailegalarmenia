
CREATE OR REPLACE FUNCTION public.search_kb_chunks(
  p_query TEXT,
  p_category TEXT DEFAULT NULL,
  p_limit_chunks INT DEFAULT 50,
  p_limit_docs INT DEFAULT 10,
  p_chunks_per_doc INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  safe_query TEXT;
BEGIN
  -- Auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Sanitize query
  safe_query := substring(trim(p_query) FROM 1 FOR 200);

  WITH ranked_chunks AS (
    SELECT
      c.id AS chunk_id,
      c.kb_id,
      c.chunk_index,
      c.chunk_type,
      c.label,
      c.char_start,
      substring(c.chunk_text FROM 1 FOR 500) AS excerpt,
      CASE WHEN c.chunk_type = 'article' THEN c.chunk_text ELSE NULL END AS full_text,
      ts_rank(
        to_tsvector('simple', c.chunk_text),
        plainto_tsquery('simple', safe_query)
      ) AS score,
      ROW_NUMBER() OVER (
        PARTITION BY c.kb_id
        ORDER BY ts_rank(to_tsvector('simple', c.chunk_text), plainto_tsquery('simple', safe_query)) DESC
      ) AS rn
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON kb.id = c.kb_id AND kb.is_active = true
    WHERE c.is_active = true
      AND (
        to_tsvector('simple', c.chunk_text) @@ plainto_tsquery('simple', safe_query)
        OR c.chunk_text ILIKE '%' || substring(safe_query FROM 1 FOR 100) || '%'
      )
      AND (p_category IS NULL OR kb.category::text = p_category)
    ORDER BY score DESC
    LIMIT LEAST(p_limit_chunks, 50)
  ),
  top_docs AS (
    SELECT kb_id, MAX(score) AS max_score
    FROM ranked_chunks
    GROUP BY kb_id
    ORDER BY max_score DESC
    LIMIT LEAST(p_limit_docs, 10)
  ),
  doc_chunks AS (
    SELECT rc.*
    FROM ranked_chunks rc
    JOIN top_docs td ON td.kb_id = rc.kb_id
    WHERE rc.rn <= LEAST(p_chunks_per_doc, 5)
  )
  SELECT jsonb_build_object(
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', kb.id,
        'title', kb.title,
        'category', kb.category,
        'source_name', kb.source_name,
        'article_number', kb.article_number,
        'source_url', kb.source_url,
        'max_score', td.max_score
      ) ORDER BY td.max_score DESC)
      FROM top_docs td
      JOIN knowledge_base kb ON kb.id = td.kb_id
    ), '[]'::jsonb),
    'chunks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'doc_id', dc.kb_id,
        'chunk_index', dc.chunk_index,
        'chunk_type', dc.chunk_type,
        'label', dc.label,
        'char_start', dc.char_start,
        'excerpt', dc.excerpt,
        'full_text', dc.full_text,
        'score', dc.score
      ) ORDER BY dc.score DESC)
      FROM doc_chunks dc
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;
