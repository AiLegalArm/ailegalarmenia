
DROP FUNCTION IF EXISTS public.search_knowledge_base(text, integer);

CREATE FUNCTION public.search_knowledge_base(search_query text, result_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, title text, content_text text, category public.kb_category, source_name text, version_date text, rank real)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kb.id,
    kb.title,
    kb.content_text,
    kb.category,
    kb.source_name,
    kb.version_date,
    GREATEST(
      ts_rank(
        to_tsvector('simple', kb.title || ' ' || kb.content_text),
        plainto_tsquery('simple', search_query)
      ),
      CASE WHEN lower(kb.title) LIKE '%' || lower(search_query) || '%' THEN 0.5 ELSE 0.0 END,
      CASE WHEN lower(kb.content_text) LIKE '%' || lower(search_query) || '%' THEN 0.3 ELSE 0.0 END
    )::real as rank
  FROM public.knowledge_base kb
  WHERE 
    kb.is_active = true
    AND (
      to_tsvector('simple', kb.title || ' ' || kb.content_text) 
      @@ plainto_tsquery('simple', search_query)
      OR lower(kb.title) LIKE '%' || lower(search_query) || '%'
      OR lower(kb.content_text) LIKE '%' || lower(search_query) || '%'
    )
  ORDER BY rank DESC
  LIMIT result_limit;
END;
$$;
