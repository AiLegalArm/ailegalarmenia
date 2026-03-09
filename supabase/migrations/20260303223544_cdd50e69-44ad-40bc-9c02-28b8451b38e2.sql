-- P0: Drop legacy hardcoded-key encryption functions
DROP FUNCTION IF EXISTS public.encrypt_sensitive_data(text, text);
DROP FUNCTION IF EXISTS public.decrypt_sensitive_data(bytea, text);

-- P0: Replace invoke_pipeline_orchestrator to read key from vault instead of hardcoding
CREATE OR REPLACE FUNCTION public.invoke_pipeline_orchestrator()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _key text;
BEGIN
  -- Read key from secrets (vault) instead of hardcoding
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'INTERNAL_INGEST_KEY'
  LIMIT 1;

  IF _key IS NULL THEN
    RAISE EXCEPTION 'INTERNAL_INGEST_KEY not found in vault';
  END IF;

  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/practice-pipeline-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', _key
    ),
    body := '{}'::jsonb
  );
END;
$function$;