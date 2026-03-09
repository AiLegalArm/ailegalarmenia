
-- Revoke PUBLIC execute and grant only to authenticated + service_role
REVOKE EXECUTE ON FUNCTION public.search_legal_practice_kb(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_legal_practice_kb(text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_legal_practice_kb(text, text, integer) TO service_role;

-- Also lock down search_legal_practice (older RPC, same pattern)
REVOKE EXECUTE ON FUNCTION public.search_legal_practice(text, practice_category, court_type, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_legal_practice(text, practice_category, court_type, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_legal_practice(text, practice_category, court_type, integer) TO service_role;

-- Also lock down search_kb_chunks
REVOKE EXECUTE ON FUNCTION public.search_kb_chunks(text, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_kb_chunks(text, text, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_kb_chunks(text, text, integer, integer, integer) TO service_role;

-- Also lock down get_kb_chunk_full
REVOKE EXECUTE ON FUNCTION public.get_kb_chunk_full(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kb_chunk_full(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kb_chunk_full(uuid, integer) TO service_role;

-- Also lock down get_kb_chunk
REVOKE EXECUTE ON FUNCTION public.get_kb_chunk(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kb_chunk(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kb_chunk(uuid, integer) TO service_role;
