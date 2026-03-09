-- Create missing RPC: get_practice_docs_without_chunks
-- Returns IDs of active legal_practice_kb docs that have no rows in legal_practice_kb_chunks
CREATE OR REPLACE FUNCTION public.get_practice_docs_without_chunks(batch_limit integer DEFAULT 2000)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM legal_practice_kb p
  WHERE p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM legal_practice_kb_chunks c WHERE c.doc_id = p.id
    )
  ORDER BY p.created_at ASC
  LIMIT batch_limit;
$$;

-- Also create count variant
CREATE OR REPLACE FUNCTION public.count_docs_without_chunks()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)
  FROM legal_practice_kb p
  WHERE p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM legal_practice_kb_chunks c WHERE c.doc_id = p.id
    );
$$;

-- Create avg_chunks_per_practice_doc
CREATE OR REPLACE FUNCTION public.avg_chunks_per_practice_doc()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(avg(cnt), 0)
  FROM (
    SELECT count(*) as cnt
    FROM legal_practice_kb_chunks
    GROUP BY doc_id
  ) sub;
$$;