
-- Step 1: Enable unaccent extension in a dedicated schema (avoids public schema warning)
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;

-- Step 2: Create immutable wrapper (required for use in indexes — unaccent is STABLE, not IMMUTABLE)
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT extensions.unaccent($1) $$;

-- Step 3: Create new GIN index with unaccent (non-concurrent — Supabase migrations are transactional)
-- This replaces idx_legal_practice_kb_search functionally
CREATE INDEX IF NOT EXISTS idx_lpk_fts_unaccent
ON public.legal_practice_kb
USING gin (
  to_tsvector('simple',
    public.immutable_unaccent(
      title || ' ' || COALESCE(content_text, '') || ' ' || COALESCE(legal_reasoning_summary, '')
    )
  )
);

-- Step 4: Update RPC to use unaccent on both document and query side
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
  unaccented_q TEXT;
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

  -- ── UNACCENT query ──
  unaccented_q := public.immutable_unaccent(safe_q);

  -- ── QUERY PARSING ──
  IF safe_q ~ '"' OR (safe_q ~ ' ' AND length(safe_q) >= 12) THEN
    use_phrase := TRUE;
    stripped_q := public.immutable_unaccent(replace(safe_q, '"', ''));
  END IF;

  -- Build tsquery with fallback chain
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
    RETURN;
  END IF;

  -- ── MAIN QUERY ──
  -- Uses idx_lpk_fts_unaccent (GIN on immutable_unaccent(title+content+summary))
  RETURN QUERY
  SELECT
    lpk.id,
    lpk.title,
    lpk.practice_category,
    lpk.court_type,
    lpk.outcome,
    lpk.applied_articles,
    lpk.key_violations,
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
          public.immutable_unaccent(
            lpk.title || ' ' || COALESCE(lpk.content_text, '') || ' ' || COALESCE(lpk.legal_reasoning_summary, '')
          )
        ),
        tsq
      ) * 0.85
      + COALESCE(similarity(lpk.title, safe_q), 0) * 0.15
    )::real AS relevance_score
  FROM public.legal_practice_kb lpk
  WHERE lpk.is_active = true
    AND (category_filter IS NULL OR lpk.practice_category::text = category_filter)
    AND to_tsvector('simple',
          public.immutable_unaccent(
            lpk.title || ' ' || COALESCE(lpk.content_text, '') || ' ' || COALESCE(lpk.legal_reasoning_summary, '')
          )
        ) @@ tsq
  ORDER BY relevance_score DESC
  LIMIT LEAST(limit_docs, 50);
END;
$function$;

-- Step 5: Drop old index (now superseded by idx_lpk_fts_unaccent)
DROP INDEX IF EXISTS idx_legal_practice_kb_search;

-- Step 6: Clean up duplicate trgm indexes
DROP INDEX IF EXISTS idx_lpk_title_trgm;        -- duplicate of idx_legal_practice_kb_title_trgm
DROP INDEX IF EXISTS idx_lpk_description_trgm;   -- duplicate of idx_legal_practice_kb_desc_trgm
