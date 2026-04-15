-- Ensure embeddings are (re)generated whenever vector-searchable text changes.
-- This migration enqueues `embed` jobs automatically for:
--   - knowledge_base (documents)
--   - legal_practice_kb (documents)
--   - legal_chunks (chunks)
--
-- The worker `practice-embed-worker` is responsible for generating BOTH:
--   - embedding (primary)
--   - embedding_legacy_768 (legacy, dim=768)

CREATE OR REPLACE FUNCTION public._enqueue_embed_job(
  _document_id uuid,
  _source_table text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.practice_chunk_jobs (
    document_id,
    source_table,
    job_type,
    status,
    attempts,
    last_error,
    started_at,
    completed_at
  )
  VALUES (
    _document_id,
    _source_table,
    'embed',
    'pending',
    0,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (document_id, source_table, job_type)
  DO UPDATE SET
    status = 'pending',
    attempts = 0,
    last_error = NULL,
    started_at = NULL,
    completed_at = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._enqueue_embed_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  changed boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'knowledge_base' THEN
    changed := (TG_OP = 'INSERT')
      OR (NEW.title IS DISTINCT FROM OLD.title)
      OR (NEW.content_text IS DISTINCT FROM OLD.content_text)
      OR (NEW.category IS DISTINCT FROM OLD.category)
      OR (NEW.article_number IS DISTINCT FROM OLD.article_number)
      OR (NEW.source_name IS DISTINCT FROM OLD.source_name)
      OR (NEW.version_date IS DISTINCT FROM OLD.version_date);

    IF changed THEN
      NEW.embedding_status := 'pending';
      NEW.embedding_error := NULL;
      PERFORM public._enqueue_embed_job(NEW.id, 'knowledge_base');
    END IF;

  ELSIF TG_TABLE_NAME = 'legal_practice_kb' THEN
    changed := (TG_OP = 'INSERT')
      OR (NEW.title IS DISTINCT FROM OLD.title)
      OR (NEW.content_text IS DISTINCT FROM OLD.content_text)
      OR (NEW.description IS DISTINCT FROM OLD.description)
      OR (NEW.court_type IS DISTINCT FROM OLD.court_type)
      OR (NEW.court_name IS DISTINCT FROM OLD.court_name)
      OR (NEW.source_name IS DISTINCT FROM OLD.source_name)
      OR (NEW.decision_date IS DISTINCT FROM OLD.decision_date)
      OR (NEW.case_number_anonymized IS DISTINCT FROM OLD.case_number_anonymized)
      OR (NEW.echr_case_id IS DISTINCT FROM OLD.echr_case_id)
      OR (NEW.practice_category IS DISTINCT FROM OLD.practice_category)
      OR (NEW.key_violations IS DISTINCT FROM OLD.key_violations)
      OR (NEW.applied_articles IS DISTINCT FROM OLD.applied_articles)
      OR (NEW.legal_reasoning_summary IS DISTINCT FROM OLD.legal_reasoning_summary)
      OR (NEW.outcome IS DISTINCT FROM OLD.outcome)
      OR (NEW.facts_hy IS DISTINCT FROM OLD.facts_hy)
      OR (NEW.judgment_hy IS DISTINCT FROM OLD.judgment_hy);

    IF changed THEN
      NEW.embedding_status := 'pending';
      NEW.embedding_error := NULL;
      PERFORM public._enqueue_embed_job(NEW.id, 'legal_practice_kb');
    END IF;

  ELSIF TG_TABLE_NAME = 'legal_chunks' THEN
    changed := (TG_OP = 'INSERT')
      OR (NEW.chunk_text IS DISTINCT FROM OLD.chunk_text)
      OR (NEW.chunk_type IS DISTINCT FROM OLD.chunk_type)
      OR (NEW.label IS DISTINCT FROM OLD.label);

    IF changed THEN
      PERFORM public._enqueue_embed_job(NEW.id, 'legal_chunks');
      NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
        'embedding_status', 'pending',
        'embedding_error', NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_embed_kb ON public.knowledge_base;
CREATE TRIGGER trg_enqueue_embed_kb
BEFORE INSERT OR UPDATE ON public.knowledge_base
FOR EACH ROW
EXECUTE FUNCTION public._enqueue_embed_on_change();

DROP TRIGGER IF EXISTS trg_enqueue_embed_practice ON public.legal_practice_kb;
CREATE TRIGGER trg_enqueue_embed_practice
BEFORE INSERT OR UPDATE ON public.legal_practice_kb
FOR EACH ROW
EXECUTE FUNCTION public._enqueue_embed_on_change();

DROP TRIGGER IF EXISTS trg_enqueue_embed_chunks ON public.legal_chunks;
CREATE TRIGGER trg_enqueue_embed_chunks
BEFORE INSERT OR UPDATE ON public.legal_chunks
FOR EACH ROW
EXECUTE FUNCTION public._enqueue_embed_on_change();

NOTIFY pgrst, 'reload schema';

