-- Add new categories to kb_category enum
-- 1. ՀՀ DELAYS Տdelays DELAYS КАН ОРЕНСГИРК (Судебный кодекс РА)
-- 2. ՀՀ САХMANАДRAKАН DELAYS ОРЕНКЕ (Конституционный закон РА)

ALTER TYPE public.kb_category ADD VALUE IF NOT EXISTS 'judicial_code';
ALTER TYPE public.kb_category ADD VALUE IF NOT EXISTS 'constitutional_law';