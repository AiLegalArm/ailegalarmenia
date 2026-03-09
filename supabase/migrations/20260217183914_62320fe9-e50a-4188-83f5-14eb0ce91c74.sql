
-- Fix: return 0 for doc IDs that have no chunks (use unnest + LEFT JOIN)
CREATE OR REPLACE FUNCTION public.get_practice_total_chunks(p_ids uuid[])
RETURNS TABLE(id uuid, total_chunks integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT u.id, COALESCE(cnt.n, 0)::integer AS total_chunks
  FROM unnest(p_ids) AS u(id)
  LEFT JOIN (
    SELECT c.doc_id, COUNT(*)::integer AS n
    FROM public.legal_practice_kb_chunks c
    WHERE c.doc_id = ANY(p_ids)
    GROUP BY c.doc_id
  ) cnt ON cnt.doc_id = u.id;
$$;

-- Re-apply privileges (CREATE OR REPLACE resets defaults)
REVOKE ALL ON FUNCTION public.get_practice_total_chunks(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_practice_total_chunks(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_practice_total_chunks(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_practice_total_chunks(uuid[]) TO service_role;
