-- Temp function to read cron key (will drop immediately)
CREATE OR REPLACE FUNCTION public.read_cron_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _key text;
BEGIN
  SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'cron_worker_key';
  RETURN _key;
END;
$$;