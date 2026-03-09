-- Update vault cron_worker_key to a known value
-- First delete old, then create with known value
CREATE OR REPLACE FUNCTION public._set_cron_key()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove old keys
  DELETE FROM vault.secrets WHERE name IN ('cron_worker_key', 'internal_ingest_key_for_cron');
  -- Create new with known value
  PERFORM vault.create_secret('chunk-cron-2026-safe-key-x9k3m', 'cron_worker_key', 'Key for pg_cron to call chunk worker');
END;
$$;

SELECT public._set_cron_key();
DROP FUNCTION public._set_cron_key();