-- Step 1: Add tsv columns (instant, no rewrite)
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS tsv tsvector;
ALTER TABLE public.legal_practice_kb ADD COLUMN IF NOT EXISTS tsv tsvector;

-- Step 2: Trigger function for knowledge_base
CREATE OR REPLACE FUNCTION public.kb_set_tsv() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.tsv := to_tsvector('simple', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content_text, ''));
  RETURN NEW;
END;
$$;

-- Step 3: Trigger function for legal_practice_kb
CREATE OR REPLACE FUNCTION public.practice_set_tsv() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.tsv := to_tsvector('simple',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.content_text, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.legal_reasoning_summary, ''));
  RETURN NEW;
END;
$$;

-- Step 4: Attach triggers
DROP TRIGGER IF EXISTS knowledge_base_set_tsv ON public.knowledge_base;
CREATE TRIGGER knowledge_base_set_tsv
  BEFORE INSERT OR UPDATE ON public.knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.kb_set_tsv();

DROP TRIGGER IF EXISTS legal_practice_kb_set_tsv ON public.legal_practice_kb;
CREATE TRIGGER legal_practice_kb_set_tsv
  BEFORE INSERT OR UPDATE ON public.legal_practice_kb
  FOR EACH ROW EXECUTE FUNCTION public.practice_set_tsv();