
ALTER TABLE public.practice_chunk_jobs DROP CONSTRAINT practice_chunk_jobs_job_type_check;
ALTER TABLE public.practice_chunk_jobs ADD CONSTRAINT practice_chunk_jobs_job_type_check CHECK (job_type = ANY (ARRAY['chunk'::text, 'embed'::text, 'chunk_and_embed'::text, 'enrich'::text]));
