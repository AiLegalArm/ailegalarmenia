
-- Batch RPC to get true chunk counts from legal_practice_kb_chunks table
-- This is needed because content_chunks array on legal_practice_kb is empty for all docs

CREATE OR REPLACE FUNCTION public.get_practice_total_chunks(p_ids uuid[])
RETURNS TABLE(id uuid, total_chunks integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.doc_id AS id, COUNT(*)::integer AS total_chunks
  FROM public.legal_practice_kb_chunks c
  WHERE c.doc_id = ANY(p_ids)
  GROUP BY c.doc_id;
$$;

-- Restrict execution to authenticated and service_role only
REVOKE ALL ON FUNCTION public.get_practice_total_chunks(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_practice_total_chunks(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_practice_total_chunks(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_total_chunks(uuid[]) TO service_role;
