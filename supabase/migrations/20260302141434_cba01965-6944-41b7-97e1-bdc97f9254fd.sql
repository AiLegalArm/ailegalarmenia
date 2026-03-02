
-- Drop the OLD overload (different param order: p_job_type, p_source_table, p_limit, p_lease_minutes)
DROP FUNCTION IF EXISTS public.claim_pipeline_jobs(text, text, integer, integer);
