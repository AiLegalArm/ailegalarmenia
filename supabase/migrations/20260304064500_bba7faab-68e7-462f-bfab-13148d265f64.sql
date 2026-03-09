-- Add source_anchor, rechunk_version, overlap_prev to legal_chunks
ALTER TABLE public.legal_chunks
  ADD COLUMN IF NOT EXISTS source_anchor text,
  ADD COLUMN IF NOT EXISTS rechunk_version text DEFAULT 'v2-am-ultra',
  ADD COLUMN IF NOT EXISTS overlap_prev integer DEFAULT 0;

-- Add indexes on rechunk_version for all chunk tables
CREATE INDEX IF NOT EXISTS idx_legal_chunks_rechunk_version ON public.legal_chunks (rechunk_version);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_rechunk_version ON public.knowledge_base_chunks (rechunk_version);
CREATE INDEX IF NOT EXISTS idx_legal_practice_kb_chunks_rechunk_version ON public.legal_practice_kb_chunks (rechunk_version);