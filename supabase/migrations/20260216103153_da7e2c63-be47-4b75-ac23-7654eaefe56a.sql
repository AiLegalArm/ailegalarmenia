
-- Explicitly revoke from anon role
REVOKE EXECUTE ON FUNCTION public.search_legal_practice_kb(text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_legal_practice(text, practice_category, court_type, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_kb_chunks(text, text, integer, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_kb_chunk_full(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_kb_chunk(uuid, integer) FROM anon;
