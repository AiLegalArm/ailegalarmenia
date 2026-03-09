-- Simpler approach: use app_settings to store the cron key
-- and make the invoke function read from there.
-- Also update the function to not rely on vault.

CREATE OR REPLACE FUNCTION public.invoke_chunk_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
BEGIN
  -- Read from app_settings (admin-only table with RLS)
  SELECT value INTO _key FROM app_settings WHERE key = 'cron_worker_key';
  
  IF _key IS NULL OR _key = '' THEN
    RAISE WARNING 'cron_worker_key not found in app_settings';
    RETURN;
  END IF;
  
  PERFORM net.http_post(
    url := 'https://ekvhhsemntnylaivqufs.supabase.co/functions/v1/practice-chunk-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', _key
    ),
    body := '{"concurrency_docs": 10}'::jsonb
  );
END;
$$;