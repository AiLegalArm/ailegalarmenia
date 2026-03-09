
-- Add embedding_status to knowledge_base and legal_practice_kb
-- Values: 'pending' (default, no embedding yet), 'success' (valid embedding), 'failed' (dead-letter)

-- knowledge_base
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'success', 'failed')),
  ADD COLUMN IF NOT EXISTS embedding_error text,
  ADD COLUMN IF NOT EXISTS embedding_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding_last_attempt timestamptz;

-- legal_practice_kb
ALTER TABLE public.legal_practice_kb
  ADD COLUMN IF NOT EXISTS embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'success', 'failed')),
  ADD COLUMN IF NOT EXISTS embedding_error text,
  ADD COLUMN IF NOT EXISTS embedding_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding_last_attempt timestamptz;

-- Backfill: docs with valid embeddings → 'success', without → 'pending'
UPDATE public.knowledge_base SET embedding_status = 'success' WHERE embedding IS NOT NULL AND embedding_status = 'pending';
UPDATE public.legal_practice_kb SET embedding_status = 'success' WHERE embedding IS NOT NULL AND embedding_status = 'pending';

-- Index for efficient batch queries (find pending/failed docs)
CREATE INDEX IF NOT EXISTS idx_kb_embedding_status ON public.knowledge_base(embedding_status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_practice_embedding_status ON public.legal_practice_kb(embedding_status) WHERE is_active = true;
