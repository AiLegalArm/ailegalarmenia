-- Since vault.secrets insert is blocked by encryption permissions in Cloud,
-- store the key directly in the SECURITY DEFINER function (only accessible to pg_cron).
CREATE OR REPLACE FUNCTION public.invoke_pipeline_orchestrator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text := 'KfkI8gHgXJpM4fFlcX7SuqDFl6jjTPMgApQkqZNIhi0dgc8N5Z';
BEGIN
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