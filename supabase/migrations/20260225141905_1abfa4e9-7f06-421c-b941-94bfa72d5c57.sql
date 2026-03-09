-- Temporary helper to read the cron key (will be dropped after use)
CREATE OR REPLACE FUNCTION public.get_cron_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key text;
BEGIN
  SELECT decrypted_secret INTO _key 
  FROM vault.decrypted_secrets 
  WHERE name = 'cron_worker_key';
  RETURN _key;
END;
$$;