
-- Add unaccent GIN index on knowledge_base_chunks (non-concurrent, inside transaction)
CREATE INDEX IF NOT EXISTS idx_kb_chunks_fts_unaccent
ON public.knowledge_base_chunks
USING gin (to_tsvector('simple', public.immutable_unaccent(chunk_text)));
