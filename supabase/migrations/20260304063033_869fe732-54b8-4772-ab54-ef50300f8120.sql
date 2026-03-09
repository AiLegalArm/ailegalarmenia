
-- Update backfill detection RPCs to look for v3.x chunks (new Armenian-only chunker)
CREATE OR REPLACE FUNCTION public.get_kb_docs_without_v1_chunks(
  p_cursor uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  p_limit integer DEFAULT 2000
)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT kb.id
  FROM knowledge_base kb
  WHERE kb.is_active = true
    AND kb.id > p_cursor
    AND NOT EXISTS (
      SELECT 1 FROM knowledge_base_chunks c
      WHERE c.kb_id = kb.id AND c.rechunk_version LIKE 'v3.%'
    )
  ORDER BY kb.id
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.get_practice_docs_without_v1_chunks(
  p_cursor uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  p_limit integer DEFAULT 2000
)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT lp.id
  FROM legal_practice_kb lp
  WHERE lp.is_active = true
    AND lp.id > p_cursor
    AND NOT EXISTS (
      SELECT 1 FROM legal_practice_kb_chunks c
      WHERE c.doc_id = lp.id AND c.rechunk_version LIKE 'v3.%'
    )
  ORDER BY lp.id
  LIMIT p_limit;
$function$;
