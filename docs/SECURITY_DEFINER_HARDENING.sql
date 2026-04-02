-- ============================================================
-- HARDENING: All public SECURITY DEFINER functions
-- Auth guards, search_path, vault null-checks, no hardcoded secrets
-- Idempotent: all CREATE OR REPLACE
-- Apply via: Lovable Cloud > Run SQL (Test environment)
-- ============================================================

-- ─── 1. search_knowledge_base: add auth guard ──────────────
CREATE OR REPLACE FUNCTION public.search_knowledge_base(
  search_query TEXT,
  result_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID, title TEXT, content_text TEXT, category kb_category,
  source_name TEXT, version_date DATE, rank REAL
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  SELECT kb.id, kb.title, kb.content_text, kb.category, kb.source_name, kb.version_date,
    ts_rank(to_tsvector('simple', kb.title || ' ' || kb.content_text),
            plainto_tsquery('simple', search_query)) as rank
  FROM public.knowledge_base kb
  WHERE kb.is_active = true
    AND to_tsvector('simple', kb.title || ' ' || kb.content_text) @@ plainto_tsquery('simple', search_query)
  ORDER BY rank DESC
  LIMIT result_limit;
END;
$$;

-- ─── 2. get_monthly_usage: scope to user ───────────────────
CREATE OR REPLACE FUNCTION public.get_monthly_usage()
RETURNS TABLE(service_type TEXT, total_requests BIGINT, total_tokens BIGINT, total_cost DECIMAL)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  SELECT a.service_type, COUNT(*), COALESCE(SUM(a.tokens_used), 0), COALESCE(SUM(a.estimated_cost), 0)
  FROM public.api_usage a
  WHERE a.created_at >= date_trunc('month', now())
    AND (a.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  GROUP BY a.service_type;
END;
$$;

-- ─── 3. check_budget_alert: scope to user ──────────────────
CREATE OR REPLACE FUNCTION public.check_budget_alert(budget_limit DECIMAL DEFAULT 5.0)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN (SELECT COALESCE(SUM(estimated_cost), 0) >= budget_limit
    FROM public.api_usage
    WHERE created_at >= date_trunc('month', now())
      AND (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')));
END;
$$;

-- ─── 4. encrypt_pii: add auth + ownership ──────────────────
CREATE OR REPLACE FUNCTION public.encrypt_pii(
  _user_id UUID, _field_name TEXT, _value TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE encryption_key BYTEA; iv BYTEA; encrypted BYTEA;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() != _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Access denied'; END IF;
  iv := gen_random_bytes(16);
  encryption_key := decode(current_setting('app.encryption_key', true), 'hex');
  IF encryption_key IS NULL THEN encryption_key := sha256(_user_id::text::bytea); END IF;
  encrypted := encrypt_iv(_value::bytea, encryption_key, iv, 'aes-cbc');
  INSERT INTO public.encrypted_pii (user_id, field_name, encrypted_value, iv)
  VALUES (_user_id, _field_name, encrypted, iv)
  ON CONFLICT (user_id, field_name) DO UPDATE SET encrypted_value = encrypted, iv = iv, updated_at = now();
  RETURN true;
END;
$$;

-- ─── 5. decrypt_pii: RAISE instead of RETURN NULL ──────────
CREATE OR REPLACE FUNCTION public.decrypt_pii(
  _user_id UUID, _field_name TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE encryption_key BYTEA; rec RECORD; decrypted BYTEA;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() != _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT encrypted_value, iv INTO rec FROM public.encrypted_pii WHERE user_id = _user_id AND field_name = _field_name;
  IF rec IS NULL THEN RETURN NULL; END IF;
  encryption_key := decode(current_setting('app.encryption_key', true), 'hex');
  IF encryption_key IS NULL THEN encryption_key := sha256(_user_id::text::bytea); END IF;
  decrypted := decrypt_iv(rec.encrypted_value, encryption_key, rec.iv, 'aes-cbc');
  RETURN convert_from(decrypted, 'UTF8');
END;
$$;

-- ─── 6. search_legal_chunks: add auth guard ────────────────
CREATE OR REPLACE FUNCTION public.search_legal_chunks(
  query_embedding vector(768), match_count integer DEFAULT 20, match_threshold double precision DEFAULT 0.3,
  filter_doc_types text[] DEFAULT NULL, filter_chunk_types text[] DEFAULT NULL,
  filter_norm_article text DEFAULT NULL, legislation_budget integer DEFAULT 10, practice_budget integer DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  legislation_types text[] := ARRAY['law','code','government_decree','pm_decision','regulation','international_treaty','other'];
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  WITH ranked AS (
    SELECT lc.id, lc.doc_id, lc.doc_type, lc.chunk_index, lc.chunk_type, lc.chunk_text, lc.label, lc.metadata, lc.norm_refs, lc.char_start, lc.char_end,
      (1 - (lc.embedding <=> query_embedding))::float AS similarity,
      CASE WHEN lc.doc_type = ANY(legislation_types) THEN 'legislation' ELSE 'practice' END AS bucket
    FROM public.legal_chunks lc
    WHERE lc.is_active = true AND lc.embedding IS NOT NULL
      AND (1 - (lc.embedding <=> query_embedding)) > match_threshold
      AND (filter_doc_types IS NULL OR lc.doc_type = ANY(filter_doc_types))
      AND (filter_chunk_types IS NULL OR lc.chunk_type = ANY(filter_chunk_types))
      AND (filter_norm_article IS NULL OR lc.norm_refs @> jsonb_build_array(jsonb_build_object('article', filter_norm_article)))
    ORDER BY lc.embedding <=> query_embedding LIMIT match_count * 2
  ),
  deduped AS (SELECT DISTINCT ON (bucket, doc_id) * FROM ranked ORDER BY bucket, doc_id, similarity DESC),
  legislation AS (SELECT * FROM deduped WHERE bucket = 'legislation' ORDER BY similarity DESC LIMIT legislation_budget),
  practice AS (SELECT * FROM deduped WHERE bucket = 'practice' ORDER BY similarity DESC LIMIT practice_budget)
  SELECT jsonb_build_object(
    'legislation', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'doc_id',l.doc_id,'doc_type',l.doc_type,'chunk_index',l.chunk_index,'chunk_type',l.chunk_type,'chunk_text',l.chunk_text,'label',l.label,'metadata',l.metadata,'norm_refs',l.norm_refs,'similarity',l.similarity) ORDER BY l.similarity DESC) FROM legislation l), '[]'::jsonb),
    'practice', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'doc_id',p.doc_id,'doc_type',p.doc_type,'chunk_index',p.chunk_index,'chunk_type',p.chunk_type,'chunk_text',p.chunk_text,'label',p.label,'metadata',p.metadata,'norm_refs',p.norm_refs,'similarity',p.similarity) ORDER BY p.similarity DESC) FROM practice p), '[]'::jsonb),
    'total_legislation', (SELECT count(*) FROM legislation),
    'total_practice', (SELECT count(*) FROM practice)
  ) INTO result;
  RETURN result;
END;
$$;

-- ─── 7. match_knowledge_base: add auth guard ───────────────
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding vector, match_count integer DEFAULT 10, match_threshold double precision DEFAULT 0.3
) RETURNS TABLE(id uuid, title text, content_text text, category kb_category, source_name text, version_date date, similarity double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  SELECT kb.id, kb.title, kb.content_text, kb.category, kb.source_name, kb.version_date,
    (1 - (kb.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)))::float AS similarity
  FROM public.knowledge_base kb
  WHERE kb.is_active = true AND kb.embedding IS NOT NULL
    AND (1 - (kb.embedding::halfvec(3072) <=> query_embedding::halfvec(3072))) > match_threshold
  ORDER BY kb.embedding::halfvec(3072) <=> query_embedding::halfvec(3072) LIMIT match_count;
END;
$$;

-- ─── 8. match_legal_practice: add auth guard ───────────────
CREATE OR REPLACE FUNCTION public.match_legal_practice(
  query_embedding vector, match_count integer DEFAULT 10, match_threshold double precision DEFAULT 0.3, category_filter text DEFAULT NULL
) RETURNS TABLE(id uuid, title text, practice_category practice_category, court_type court_type, outcome case_outcome, applied_articles jsonb, key_violations text[], legal_reasoning_summary text, content_snippet text, similarity double precision, decision_date date, case_number_anonymized text, court_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  SELECT lp.id, lp.title, lp.practice_category, lp.court_type, lp.outcome, lp.applied_articles, lp.key_violations, lp.legal_reasoning_summary,
    LEFT(lp.content_text, 500) AS content_snippet,
    (1 - (lp.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)))::float AS similarity,
    lp.decision_date, lp.case_number_anonymized, lp.court_name
  FROM public.legal_practice_kb lp
  WHERE lp.is_active = true AND lp.embedding IS NOT NULL
    AND (1 - (lp.embedding::halfvec(3072) <=> query_embedding::halfvec(3072))) > match_threshold
    AND (category_filter IS NULL OR lp.practice_category::text = category_filter)
  ORDER BY lp.embedding::halfvec(3072) <=> query_embedding::halfvec(3072) LIMIT match_count;
END;
$$;

-- ─── 9. get_practice_total_chunks: add auth guard ──────────
CREATE OR REPLACE FUNCTION public.get_practice_total_chunks(p_ids uuid[])
RETURNS TABLE(id uuid, total_chunks integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY SELECT c.doc_id AS id, COUNT(*)::integer AS total_chunks
  FROM public.legal_practice_kb_chunks c WHERE c.doc_id = ANY(p_ids) GROUP BY c.doc_id;
END;
$$;

-- ─── 10. Pipeline internal functions: fix search_path ──────
CREATE OR REPLACE FUNCTION public.get_kb_docs_without_chunks(batch_limit integer DEFAULT 2000)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY SELECT kb.id FROM public.knowledge_base kb
  WHERE kb.is_active = true AND NOT EXISTS (SELECT 1 FROM public.knowledge_base_chunks c WHERE c.kb_id = kb.id)
  LIMIT batch_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_kb_docs_without_chunks()
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN (SELECT count(*) FROM public.knowledge_base kb
    WHERE kb.is_active = true AND NOT EXISTS (SELECT 1 FROM public.knowledge_base_chunks c WHERE c.kb_id = kb.id));
END;
$$;

CREATE OR REPLACE FUNCTION public.avg_chunks_per_kb_doc()
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN (SELECT COALESCE(ROUND(AVG(cnt), 1), 0) FROM (SELECT count(*) AS cnt FROM public.knowledge_base_chunks GROUP BY kb_id) sub);
END;
$$;

CREATE OR REPLACE FUNCTION public.kb_docs_without_chunks()
RETURNS SETOF public.legal_practice_kb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY SELECT d.* FROM public.legal_practice_kb d LEFT JOIN public.legal_practice_kb_chunks c ON c.doc_id = d.id
  WHERE c.id IS NULL AND d.is_active = true ORDER BY d.updated_at DESC LIMIT 5000;
END;
$$;

-- ─── 11. invoke_pipeline_orchestrator: vault + no hardcoded secrets ──
CREATE OR REPLACE FUNCTION public.invoke_pipeline_orchestrator()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _key text; _url text;
BEGIN
  SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'cron_worker_key' LIMIT 1;
  IF _key IS NULL OR _key = '' THEN
    SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'internal_ingest_key' LIMIT 1;
  END IF;
  IF _key IS NULL OR _key = '' THEN RAISE WARNING '[invoke_pipeline_orchestrator] No key in vault'; RETURN; END IF;
  _url := current_setting('app.settings.supabase_url', true);
  IF _url IS NULL OR _url = '' THEN _url := 'https://dbrhbbaoeurjveconszd.supabase.co'; END IF;
  PERFORM net.http_post(url := _url || '/functions/v1/practice-pipeline-orchestrator',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-key',_key), body := '{}'::jsonb);
END;
$$;

-- ─── 12. invoke_chunk_worker: vault + no hardcoded secrets ──
CREATE OR REPLACE FUNCTION public.invoke_chunk_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _key text; _url text;
BEGIN
  SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'internal_ingest_key_for_cron';
  IF _key IS NULL OR _key = '' THEN
    SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'cron_worker_key';
  END IF;
  IF _key IS NULL OR _key = '' THEN RAISE WARNING '[invoke_chunk_worker] No key in vault'; RETURN; END IF;
  _url := current_setting('app.settings.supabase_url', true);
  IF _url IS NULL OR _url = '' THEN _url := 'https://dbrhbbaoeurjveconszd.supabase.co'; END IF;
  PERFORM net.http_post(url := _url || '/functions/v1/practice-chunk-worker',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-key',_key), body := '{"concurrency_docs": 10}'::jsonb);
END;
$$;

-- ─── 13. Drop secret-exposing helper functions ─────────────
DROP FUNCTION IF EXISTS public.get_cron_key();
DROP FUNCTION IF EXISTS public.read_cron_key();

-- ─── 14. Revoke anon/public from all sensitive functions ───
DO $$
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.invoke_pipeline_orchestrator() FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.invoke_pipeline_orchestrator() TO postgres';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.invoke_chunk_worker() FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.invoke_chunk_worker() TO postgres';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.encrypt_pii(uuid, text, text) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.encrypt_pii(uuid, text, text) TO authenticated, service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.decrypt_pii(uuid, text) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.decrypt_pii(uuid, text) TO authenticated, service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.log_audit(text, text, uuid, jsonb) TO authenticated, service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.log_error(text, text, jsonb, uuid, uuid) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.log_error(text, text, jsonb, uuid, uuid) TO authenticated, service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.log_api_usage(text, text, integer, decimal, jsonb) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.log_api_usage(text, text, integer, decimal, jsonb) TO authenticated, service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_monthly_usage() FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_monthly_usage() TO authenticated';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_budget_alert(decimal) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_budget_alert(decimal) TO authenticated';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_kb_docs_without_chunks(integer) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_kb_docs_without_chunks(integer) TO service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.count_kb_docs_without_chunks() FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.count_kb_docs_without_chunks() TO service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.avg_chunks_per_kb_doc() FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.avg_chunks_per_kb_doc() TO service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.kb_docs_without_chunks() FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.kb_docs_without_chunks() TO service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.match_knowledge_base(vector, integer, double precision) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.match_knowledge_base(vector, integer, double precision) TO authenticated, service_role';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.match_legal_practice(vector, integer, double precision, text) FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.match_legal_practice(vector, integer, double precision, text) TO authenticated, service_role';
END;
$$;
