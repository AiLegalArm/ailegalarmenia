-- Reset KB/practice content for a clean restart and align embeddings to text-embedding-3-small.

TRUNCATE TABLE
  public.kb_versions,
  public.knowledge_base_chunks,
  public.knowledge_base,
  public.legal_practice_kb_chunks,
  public.legal_practice_kb,
  public.legal_chunks,
  public.practice_chunk_jobs,
  public.legal_documents
RESTART IDENTITY CASCADE;

ALTER TABLE public.knowledge_base
  ALTER COLUMN embedding TYPE vector(1536)
  USING NULL::vector(1536);

ALTER TABLE public.legal_practice_kb
  ALTER COLUMN embedding TYPE vector(1536)
  USING NULL::vector(1536);

ALTER TABLE public.legal_chunks
  ALTER COLUMN embedding TYPE vector(1536)
  USING NULL::vector(1536);

DROP INDEX IF EXISTS public.idx_kb_embedding_hnsw_half;
DROP INDEX IF EXISTS public.idx_practice_embedding_hnsw_half;
DROP INDEX IF EXISTS public.idx_chunks_embedding_hnsw_half;
DROP INDEX IF EXISTS public.idx_legal_chunks_embedding;

CREATE INDEX IF NOT EXISTS idx_kb_embedding_hnsw_half
ON public.knowledge_base
USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_practice_embedding_hnsw_half
ON public.legal_practice_kb
USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw_half
ON public.legal_chunks
USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding vector,
  match_count integer DEFAULT 10,
  match_threshold double precision DEFAULT 0.3
)
RETURNS TABLE(
  id uuid,
  title text,
  content_text text,
  category kb_category,
  source_name text,
  version_date date,
  similarity double precision
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    kb.id,
    kb.title,
    kb.content_text,
    kb.category,
    kb.source_name,
    kb.version_date,
    (1 - (kb.embedding::halfvec(1536) <=> query_embedding::halfvec(1536)))::float AS similarity
  FROM public.knowledge_base kb
  WHERE kb.is_active = true
    AND kb.embedding IS NOT NULL
    AND (1 - (kb.embedding::halfvec(1536) <=> query_embedding::halfvec(1536))) > match_threshold
  ORDER BY kb.embedding::halfvec(1536) <=> query_embedding::halfvec(1536)
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_legal_practice(
  query_embedding vector,
  match_count integer DEFAULT 10,
  match_threshold double precision DEFAULT 0.3,
  category_filter text DEFAULT NULL
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
  content_snippet text,
  similarity double precision,
  decision_date date,
  case_number_anonymized text,
  court_name text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    lp.id,
    lp.title,
    lp.practice_category,
    lp.court_type,
    lp.outcome,
    lp.applied_articles,
    lp.key_violations,
    lp.legal_reasoning_summary,
    LEFT(lp.content_text, 500) AS content_snippet,
    (1 - (lp.embedding::halfvec(1536) <=> query_embedding::halfvec(1536)))::float AS similarity,
    lp.decision_date,
    lp.case_number_anonymized,
    lp.court_name
  FROM public.legal_practice_kb lp
  WHERE lp.is_active = true
    AND lp.embedding IS NOT NULL
    AND (1 - (lp.embedding::halfvec(1536) <=> query_embedding::halfvec(1536))) > match_threshold
    AND (category_filter IS NULL OR lp.practice_category::text = category_filter)
  ORDER BY lp.embedding::halfvec(1536) <=> query_embedding::halfvec(1536)
  LIMIT match_count;
$$;

DROP FUNCTION IF EXISTS public.search_legal_chunks(vector(768), integer, double precision, text[], text[], text, integer, integer);
DROP FUNCTION IF EXISTS public.search_legal_chunks(vector, integer, double precision, text[], text[], text, integer, integer);

CREATE FUNCTION public.search_legal_chunks(
  query_embedding vector,
  match_count integer DEFAULT 20,
  match_threshold double precision DEFAULT 0.3,
  filter_doc_types text[] DEFAULT NULL,
  filter_chunk_types text[] DEFAULT NULL,
  filter_norm_article text DEFAULT NULL,
  legislation_budget integer DEFAULT 10,
  practice_budget integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      (1 - (lc.embedding::halfvec(1536) <=> query_embedding::halfvec(1536)))::float AS similarity,
      CASE
        WHEN lc.doc_type = ANY(legislation_types) THEN 'legislation'
        ELSE 'practice'
      END AS bucket,
      row_number() OVER (
        PARTITION BY lc.doc_id
        ORDER BY lc.embedding::halfvec(1536) <=> query_embedding::halfvec(1536)
      ) AS doc_rank
    FROM public.legal_chunks lc
    WHERE lc.is_active = true
      AND lc.embedding IS NOT NULL
      AND (1 - (lc.embedding::halfvec(1536) <=> query_embedding::halfvec(1536))) > match_threshold
      AND (filter_doc_types IS NULL OR lc.doc_type = ANY(filter_doc_types))
      AND (filter_chunk_types IS NULL OR lc.chunk_type = ANY(filter_chunk_types))
      AND (
        filter_norm_article IS NULL
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(lc.norm_refs, '[]'::jsonb)) AS ref
          WHERE ref ->> 'article' = filter_norm_article
        )
      )
  ),
  deduped AS (
    SELECT *
    FROM ranked
    WHERE doc_rank = 1
    ORDER BY similarity DESC
    LIMIT match_count * 4
  ),
  legislation AS (
    SELECT *
    FROM deduped
    WHERE bucket = 'legislation'
    ORDER BY similarity DESC
    LIMIT legislation_budget
  ),
  practice AS (
    SELECT *
    FROM deduped
    WHERE bucket = 'practice'
    ORDER BY similarity DESC
    LIMIT practice_budget
  )
  SELECT jsonb_build_object(
    'legislation', COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM legislation l), '[]'::jsonb),
    'practice', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM practice p), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.match_knowledge_base(vector, integer, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_knowledge_base(vector, integer, double precision) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.match_legal_practice(vector, integer, double precision, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_legal_practice(vector, integer, double precision, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_legal_chunks(vector, integer, double precision, text[], text[], text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_legal_chunks(vector, integer, double precision, text[], text[], text, integer, integer) TO authenticated, service_role;
