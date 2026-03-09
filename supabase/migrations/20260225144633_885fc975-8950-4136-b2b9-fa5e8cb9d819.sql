-- Use INTERNAL_INGEST_KEY directly: store its value via a helper
-- The invoke function will read from app_settings and pass as x-internal-key
-- We need the user to set app_settings.cron_worker_key = their INTERNAL_INGEST_KEY value

-- For now, update invoke_chunk_worker to accept the key from app_settings 'internal_ingest_key'
CREATE OR REPLACE FUNCTION public.invoke_chunk_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
BEGIN
  SELECT value INTO _key FROM app_settings WHERE key = 'internal_ingest_key';
  
  IF _key IS NULL OR _key = '' THEN
    RAISE WARNING 'internal_ingest_key not found in app_settings, skipping';
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