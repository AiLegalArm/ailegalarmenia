
-- invoke_pipeline_tick: RPC for pg_cron to call pipeline-tick endpoint
CREATE OR REPLACE FUNCTION public.invoke_pipeline_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _key text;
  _url text;
BEGIN
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'INTERNAL_INGEST_KEY'
  LIMIT 1;

  IF _key IS NULL THEN
    RAISE EXCEPTION 'INTERNAL_INGEST_KEY not found in vault';
  END IF;

  _url := 'https://ekvhhsemntnylaivqufs.supabase.co/functions/v1/pipeline-tick';

  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', _key
    ),
    body := '{"source":"pg_cron"}'::jsonb
  );
END;
$function$;

-- Update cron to use pipeline-tick instead of orchestrator directly
SELECT cron.unschedule('practice-pipeline-orchestrator');

SELECT cron.schedule(
  'pipeline-tick',
  '* * * * *',
  $$SELECT public.invoke_pipeline_tick()$$
);
