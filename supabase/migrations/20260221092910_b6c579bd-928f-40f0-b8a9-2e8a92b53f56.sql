-- Add unique constraint on echr_case_id for upsert support
ALTER TABLE public.legal_practice_kb
ADD CONSTRAINT legal_practice_kb_echr_case_id_key UNIQUE (echr_case_id);