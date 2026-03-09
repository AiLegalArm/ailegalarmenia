-- Add source_table column to practice_chunk_jobs to support knowledge_base chunking
ALTER TABLE public.practice_chunk_jobs
  ADD COLUMN IF NOT EXISTS source_table text NOT NULL DEFAULT 'legal_practice_kb';

-- Drop old unique constraint and create a new one including source_table
ALTER TABLE public.practice_chunk_jobs
  DROP CONSTRAINT IF EXISTS practice_chunk_jobs_document_id_job_type_key;

ALTER TABLE public.practice_chunk_jobs
  ADD CONSTRAINT practice_chunk_jobs_doc_table_type_key
    UNIQUE (document_id, source_table, job_type);

-- Index for filtering by source_table
CREATE INDEX IF NOT EXISTS idx_practice_chunk_jobs_source_table
  ON public.practice_chunk_jobs (source_table, status);
