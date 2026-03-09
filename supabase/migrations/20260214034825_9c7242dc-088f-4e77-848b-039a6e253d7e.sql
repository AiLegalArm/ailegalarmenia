-- Add content_hash column to knowledge_base for dedup
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS content_hash text;

-- Add content_hash column to legal_practice_kb for dedup  
ALTER TABLE public.legal_practice_kb
  ADD COLUMN IF NOT EXISTS content_hash text;

-- Create indexes for fast dedup lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_hash 
  ON public.knowledge_base (content_hash) WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_legal_practice_kb_content_hash 
  ON public.legal_practice_kb (content_hash) WHERE content_hash IS NOT NULL;