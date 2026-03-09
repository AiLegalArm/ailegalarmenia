-- Fix SECURITY DEFINER view warning: recreate as SECURITY INVOKER
-- Since practice_chunk_jobs RLS now only allows service_role and admin,
-- we use a SECURITY DEFINER function with explicit admin check instead.

DROP VIEW IF EXISTS public.admin_pipeline_stats;

-- Create a secure function that only admins can call
CREATE OR REPLACE FUNCTION public.get_admin_pipeline_stats()
RETURNS TABLE (
  job_type text,
  status text,
  job_count int,
  oldest_pending_at timestamptz,
  oldest_pending_age_seconds int,
  last_error_at timestamptz,
  total_attempts int,
  dead_letter_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pj.job_type::text,
    pj.status::text,
    count(*)::int AS job_count,
    min(pj.created_at) FILTER (WHERE pj.status = 'pending') AS oldest_pending_at,
    extract(epoch FROM (now() - min(pj.created_at) FILTER (WHERE pj.status = 'pending')))::int AS oldest_pending_age_seconds,
    max(pj.updated_at) FILTER (WHERE pj.status = 'failed') AS last_error_at,
    sum(pj.attempts)::int AS total_attempts,
    count(*) FILTER (WHERE pj.status = 'dead_letter')::int AS dead_letter_count
  FROM public.practice_chunk_jobs pj
  WHERE has_role(auth.uid(), 'admin'::app_role)
  GROUP BY pj.job_type, pj.status
$$;

-- Lock down access
REVOKE ALL ON FUNCTION public.get_admin_pipeline_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_pipeline_stats() TO authenticated;