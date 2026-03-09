-- Bulk enqueue for knowledge_base docs missing chunks
CREATE OR REPLACE FUNCTION public.enqueue_batch_kb(p_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  WITH missing AS (
    SELECT kb.id AS doc_id
    FROM knowledge_base kb
    WHERE kb.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM knowledge_base_chunks c WHERE c.kb_id = kb.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM practice_chunk_jobs j 
        WHERE j.document_id = kb.id 
          AND j.source_table = 'knowledge_base' 
          AND j.job_type = 'chunk'
          AND j.status IN ('pending', 'processing')
      )
    ORDER BY kb.created_at ASC
    LIMIT p_limit
  ),
  ins_chunk AS (
    INSERT INTO practice_chunk_jobs (document_id, source_table, job_type, status, attempts)
    SELECT doc_id, 'knowledge_base', 'chunk', 'pending', 0
    FROM missing
    ON CONFLICT (document_id, source_table, job_type) DO NOTHING
    RETURNING document_id
  ),
  ins_embed AS (
    INSERT INTO practice_chunk_jobs (document_id, source_table, job_type, status, attempts)
    SELECT doc_id, 'knowledge_base', 'embed', 'pending', 0
    FROM missing
    ON CONFLICT (document_id, source_table, job_type) DO NOTHING
  )
  SELECT count(*) INTO v_inserted FROM ins_chunk;
  
  RETURN v_inserted;
END;
$$;

-- Bulk enqueue for legal_practice_kb docs missing chunks
CREATE OR REPLACE FUNCTION public.enqueue_batch_practice(p_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  WITH missing AS (
    SELECT p.id AS doc_id
    FROM legal_practice_kb p
    WHERE p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM legal_practice_kb_chunks c WHERE c.doc_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM practice_chunk_jobs j 
        WHERE j.document_id = p.id 
          AND j.source_table = 'legal_practice_kb' 
          AND j.job_type = 'chunk'
          AND j.status IN ('pending', 'processing')
      )
    ORDER BY p.created_at ASC
    LIMIT p_limit
  ),
  ins_chunk AS (
    INSERT INTO practice_chunk_jobs (document_id, source_table, job_type, status, attempts)
    SELECT doc_id, 'legal_practice_kb', 'chunk', 'pending', 0
    FROM missing
    ON CONFLICT (document_id, source_table, job_type) DO NOTHING
    RETURNING document_id
  ),
  ins_embed AS (
    INSERT INTO practice_chunk_jobs (document_id, source_table, job_type, status, attempts)
    SELECT doc_id, 'legal_practice_kb', 'embed', 'pending', 0
    FROM missing
    ON CONFLICT (document_id, source_table, job_type) DO NOTHING
  ),
  ins_enrich AS (
    INSERT INTO practice_chunk_jobs (document_id, source_table, job_type, status, attempts)
    SELECT doc_id, 'legal_practice_kb', 'enrich', 'pending', 0
    FROM missing
    ON CONFLICT (document_id, source_table, job_type) DO NOTHING
  )
  SELECT count(*) INTO v_inserted FROM ins_chunk;
  
  RETURN v_inserted;
END;
$$;

-- Monitoring: pipeline job distribution
CREATE OR REPLACE FUNCTION public.pipeline_job_monitor()
RETURNS TABLE(
  source_table text,
  job_type text,
  status text,
  job_count bigint,
  oldest_job timestamptz,
  newest_job timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    j.source_table::text,
    j.job_type::text,
    j.status::text,
    count(*)::bigint as job_count,
    min(j.created_at) as oldest_job,
    max(j.created_at) as newest_job
  FROM practice_chunk_jobs j
  GROUP BY j.source_table, j.job_type, j.status
  ORDER BY j.source_table, j.job_type, j.status;
$$;

-- Monitoring: chunk coverage stats
CREATE OR REPLACE FUNCTION public.chunk_coverage_stats()
RETURNS TABLE(
  source text,
  total_docs bigint,
  docs_with_chunks bigint,
  docs_without_chunks bigint,
  total_chunks bigint,
  avg_chunks_per_doc numeric,
  coverage_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    'knowledge_base'::text,
    (SELECT count(*) FROM knowledge_base WHERE is_active),
    (SELECT count(DISTINCT kb_id) FROM knowledge_base_chunks),
    (SELECT count(*) FROM knowledge_base kb WHERE kb.is_active AND NOT EXISTS (SELECT 1 FROM knowledge_base_chunks c WHERE c.kb_id = kb.id)),
    (SELECT count(*) FROM knowledge_base_chunks),
    (SELECT COALESCE(avg(cnt), 0) FROM (SELECT count(*) cnt FROM knowledge_base_chunks GROUP BY kb_id) s),
    CASE WHEN (SELECT count(*) FROM knowledge_base WHERE is_active) = 0 THEN 0
    ELSE round(100.0 * (SELECT count(DISTINCT kb_id) FROM knowledge_base_chunks) / (SELECT count(*) FROM knowledge_base WHERE is_active), 1)
    END
  UNION ALL
  SELECT 
    'legal_practice_kb',
    (SELECT count(*) FROM legal_practice_kb WHERE is_active),
    (SELECT count(DISTINCT doc_id) FROM legal_practice_kb_chunks),
    (SELECT count(*) FROM legal_practice_kb p WHERE p.is_active AND NOT EXISTS (SELECT 1 FROM legal_practice_kb_chunks c WHERE c.doc_id = p.id)),
    (SELECT count(*) FROM legal_practice_kb_chunks),
    (SELECT COALESCE(avg(cnt), 0) FROM (SELECT count(*) cnt FROM legal_practice_kb_chunks GROUP BY doc_id) s),
    CASE WHEN (SELECT count(*) FROM legal_practice_kb WHERE is_active) = 0 THEN 0
    ELSE round(100.0 * (SELECT count(DISTINCT doc_id) FROM legal_practice_kb_chunks) / (SELECT count(*) FROM legal_practice_kb WHERE is_active), 1)
    END;
$$