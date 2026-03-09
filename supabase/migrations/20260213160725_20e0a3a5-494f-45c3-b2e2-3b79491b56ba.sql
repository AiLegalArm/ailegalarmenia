
-- =============================================
-- LEGISLATION VERSIONING: temporal validity for knowledge_base
-- =============================================

-- 1. Add versioning columns
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS supersedes_doc_id uuid REFERENCES public.knowledge_base(id);

-- 2. Index for efficient temporal queries
CREATE INDEX IF NOT EXISTS idx_kb_effective_range
  ON public.knowledge_base(effective_from, effective_to)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_kb_supersedes
  ON public.knowledge_base(supersedes_doc_id)
  WHERE supersedes_doc_id IS NOT NULL;

-- 3. Replace search_knowledge_base with date-aware version
DROP FUNCTION IF EXISTS public.search_knowledge_base(text, integer);

CREATE FUNCTION public.search_knowledge_base(
  search_query text,
  result_limit integer DEFAULT 50,
  reference_date date DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  title text,
  content_text text,
  category public.kb_category,
  source_name text,
  version_date date,
  effective_from date,
  effective_to date,
  is_current boolean,
  rank real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_date date;
BEGIN
  -- If no reference_date provided, use current date
  ref_date := COALESCE(reference_date, CURRENT_DATE);

  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.content_text,
    kb.category,
    kb.source_name,
    kb.version_date,
    kb.effective_from,
    kb.effective_to,
    -- is_current = true when this version covers the reference date
    (
      (kb.effective_from IS NULL OR kb.effective_from <= ref_date)
      AND (kb.effective_to IS NULL OR kb.effective_to >= ref_date)
    ) AS is_current,
    GREATEST(
      ts_rank(
        to_tsvector('simple', kb.title || ' ' || COALESCE(kb.content_text, '')),
        plainto_tsquery('simple', search_query)
      ),
      CASE WHEN lower(kb.title) LIKE '%' || lower(search_query) || '%' THEN 0.5 ELSE 0.0 END,
      CASE WHEN lower(COALESCE(kb.content_text, '')) LIKE '%' || lower(search_query) || '%' THEN 0.3 ELSE 0.0 END
    )::real AS rank
  FROM public.knowledge_base kb
  WHERE
    kb.is_active = true
    -- Temporal filter: prefer docs effective at ref_date, but allow NULL (unversioned) docs
    AND (
      kb.effective_from IS NULL
      OR kb.effective_from <= ref_date
    )
    AND (
      kb.effective_to IS NULL
      OR kb.effective_to >= ref_date
    )
    AND (
      to_tsvector('simple', kb.title || ' ' || COALESCE(kb.content_text, ''))
      @@ plainto_tsquery('simple', search_query)
      OR lower(kb.title) LIKE '%' || lower(search_query) || '%'
      OR lower(COALESCE(kb.content_text, '')) LIKE '%' || lower(search_query) || '%'
    )
  ORDER BY
    -- Prioritize docs with explicit temporal validity
    CASE WHEN kb.effective_from IS NOT NULL THEN 0 ELSE 1 END ASC,
    rank DESC
  LIMIT result_limit;
END;
$$;
