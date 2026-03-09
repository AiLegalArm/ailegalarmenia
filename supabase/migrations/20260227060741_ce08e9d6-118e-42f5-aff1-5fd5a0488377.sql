
-- RPC: count KB docs that have zero chunks
CREATE OR REPLACE FUNCTION public.count_kb_docs_without_chunks()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)
  FROM public.knowledge_base kb
  WHERE kb.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.knowledge_base_chunks c WHERE c.kb_id = kb.id
    );
$$;

-- RPC: average chunks per KB doc (only docs that have chunks)
CREATE OR REPLACE FUNCTION public.avg_chunks_per_kb_doc()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(ROUND(AVG(cnt), 1), 0)
  FROM (
    SELECT count(*) AS cnt
    FROM public.knowledge_base_chunks
    GROUP BY kb_id
  ) sub;
$$;
