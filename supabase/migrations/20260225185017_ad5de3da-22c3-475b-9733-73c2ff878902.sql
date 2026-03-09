
-- Re-create the vault secret for cron_worker_key
-- The value must match the CRON_WORKER_KEY Edge Function secret
-- We use a placeholder that the user should replace via vault UI or SQL
-- For now, let's change the invoke function to use INTERNAL_INGEST_KEY from vault instead

-- First, create vault secret for internal_ingest_key (same as Edge secret)
-- Then update the function to read it

CREATE OR REPLACE FUNCTION public.invoke_pipeline_orchestrator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
BEGIN
  -- Try cron_worker_key first, then internal_ingest_key
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'cron_worker_key'
  LIMIT 1;
  
  IF _key IS NULL OR _key = '' THEN
    SELECT decrypted_secret INTO _key
    FROM vault.decrypted_secrets
    WHERE name = 'internal_ingest_key'
    LIMIT 1;
  END IF;
  
  IF _key IS NULL OR _key = '' THEN
    RAISE WARNING 'No worker key found in vault, skipping orchestrator call';
    RETURN;
  END IF;
  
  PERFORM net.http_post(
    url := 'https://ekvhhsemntnylaivqufs.supabase.co/functions/v1/practice-pipeline-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', _key
    ),
    body := '{}'::jsonb
  );
END;
$$;
