
-- RPC: Get docs needing rechunk (legal_documents without v2-am-ultra chunks)
-- Paginated by id cursor, configurable limit
CREATE OR REPLACE FUNCTION public.get_docs_needing_rechunk(
  _target_version text DEFAULT 'v2-am-ultra',
  _cursor_id uuid DEFAULT '00000000-0000-0000-0000-000000000000',
  _page_size int DEFAULT 50,
  _source text DEFAULT 'legal_documents'
)
RETURNS TABLE(doc_id uuid, doc_type text, title text, content_length int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id AS doc_id,
    d.doc_type,
    d.title,
    length(d.content_text) AS content_length
  FROM public.legal_documents d
  WHERE d.id > _cursor_id
    AND d.is_active = true
    AND _source = 'legal_documents'
    AND NOT EXISTS (
      SELECT 1 FROM public.legal_chunks c
      WHERE c.doc_id = d.id
        AND c.rechunk_version = _target_version
    )
  ORDER BY d.id
  LIMIT _page_size;
$$;

-- RPC: Get KB docs needing rechunk
CREATE OR REPLACE FUNCTION public.get_kb_docs_needing_rechunk(
  _target_version text DEFAULT 'v2-am-ultra',
  _cursor_id uuid DEFAULT '00000000-0000-0000-0000-000000000000',
  _page_size int DEFAULT 50
)
RETURNS TABLE(doc_id uuid, title text, content_length int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id AS doc_id,
    d.title,
    length(d.content_text) AS content_length
  FROM public.knowledge_base d
  WHERE d.id > _cursor_id
    AND d.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.knowledge_base_chunks c
      WHERE c.kb_id = d.id
        AND c.rechunk_version = _target_version
    )
  ORDER BY d.id
  LIMIT _page_size;
$$;

-- RPC: Atomic replace chunks for a single doc (delete old + insert placeholder)
-- The actual insert of new chunks happens from the edge function after this call
CREATE OR REPLACE FUNCTION public.replace_doc_chunks(
  _doc_id uuid,
  _target_version text DEFAULT 'v2-am-ultra',
  _source text DEFAULT 'legal_documents'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  IF _source = 'legal_documents' THEN
    DELETE FROM public.legal_chunks
    WHERE doc_id = _doc_id
      AND (rechunk_version IS NULL OR rechunk_version <> _target_version);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  ELSIF _source = 'knowledge_base' THEN
    DELETE FROM public.knowledge_base_chunks
    WHERE kb_id = _doc_id
      AND (rechunk_version IS NULL OR rechunk_version <> _target_version);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Unknown source: %', _source;
  END IF;
  RETURN deleted_count;
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.get_docs_needing_rechunk TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kb_docs_needing_rechunk TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_doc_chunks TO service_role;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
