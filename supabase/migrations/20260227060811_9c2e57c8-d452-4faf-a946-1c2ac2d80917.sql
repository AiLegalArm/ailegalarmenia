
-- RPC: get KB doc IDs that have no chunks (batch, for enqueue)
CREATE OR REPLACE FUNCTION public.get_kb_docs_without_chunks(batch_limit integer DEFAULT 2000)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT kb.id
  FROM public.knowledge_base kb
  WHERE kb.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.knowledge_base_chunks c WHERE c.kb_id = kb.id
    )
  LIMIT batch_limit;
$$;
