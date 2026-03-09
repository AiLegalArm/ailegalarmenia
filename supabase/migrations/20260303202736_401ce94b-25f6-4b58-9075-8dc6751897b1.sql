
CREATE OR REPLACE FUNCTION public.claim_pipeline_jobs(
  p_job_type text, 
  p_limit integer DEFAULT 25, 
  p_lease_minutes integer DEFAULT 10, 
  p_source_table text DEFAULT NULL::text
)
RETURNS SETOF practice_chunk_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  claimed_ids uuid[];
BEGIN
  -- Select and lock candidates, store their IDs
  SELECT array_agg(sub.id) INTO claimed_ids
  FROM (
    SELECT pj.id
    FROM practice_chunk_jobs pj
    WHERE pj.job_type = p_job_type
      AND pj.status = 'pending'
      AND pj.attempts < pj.max_attempts
      AND (pj.next_run_at IS NULL OR pj.next_run_at <= now())
      AND (p_source_table IS NULL OR pj.source_table = p_source_table)
    ORDER BY pj.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) sub;

  -- If no candidates, return empty
  IF claimed_ids IS NULL OR array_length(claimed_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Update and return
  RETURN QUERY
  UPDATE practice_chunk_jobs j
  SET 
    status = 'processing',
    started_at = now(),
    lease_expires_at = now() + (p_lease_minutes || ' minutes')::interval,
    worker_id = gen_random_uuid()::text
  WHERE j.id = ANY(claimed_ids)
  RETURNING j.*;
END;
$function$;
