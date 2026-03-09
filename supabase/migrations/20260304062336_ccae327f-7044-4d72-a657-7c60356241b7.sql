-- Fix search_path on advisory lock functions
CREATE OR REPLACE FUNCTION public.try_backfill_lock()
RETURNS boolean
LANGUAGE sql VOLATILE
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(8675309);
$$;

CREATE OR REPLACE FUNCTION public.release_backfill_lock()
RETURNS void
LANGUAGE sql VOLATILE
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(8675309);
$$;