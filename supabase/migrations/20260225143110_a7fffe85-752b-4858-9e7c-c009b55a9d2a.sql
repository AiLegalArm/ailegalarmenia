-- Update vault secret to use same value as INTERNAL_INGEST_KEY
-- First, delete old cron key
SELECT vault.create_secret('REPLACE_WITH_INTERNAL_KEY', 'internal_ingest_key_for_cron', 'Mirror of INTERNAL_INGEST_KEY for cron use');

-- Update invoke function to use internal_ingest_key_for_cron if available, else cron_worker_key
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
  -- Try internal_ingest_key_for_cron first, then cron_worker_key
  SELECT decrypted_secret INTO _key 
  FROM vault.decrypted_secrets 
  WHERE name = 'internal_ingest_key_for_cron';
  
  IF _key IS NULL THEN
    SELECT decrypted_secret INTO _key 
    FROM vault.decrypted_secrets 
    WHERE name = 'cron_worker_key';
  END IF;
  
  IF _key IS NULL THEN
    RAISE WARNING 'No cron key found in vault, skipping chunk worker invocation';
    RETURN;
  END IF;
  
  _url := 'https://ekvhhsemntnylaivqufs.supabase.co';
  
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