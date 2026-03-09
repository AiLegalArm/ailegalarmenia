-- Create translations cache table for ECHR field translations
CREATE TABLE IF NOT EXISTS public.translations_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE, -- sha256(text + fieldName)
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  field_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openai',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_translations_cache_key ON public.translations_cache(cache_key);

-- Enable RLS
ALTER TABLE public.translations_cache ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used from edge functions)
CREATE POLICY "Service role full access to translations cache"
  ON public.translations_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Admins can read cache
CREATE POLICY "Admins can read translations cache"
  ON public.translations_cache
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add ECHR translation tracking columns to legal_practice_kb if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'legal_practice_kb' AND column_name = 'translation_status'
  ) THEN
    ALTER TABLE public.legal_practice_kb ADD COLUMN translation_status TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'legal_practice_kb' AND column_name = 'translation_provider'
  ) THEN
    ALTER TABLE public.legal_practice_kb ADD COLUMN translation_provider TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'legal_practice_kb' AND column_name = 'translation_ts'
  ) THEN
    ALTER TABLE public.legal_practice_kb ADD COLUMN translation_ts TIMESTAMP WITH TIME ZONE DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'legal_practice_kb' AND column_name = 'translation_errors'
  ) THEN
    ALTER TABLE public.legal_practice_kb ADD COLUMN translation_errors TEXT DEFAULT NULL;
  END IF;

  -- Add *_hy sibling fields for Armenian translations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'legal_practice_kb' AND column_name = 'text_hy'
  ) THEN
    ALTER TABLE public.legal_practice_kb ADD COLUMN text_hy TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'legal_practice_kb' AND column_name = 'summary_hy'
  ) THEN
    ALTER TABLE public.legal_practice_kb ADD COLUMN summary_hy TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'legal_practice_kb' AND column_name = 'facts_hy'
  ) THEN
    ALTER TABLE public.legal_practice_kb ADD COLUMN facts_hy TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'legal_practice_kb' AND column_name = 'judgment_hy'
  ) THEN
    ALTER TABLE public.legal_practice_kb ADD COLUMN judgment_hy TEXT DEFAULT NULL;
  END IF;

  -- echr_case_id for idempotent upsert
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'legal_practice_kb' AND column_name = 'echr_case_id'
  ) THEN
    ALTER TABLE public.legal_practice_kb ADD COLUMN echr_case_id TEXT DEFAULT NULL;
  END IF;
END $$;

-- Unique index for idempotent upsert on ECHR case ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_practice_kb_echr_case_id
  ON public.legal_practice_kb(echr_case_id)
  WHERE echr_case_id IS NOT NULL;