-- RPC: find KB docs without v1 chunks (cursor-paginated)
CREATE OR REPLACE FUNCTION public.get_kb_docs_without_v1_chunks(
  p_cursor uuid DEFAULT '00000000-0000-0000-0000-000000000000',
  p_limit integer DEFAULT 2000
)
RETURNS TABLE(id uuid) 
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kb.id
  FROM knowledge_base kb
  WHERE kb.is_active = true
    AND kb.id > p_cursor
    AND NOT EXISTS (
      SELECT 1 FROM knowledge_base_chunks c
      WHERE c.kb_id = kb.id AND c.rechunk_version = 'v1'
    )
  ORDER BY kb.id
  LIMIT p_limit;
$$;

-- RPC: find practice docs without v1 chunks (cursor-paginated)
CREATE OR REPLACE FUNCTION public.get_practice_docs_without_v1_chunks(
  p_cursor uuid DEFAULT '00000000-0000-0000-0000-000000000000',
  p_limit integer DEFAULT 2000
)
RETURNS TABLE(id uuid) 
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lp.id
  FROM legal_practice_kb lp
  WHERE lp.is_active = true
    AND lp.id > p_cursor
    AND NOT EXISTS (
      SELECT 1 FROM legal_practice_kb_chunks c
      WHERE c.doc_id = lp.id AND c.rechunk_version = 'v1'
    )
  ORDER BY lp.id
  LIMIT p_limit;
$$;

-- Advisory lock helper for backfill (lock_id = 8675309 arbitrary)
CREATE OR REPLACE FUNCTION public.try_backfill_lock()
RETURNS boolean
LANGUAGE sql VOLATILE
AS $$
  SELECT pg_try_advisory_lock(8675309);
$$;

CREATE OR REPLACE FUNCTION public.release_backfill_lock()
RETURNS void
LANGUAGE sql VOLATILE
AS $$
  SELECT pg_advisory_unlock(8675309);
$$;