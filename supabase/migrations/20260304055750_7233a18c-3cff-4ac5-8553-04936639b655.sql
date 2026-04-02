
-- Fix invoke_pipeline_orchestrator: use vault for URL instead of NULL current_setting
CREATE OR REPLACE FUNCTION public.invoke_pipeline_orchestrator()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _key text;
  _url text;
BEGIN
  -- Read key from vault
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'INTERNAL_INGEST_KEY'
  LIMIT 1;

  IF _key IS NULL THEN
    RAISE EXCEPTION 'INTERNAL_INGEST_KEY not found in vault';
  END IF;

  -- Build URL from project ref (stable, never changes)
  _url := 'https://dbrhbbaoeurjveconszd.supabase.co/functions/v1/practice-pipeline-orchestrator';

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
