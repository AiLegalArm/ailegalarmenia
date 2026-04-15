-- Add decision_map JSONB to store structured ECHR case record (HY-out-shape),
-- preserving the original out.jsonl structure in Armenian only.

ALTER TABLE public.legal_practice_kb
ADD COLUMN IF NOT EXISTS decision_map JSONB;

COMMENT ON COLUMN public.legal_practice_kb.decision_map IS
  'Structured Armenian-only ECHR out.jsonl-shaped record (no *_hy keys).';

