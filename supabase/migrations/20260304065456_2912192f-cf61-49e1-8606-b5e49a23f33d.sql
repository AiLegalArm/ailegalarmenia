-- Add court meta columns to legal_chunks
ALTER TABLE public.legal_chunks
  ADD COLUMN IF NOT EXISTS case_number text,
  ADD COLUMN IF NOT EXISTS court_name text,
  ADD COLUMN IF NOT EXISTS decision_date text;

-- Add court meta columns to knowledge_base_chunks
ALTER TABLE public.knowledge_base_chunks
  ADD COLUMN IF NOT EXISTS case_number text,
  ADD COLUMN IF NOT EXISTS court_name text,
  ADD COLUMN IF NOT EXISTS decision_date text;

-- Indexes on legal_chunks
CREATE INDEX IF NOT EXISTS idx_legal_chunks_case_number
  ON public.legal_chunks (case_number)
  WHERE case_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_legal_chunks_case_number_rechunk
  ON public.legal_chunks (case_number, rechunk_version)
  WHERE case_number IS NOT NULL;

-- Indexes on knowledge_base_chunks
CREATE INDEX IF NOT EXISTS idx_kb_chunks_case_number
  ON public.knowledge_base_chunks (case_number)
  WHERE case_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kb_chunks_case_number_rechunk
  ON public.knowledge_base_chunks (case_number, rechunk_version)
  WHERE case_number IS NOT NULL;