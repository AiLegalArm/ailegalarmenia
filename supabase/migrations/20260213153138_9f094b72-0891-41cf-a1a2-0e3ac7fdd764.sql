
-- ============================================================
-- legal_chunks: Unified chunk index for dual-RAG retrieval
-- ============================================================
-- Problem: Legislation chunks (knowledge_base) and practice chunks
-- (legal_practice_kb_chunks) live in separate tables with different
-- schemas. RAG retrieval requires querying both, deduplicating,
-- and splitting into context buckets — impossible with current schema.
--
-- Solution: Single table with doc_type discriminator, vector index,
-- and an RPC that returns pre-split, deduplicated results.
-- ============================================================

CREATE TABLE public.legal_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_id uuid NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN (
    'law', 'code', 'court_decision', 'constitutional_court',
    'government_decree', 'pm_decision', 'regulation',
    'international_treaty', 'echr_judgment', 'legal_commentary',
    'cassation_ruling', 'appeal_ruling', 'first_instance_ruling', 'other'
  )),
  chunk_index integer NOT NULL DEFAULT 0,
  chunk_type text NOT NULL DEFAULT 'full_text' CHECK (chunk_type IN (
    'header', 'operative', 'reasoning', 'facts', 'dissent',
    'article', 'preamble', 'table', 'reference_list', 'full_text', 'other'
  )),
  chunk_text text NOT NULL,
  char_start integer NOT NULL DEFAULT 0,
  char_end integer NOT NULL DEFAULT 0,
  label text,
  embedding vector(768),
  metadata jsonb DEFAULT '{}'::jsonb,
  norm_refs jsonb DEFAULT '[]'::jsonb,
  chunk_hash text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_doc_chunk UNIQUE (doc_id, chunk_index)
);

-- Enable RLS
ALTER TABLE public.legal_chunks ENABLE ROW LEVEL SECURITY;

-- Public read for all authenticated users (knowledge is shared)
CREATE POLICY "Authenticated users can read legal chunks"
  ON public.legal_chunks
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admin-only write
CREATE POLICY "Admins can insert legal chunks"
  ON public.legal_chunks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update legal chunks"
  ON public.legal_chunks
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete legal chunks"
  ON public.legal_chunks
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role bypass for edge functions
CREATE POLICY "Service role full access"
  ON public.legal_chunks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── INDEXES ────────────────────────────────────────────────────────

-- Vector similarity search (HNSW for speed)
CREATE INDEX idx_legal_chunks_embedding
  ON public.legal_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Filter by doc_type (for bucket splitting)
CREATE INDEX idx_legal_chunks_doc_type
  ON public.legal_chunks (doc_type)
  WHERE is_active = true;

-- Lookup by doc_id
CREATE INDEX idx_legal_chunks_doc_id
  ON public.legal_chunks (doc_id);

-- Hash index for dedup
CREATE INDEX idx_legal_chunks_hash
  ON public.legal_chunks (chunk_hash)
  WHERE chunk_hash IS NOT NULL;

-- GIN index on norm_refs for article-based lookup
CREATE INDEX idx_legal_chunks_norm_refs
  ON public.legal_chunks
  USING gin (norm_refs jsonb_path_ops);

-- Updated_at trigger
CREATE TRIGGER update_legal_chunks_updated_at
  BEFORE UPDATE ON public.legal_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─── SEARCH RPC ─────────────────────────────────────────────────────
-- Returns top-K chunks split into legislation and practice buckets,
-- deduplicated by doc_id within each bucket.

CREATE OR REPLACE FUNCTION public.search_legal_chunks(
  query_embedding vector(768),
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
    ORDER BY lc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  -- Deduplicate: keep best chunk per doc_id per bucket
  deduped AS (
    SELECT DISTINCT ON (bucket, doc_id) *
    FROM ranked
    ORDER BY bucket, doc_id, similarity DESC
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
      ) ORDER BY l.similarity DESC)
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
      ) ORDER BY p.similarity DESC)
      FROM practice p
    ), '[]'::jsonb),
    'total_legislation', (SELECT count(*) FROM legislation),
    'total_practice', (SELECT count(*) FROM practice)
  ) INTO result;

  RETURN result;
END;
$$;
