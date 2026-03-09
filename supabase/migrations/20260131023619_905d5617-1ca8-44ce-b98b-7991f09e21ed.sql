-- Add new enum values to kb_category
ALTER TYPE public.kb_category ADD VALUE IF NOT EXISTS 'subsoil_code';
ALTER TYPE public.kb_category ADD VALUE IF NOT EXISTS 'penal_enforcement_code';
ALTER TYPE public.kb_category ADD VALUE IF NOT EXISTS 'constitutional_court_decisions';
ALTER TYPE public.kb_category ADD VALUE IF NOT EXISTS 'echr_judgments';
ALTER TYPE public.kb_category ADD VALUE IF NOT EXISTS 'government_decisions';
ALTER TYPE public.kb_category ADD VALUE IF NOT EXISTS 'central_electoral_commission_decisions';
ALTER TYPE public.kb_category ADD VALUE IF NOT EXISTS 'prime_minister_decisions';