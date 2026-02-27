-- P0 migration 2: ANN index step (separate from DDL), idempotent
-- NOTE: For vector dimensions > 2000, pgvector ANN indexes are skipped intentionally.

SET lock_timeout = '2s';
SET statement_timeout = '0';
SET idle_in_transaction_session_timeout = '30s';

DO $$
DECLARE
  t TEXT;
  idx_name TEXT;
  emb_type TEXT;
  dims INT;
  lists_val INT;
  rows_est BIGINT;
BEGIN
  FOREACH t IN ARRAY ARRAY['knowledge_base', 'legal_practice_kb', 'legal_chunks']
  LOOP
    -- detect embedding type/dims
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO emb_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = t
      AND a.attname = 'embedding'
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF emb_type IS NULL THEN
      RAISE NOTICE '[P0] %.embedding missing, skip index', t;
      CONTINUE;
    END IF;

    dims := NULLIF(regexp_replace(emb_type, '^vector\((\d+)\)$', '\1'), emb_type)::INT;

    -- pgvector ANN (HNSW/IVFFLAT) is unsupported over 2000 dims in current runtime; skip safely.
    IF dims IS NULL OR dims > 2000 THEN
      RAISE NOTICE '[P0] %.embedding=%: ANN index skipped (dims > 2000)', t, emb_type;
      CONTINUE;
    END IF;

    -- adaptive lists: sqrt(N) clamped to [100, 2000]
    EXECUTE format('SELECT count(*)::bigint FROM public.%I', t) INTO rows_est;
    lists_val := LEAST(2000, GREATEST(100, CEIL(SQRT(GREATEST(rows_est,1)))::INT));

    idx_name := format('idx_%s_embedding_ivfflat', t);

    IF to_regclass(format('public.%I', idx_name)) IS NULL THEN
      EXECUTE format(
        'CREATE INDEX %I ON public.%I USING ivfflat (embedding vector_cosine_ops) WITH (lists = %s)',
        idx_name, t, lists_val
      );
    END IF;

    EXECUTE format('ANALYZE public.%I', t);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';