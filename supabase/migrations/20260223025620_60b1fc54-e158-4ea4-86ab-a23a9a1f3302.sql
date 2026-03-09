-- Drop the FK that only points to legal_practice_kb
-- practice_chunk_jobs serves both legal_practice_kb AND knowledge_base
ALTER TABLE public.practice_chunk_jobs
  DROP CONSTRAINT practice_chunk_jobs_document_id_fkey;