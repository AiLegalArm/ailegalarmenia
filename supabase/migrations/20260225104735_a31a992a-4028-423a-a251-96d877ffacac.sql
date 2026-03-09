
-- Atomic job claiming function for practice-chunk-worker
-- Single-step UPDATE ... RETURNING to prevent double-claim race condition
CREATE OR REPLACE FUNCTION public.claim_chunk_jobs(
  p_source_table text DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_lease_minutes integer DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  document_id uuid,
  source_table text,
  attempts integer,
  max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First, recover expired leases
  UPDATE practice_chunk_jobs
  SET status = 'pending', started_at = NULL
  WHERE status = 'processing'
    AND started_at < (now() - (p_lease_minutes || ' minutes')::interval)
    AND (p_source_table IS NULL OR practice_chunk_jobs.source_table = p_source_table);

  -- Atomic claim: UPDATE with subquery + RETURNING
  RETURN QUERY
  UPDATE practice_chunk_jobs AS j
  SET status = 'processing', started_at = now()
  FROM (
    SELECT pj.id
    FROM practice_chunk_jobs pj
    WHERE pj.status IN ('pending', 'failed')
      AND pj.attempts < pj.max_attempts
      AND (pj.started_at IS NULL OR pj.started_at < (now() - (p_lease_minutes || ' minutes')::interval))
      AND (p_source_table IS NULL OR pj.source_table = p_source_table)
    ORDER BY pj.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) AS candidates
  WHERE j.id = candidates.id
  RETURNING j.id, j.document_id, j.source_table, j.attempts, j.max_attempts;
END;
$$;
