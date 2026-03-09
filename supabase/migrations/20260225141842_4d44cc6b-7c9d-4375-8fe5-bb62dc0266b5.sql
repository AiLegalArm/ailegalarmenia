-- Helper function to invoke chunk worker via cron (reads key from vault)
CREATE OR REPLACE FUNCTION public.invoke_chunk_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
  _url text;
BEGIN
  SELECT decrypted_secret INTO _key 
  FROM vault.decrypted_secrets 
  WHERE name = 'cron_worker_key';
  
  IF _key IS NULL THEN
    RAISE WARNING 'cron_worker_key not found in vault, skipping';
    RETURN;
  END IF;
  
  _url := current_setting('app.settings.supabase_url', true);
  IF _url IS NULL OR _url = '' THEN
    _url := 'https://ekvhhsemntnylaivqufs.supabase.co';
  END IF;
  
  PERFORM net.http_post(
    url := _url || '/functions/v1/practice-chunk-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', _key
    ),
    body := '{"concurrency_docs": 10}'::jsonb
  );
END;
$$;

-- Schedule: every 2 minutes
SELECT cron.schedule(
  'chunk-worker-heartbeat',
  '*/2 * * * *',
  'SELECT public.invoke_chunk_worker()'
);