
-- Enable pg_trgm for fuzzy/partial matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Normalization function for Armenian text
CREATE OR REPLACE FUNCTION public.normalize_hy(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(trim(input)),
        '[.,;:!?\u00ab\u00bb\u201c\u201d\u2018\u2019"''()\[\]{}\u2014\u2013\u2015\u2012\u2010\-\u2026]+', '', 'g'
      ),
      '\s+', ' ', 'g'
    ),
    '^\s+|\s+$', '', 'g'
  )
$$;

-- Dictionary table
CREATE TABLE public.armenian_dictionary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lemma text NOT NULL,
  lemma_norm text NOT NULL,
  part_of_speech text,
  definition text,
  examples jsonb,
  forms jsonb,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX dict_lemma_norm_btree_idx ON public.armenian_dictionary (lemma_norm);
CREATE INDEX dict_lemma_trgm_idx ON public.armenian_dictionary USING gin (lemma_norm gin_trgm_ops);

-- Auto-normalize on insert/update
CREATE OR REPLACE FUNCTION public.dict_normalize_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.lemma_norm := normalize_hy(NEW.lemma);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dict_normalize
  BEFORE INSERT OR UPDATE ON public.armenian_dictionary
  FOR EACH ROW
  EXECUTE FUNCTION public.dict_normalize_trigger();

-- RLS
ALTER TABLE public.armenian_dictionary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read dictionary"
  ON public.armenian_dictionary FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage dictionary"
  ON public.armenian_dictionary FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Search RPC
CREATE OR REPLACE FUNCTION public.dictionary_search(
  q_norm text,
  search_limit int DEFAULT 20,
  search_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  lemma text,
  part_of_speech text,
  definition text,
  examples jsonb,
  forms jsonb,
  match_type text,
  similarity_score real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.lemma,
    d.part_of_speech,
    d.definition,
    d.examples,
    d.forms,
    CASE
      WHEN d.lemma_norm = q_norm THEN 'exact'
      WHEN d.lemma_norm LIKE q_norm || '%' THEN 'prefix'
      ELSE 'partial'
    END AS match_type,
    similarity(d.lemma_norm, q_norm) AS similarity_score
  FROM armenian_dictionary d
  WHERE d.lemma_norm = q_norm
     OR d.lemma_norm LIKE q_norm || '%'
     OR d.lemma_norm LIKE '%' || q_norm || '%'
     OR similarity(d.lemma_norm, q_norm) > 0.3
  ORDER BY
    CASE WHEN d.lemma_norm = q_norm THEN 0
         WHEN d.lemma_norm LIKE q_norm || '%' THEN 1
         WHEN d.lemma_norm LIKE '%' || q_norm || '%' THEN 2
         ELSE 3
    END,
    similarity(d.lemma_norm, q_norm) DESC
  LIMIT search_limit
  OFFSET search_offset
$$;
