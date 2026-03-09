-- P0 fix: unblock 3072-d embeddings on pgvector 0.8.0 without data loss
-- HNSW/IVFFLAT ANN indexes are not recreated here because pgvector 0.8.0 limits ANN to <=2000 dims.

CREATE EXTENSION IF NOT EXISTS vector;

-- 1) Drop any ANN indexes that depend on `embedding` in target tables
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT idx_ns.nspname AS schema_name,
           idx.relname AS index_name
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
    JOIN pg_namespace idx_ns ON idx_ns.oid = idx.relnamespace
    JOIN pg_am am ON am.oid = idx.relam
    WHERE tbl_ns.nspname = 'public'
      AND tbl.relname IN ('knowledge_base', 'legal_practice_kb', 'legal_chunks')
      AND am.amname IN ('hnsw', 'ivfflat')
      AND pg_get_indexdef(i.indexrelid) ILIKE '%(embedding%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', r.schema_name, r.index_name);
  END LOOP;
END
$$;

-- 2) Safe schema upgrade per table, preserving legacy vectors
DO $$
DECLARE
  t TEXT;
  emb_type TEXT;
  has_embedding BOOLEAN;
  has_legacy BOOLEAN;
  has_legacy_old BOOLEAN;
BEGIN
  FOREACH t IN ARRAY ARRAY['knowledge_base', 'legal_practice_kb', 'legal_chunks']
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND a.attname = 'embedding'
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) INTO has_embedding;

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

    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND a.attname = 'embedding_legacy_768'
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) INTO has_legacy;

    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND a.attname = 'embedding_legacy_768_old'
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) INTO has_legacy_old;

    IF NOT has_embedding THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS embedding vector(3072)', t);
    ELSIF emb_type <> 'vector(3072)' THEN
      IF NOT has_legacy THEN
        EXECUTE format('ALTER TABLE public.%I RENAME COLUMN embedding TO embedding_legacy_768', t);
      ELSIF NOT has_legacy_old THEN
        EXECUTE format('ALTER TABLE public.%I RENAME COLUMN embedding TO embedding_legacy_768_old', t);
      ELSE
        EXECUTE format('ALTER TABLE public.%I RENAME COLUMN embedding TO embedding_legacy_legacy2', t);
      END IF;

      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS embedding vector(3072)', t);
    END IF;
  END LOOP;
END
$$;

-- 3) Keep API schema cache in sync
NOTIFY pgrst, 'reload schema';