
-- Helper: call practice-chunk-worker via pg_net
CREATE OR REPLACE FUNCTION public.invoke_chunk_worker(p_max_jobs integer DEFAULT 25)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _key text;
  _url text;
BEGIN
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'INTERNAL_INGEST_KEY'
  LIMIT 1;

  IF _key IS NULL THEN
    RAISE WARNING 'INTERNAL_INGEST_KEY not found in vault, skipping';
    RETURN;
  END IF;

  _url := 'https://ekvhhsemntnylaivqufs.supabase.co/functions/v1/practice-chunk-worker';

  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', _key,
      'x-request-id', gen_random_uuid()::text
    ),
    body := jsonb_build_object('max_jobs', p_max_jobs)
  );
END;
$$;

-- Helper: call practice-chunk-enqueue via pg_net
CREATE OR REPLACE FUNCTION public.invoke_chunk_enqueue(p_batch_limit integer DEFAULT 2000)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _key text;
  _url text;
BEGIN
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'INTERNAL_INGEST_KEY'
  LIMIT 1;

  IF _key IS NULL THEN
    RAISE WARNING 'INTERNAL_INGEST_KEY not found in vault, skipping';
    RETURN;
  END IF;

  _url := 'https://ekvhhsemntnylaivqufs.supabase.co/functions/v1/practice-chunk-enqueue';

  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', _key,
      'x-request-id', gen_random_uuid()::text
    ),
    body := jsonb_build_object(
      'action', 'enqueue_missing_chunks',
      'batch_limit', p_batch_limit
    )
  );
END;
$$;

-- Helper: call practice-pipeline-orchestrator via pg_net
CREATE OR REPLACE FUNCTION public.invoke_chunk_orchestrator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _key text;
  _url text;
BEGIN
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'INTERNAL_INGEST_KEY'
  LIMIT 1;

  IF _key IS NULL THEN
    RAISE WARNING 'INTERNAL_INGEST_KEY not found in vault, skipping';
    RETURN;
  END IF;

  _url := 'https://ekvhhsemntnylaivqufs.supabase.co/functions/v1/practice-pipeline-orchestrator';

  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', _key,
      'x-request-id', gen_random_uuid()::text
    ),
    body := '{"source":"pg_cron"}'::jsonb
  );
END;
$$;
