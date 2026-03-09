
-- Add rechunk_version and source_anchor to chunk tables
ALTER TABLE knowledge_base_chunks 
  ADD COLUMN IF NOT EXISTS source_anchor text,
  ADD COLUMN IF NOT EXISTS rechunk_version text DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS overlap_prev integer DEFAULT 0;

ALTER TABLE legal_practice_kb_chunks
  ADD COLUMN IF NOT EXISTS source_anchor text,
  ADD COLUMN IF NOT EXISTS rechunk_version text DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS overlap_prev integer DEFAULT 0;

-- Index for rechunk version filtering
CREATE INDEX IF NOT EXISTS idx_kbc_rechunk ON knowledge_base_chunks(rechunk_version);
CREATE INDEX IF NOT EXISTS idx_lpkbc_rechunk ON legal_practice_kb_chunks(rechunk_version);
