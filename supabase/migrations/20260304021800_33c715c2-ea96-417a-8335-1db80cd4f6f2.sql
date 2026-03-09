-- 1. Create admin-only aggregated view (no raw rows exposed)
CREATE OR REPLACE VIEW public.admin_pipeline_stats AS
SELECT
  job_type,
  status,
  count(*)::int AS job_count,
  min(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_at,
  extract(epoch FROM (now() - min(created_at) FILTER (WHERE status = 'pending')))::int AS oldest_pending_age_seconds,
  max(updated_at) FILTER (WHERE status = 'failed') AS last_error_at,
  sum(attempts)::int AS total_attempts,
  count(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter_count
FROM public.practice_chunk_jobs
GROUP BY job_type, status;

-- 2. Revoke all default access
REVOKE ALL ON public.admin_pipeline_stats FROM public, anon, authenticated;

-- 3. Grant SELECT only to authenticated (RLS function will gate to admin)
GRANT SELECT ON public.admin_pipeline_stats TO authenticated;

-- 4. Fix the three mis-scoped "service role" policies that use {public} instead of {service_role}
-- 4a. translations_cache
DROP POLICY IF EXISTS "Service role full access to translations cache" ON public.translations_cache;
CREATE POLICY "Service role full access to translations cache"
  ON public.translations_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4b. practice_chunk_jobs
DROP POLICY IF EXISTS "Service role full access to chunk jobs" ON public.practice_chunk_jobs;
CREATE POLICY "Service role full access to chunk jobs"
  ON public.practice_chunk_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4c. legal_documents
DROP POLICY IF EXISTS "Service role full access on legal documents" ON public.legal_documents;
CREATE POLICY "Service role full access on legal documents"
  ON public.legal_documents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);