
-- ============================================================
-- Harden legal_chunks RLS + search_legal_chunks RPC
-- Problem: anon can execute RPC; FORCE ROW LEVEL SECURITY missing;
--          non-deterministic sort on similarity ties.
-- ============================================================

-- 1) Force RLS even for table owner
ALTER TABLE public.legal_chunks FORCE ROW LEVEL SECURITY;

-- 2) Recreate function with deterministic ordering (id ASC tie-breaker)
--    Keep SECURITY DEFINER because edge functions call via service_role,
--    but the function already filters is_active=true explicitly.
--    API signature and output JSON structure are unchanged.
CREATE OR REPLACE FUNCTION public.search_legal_chunks(
  query_embedding vector,
  match_count integer DEFAULT 20,
  match_threshold double precision DEFAULT 0.3,
  filter_doc_types text[] DEFAULT NULL::text[],
  filter_chunk_types text[] DEFAULT NULL::text[],
  filter_norm_article text DEFAULT NULL::text,
  legislation_budget integer DEFAULT 10,
  practice_budget integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  legislation_types text[] := ARRAY[
    'law', 'code', 'government_decree', 'pm_decision',
    'regulation', 'international_treaty', 'other'
  ];
  practice_types text[] := ARRAY[
    'court_decision', 'constitutional_court', 'echr_judgment',
    'legal_commentary', 'cassation_ruling', 'appeal_ruling',
    'first_instance_ruling'
  ];
  result jsonb;
BEGIN
  -- Guard: require authenticated caller
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH ranked AS (
    SELECT
      lc.id,
      lc.doc_id,
      lc.doc_type,
      lc.chunk_index,
      lc.chunk_type,
      lc.chunk_text,
      lc.label,
      lc.metadata,
      lc.norm_refs,
      lc.char_start,
      lc.char_end,
      (1 - (lc.embedding <=> query_embedding))::float AS similarity,
      CASE
        WHEN lc.doc_type = ANY(legislation_types) THEN 'legislation'
        ELSE 'practice'
      END AS bucket
    FROM public.legal_chunks lc
    WHERE lc.is_active = true
      AND lc.embedding IS NOT NULL
      AND (1 - (lc.embedding <=> query_embedding)) > match_threshold
      AND (filter_doc_types IS NULL OR lc.doc_type = ANY(filter_doc_types))
      AND (filter_chunk_types IS NULL OR lc.chunk_type = ANY(filter_chunk_types))
      AND (
        filter_norm_article IS NULL
        OR lc.norm_refs @> jsonb_build_array(jsonb_build_object('article', filter_norm_article))
      )
    ORDER BY lc.embedding <=> query_embedding, lc.id ASC
    LIMIT match_count * 2
  ),
  deduped AS (
    SELECT DISTINCT ON (bucket, doc_id) *
    FROM ranked
    ORDER BY bucket, doc_id, similarity DESC, id ASC
  ),
  legislation AS (
    SELECT *
    FROM deduped
    WHERE bucket = 'legislation'
    ORDER BY similarity DESC, id ASC
    LIMIT legislation_budget
  ),
  practice AS (
    SELECT *
    FROM deduped
    WHERE bucket = 'practice'
    ORDER BY similarity DESC, id ASC
    LIMIT practice_budget
  )
  SELECT jsonb_build_object(
    'legislation', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id,
        'doc_id', l.doc_id,
        'doc_type', l.doc_type,
        'chunk_index', l.chunk_index,
        'chunk_type', l.chunk_type,
        'chunk_text', l.chunk_text,
        'label', l.label,
        'metadata', l.metadata,
        'norm_refs', l.norm_refs,
        'similarity', l.similarity
      ) ORDER BY l.similarity DESC, l.id ASC)
      FROM legislation l
    ), '[]'::jsonb),
    'practice', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'doc_id', p.doc_id,
        'doc_type', p.doc_type,
        'chunk_index', p.chunk_index,
        'chunk_type', p.chunk_type,
        'chunk_text', p.chunk_text,
        'label', p.label,
        'metadata', p.metadata,
        'norm_refs', p.norm_refs,
        'similarity', p.similarity
      ) ORDER BY p.similarity DESC, p.id ASC)
      FROM practice p
    ), '[]'::jsonb),
    'total_legislation', (SELECT count(*) FROM legislation),
    'total_practice', (SELECT count(*) FROM practice)
  ) INTO result;

  RETURN result;
END;
$function$;

-- 3) Revoke execute from public/anon, grant only to authenticated + service_role
REVOKE ALL ON FUNCTION public.search_legal_chunks(vector, integer, double precision, text[], text[], text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_legal_chunks(vector, integer, double precision, text[], text[], text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_legal_chunks(vector, integer, double precision, text[], text[], text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_legal_chunks(vector, integer, double precision, text[], text[], text, integer, integer) TO service_role;
