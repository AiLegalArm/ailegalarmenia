-- Add echr_article to store article codes array for ECHR cases.

ALTER TABLE public.legal_practice_kb
ADD COLUMN IF NOT EXISTS echr_article TEXT[];

COMMENT ON COLUMN public.legal_practice_kb.echr_article IS
  'ECHR article codes (canonical), e.g. [\"p1-1\", \"13\"].';

