
-- Drop legacy function that reads from app_settings
DROP FUNCTION IF EXISTS public.invoke_chunk_worker();

-- Clean up any internal keys from app_settings (no secrets in regular tables)
DELETE FROM public.app_settings WHERE key IN ('internal_ingest_key', 'cron_worker_key');

-- Update invoke_pipeline_orchestrator to use Edge secret via pg_net
-- The CRON_WORKER_KEY is set as both an Edge Function secret and a vault secret
CREATE OR REPLACE FUNCTION public.invoke_pipeline_orchestrator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _key text;
BEGIN
  -- Read from vault (the proper Supabase secret store)
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'cron_worker_key'
  LIMIT 1;
  
  IF _key IS NULL OR _key = '' THEN
    RAISE WARNING 'cron_worker_key not found in vault, skipping orchestrator call';
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

-- Ensure cron job exists for the orchestrator (every minute)
SELECT cron.unschedule('invoke-pipeline-orchestrator') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'invoke-pipeline-orchestrator'
);

SELECT cron.schedule(
  'invoke-pipeline-orchestrator',
  '* * * * *',
  'SELECT public.invoke_pipeline_orchestrator()'
);
