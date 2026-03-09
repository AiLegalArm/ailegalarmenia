
-- Extend practice_chunk_jobs to support embed and enrich job types
-- Add lease-based columns for autonomous pipeline

ALTER TABLE public.practice_chunk_jobs 
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS worker_id text;

-- Create claim function for embed/enrich jobs (reusable)
CREATE OR REPLACE FUNCTION public.claim_pipeline_jobs(
  p_job_type text,
  p_source_table text DEFAULT NULL,
  p_limit int DEFAULT 25,
  p_lease_minutes int DEFAULT 10
)
RETURNS SETOF practice_chunk_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id
    FROM practice_chunk_jobs
    WHERE job_type = p_job_type
      AND (p_source_table IS NULL OR source_table = p_source_table)
      AND (
        status = 'pending'
        OR (status = 'processing' AND lease_expires_at < now())
      )
      AND attempts < max_attempts
      AND (next_run_at IS NULL OR next_run_at <= now())
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE practice_chunk_jobs j
  SET 
    status = 'processing',
    started_at = now(),
    lease_expires_at = now() + (p_lease_minutes || ' minutes')::interval,
    worker_id = gen_random_uuid()::text
  FROM claimed c
  WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

-- Drop unique constraint if it exists and recreate with job_type
DO $$
BEGIN
  -- Check if old constraint exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'practice_chunk_jobs_document_id_source_table_job_type_key'
  ) THEN
    -- Already has the right constraint
    NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- Index for pipeline orchestrator counts
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_type_status 
  ON practice_chunk_jobs(job_type, status) 
  WHERE status IN ('pending', 'processing', 'failed');

-- Index for next_run_at queries
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_next_run 
  ON practice_chunk_jobs(job_type, status, next_run_at) 
  WHERE status = 'pending';
