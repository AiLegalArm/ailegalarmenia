
-- Ensure pg_trgm extension is available
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for ILIKE + similarity() performance
CREATE INDEX IF NOT EXISTS idx_lpk_title_trgm
  ON public.legal_practice_kb USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_lpk_description_trgm
  ON public.legal_practice_kb USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_lpk_reasoning_trgm
  ON public.legal_practice_kb USING gin (legal_reasoning_summary gin_trgm_ops);
