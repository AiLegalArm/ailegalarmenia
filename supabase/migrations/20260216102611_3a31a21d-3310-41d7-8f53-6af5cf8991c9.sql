
-- Fix: set search_path on immutable_unaccent to satisfy linter
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path TO 'public', 'extensions'
AS $$ SELECT extensions.unaccent($1) $$;
