
-- Step 1: Create unaccent FTS index on chunks table
CREATE INDEX IF NOT EXISTS idx_lp_kb_chunks_fts_unaccent
ON public.legal_practice_kb_chunks
USING gin (
  to_tsvector('simple', public.immutable_unaccent(chunk_text))
);

-- Step 2: Create chunk-level search RPC
CREATE OR REPLACE FUNCTION public.search_legal_practice_chunks(
  p_query text,
  category_filter text DEFAULT NULL::text,
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
  use_phrase   BOOLEAN := FALSE;
  stripped_q   TEXT;
  unaccented_q TEXT;
  result       JSONB;
BEGIN
  -- ── AUTH GUARD ──
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ── SANITIZE ──
  safe_q := regexp_replace(trim(p_query), '\s+', ' ', 'g');
  safe_q := substring(safe_q FROM 1 FOR 200);

  IF length(safe_q) < 2 THEN
    RETURN jsonb_build_object('documents', '[]'::jsonb, 'chunks', '[]'::jsonb);
  END IF;

  -- ── UNACCENT ──
  unaccented_q := public.immutable_unaccent(safe_q);

  -- ── QUERY PARSING ──
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

  -- ── MAIN PIPELINE ──
  WITH matching_chunks AS (
    -- Step A: find top chunks via FTS on unaccented index
    SELECT
      c.doc_id,
      c.chunk_index,
      substring(c.chunk_text FROM 1 FOR 600) AS excerpt,
      ts_rank_cd(
        to_tsvector('simple', public.immutable_unaccent(c.chunk_text)),
        tsq
      ) AS score
    FROM public.legal_practice_kb_chunks c
    JOIN public.legal_practice_kb lpk ON lpk.id = c.doc_id AND lpk.is_active = true
    WHERE to_tsvector('simple', public.immutable_unaccent(c.chunk_text)) @@ tsq
      AND (category_filter IS NULL OR lpk.practice_category::text = category_filter)
    ORDER BY score DESC
    LIMIT LEAST(p_limit_chunks, 300)
  ),
  ranked_chunks AS (
    -- Step B: cap chunks per doc
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY doc_id ORDER BY score DESC) AS rn
    FROM matching_chunks
  ),
  top_docs AS (
    -- Step C: top docs by max chunk score
    SELECT doc_id, MAX(score) AS max_score
    FROM ranked_chunks
    GROUP BY doc_id
    ORDER BY max_score DESC
    LIMIT LEAST(p_limit_docs, 50)
  ),
  doc_chunks AS (
    -- Step D: keep only chunks belonging to top docs, capped per doc
    SELECT rc.doc_id, rc.chunk_index, rc.excerpt, rc.score
    FROM ranked_chunks rc
    JOIN top_docs td ON td.doc_id = rc.doc_id
    WHERE rc.rn <= LEAST(p_chunks_per_doc, 8)
  )
  SELECT jsonb_build_object(
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', lpk.id,
        'title', lpk.title,
        'practice_category', lpk.practice_category,
        'court_type', lpk.court_type,
        'outcome', lpk.outcome,
        'decision_date', lpk.decision_date,
        'source_url', lpk.source_url,
        'max_score', td.max_score
      ) ORDER BY td.max_score DESC)
      FROM top_docs td
      JOIN public.legal_practice_kb lpk ON lpk.id = td.doc_id
    ), '[]'::jsonb),
    'chunks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'doc_id', dc.doc_id,
        'chunk_index', dc.chunk_index,
        'excerpt', dc.excerpt,
        'score', dc.score
      ) ORDER BY dc.score DESC)
      FROM doc_chunks dc
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;

-- Step 3: Lock down permissions
REVOKE EXECUTE ON FUNCTION public.search_legal_practice_chunks(text, text, integer, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_legal_practice_chunks(text, text, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_legal_practice_chunks(text, text, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_legal_practice_chunks(text, text, integer, integer, integer) TO service_role;

-- Step 4: Drop old plain FTS index (superseded by unaccent version)
DROP INDEX IF EXISTS idx_lp_kb_chunks_text_fts;
