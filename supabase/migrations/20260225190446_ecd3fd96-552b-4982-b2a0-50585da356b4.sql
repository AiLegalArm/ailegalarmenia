-- Re-create invoke_pipeline_orchestrator to read key from vault
CREATE OR REPLACE FUNCTION public.invoke_pipeline_orchestrator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
BEGIN
  -- Read cron_worker_key from vault
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'cron_worker_key'
  LIMIT 1;

  IF _key IS NULL OR _key = '' THEN
    -- Fallback to internal_ingest_key
    SELECT decrypted_secret INTO _key
    FROM vault.decrypted_secrets
    WHERE name = 'internal_ingest_key'
    LIMIT 1;
  END IF;

  IF _key IS NULL OR _key = '' THEN
    RAISE WARNING '[pipeline-orchestrator] No worker key found in vault, skipping';
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