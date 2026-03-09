
-- Update match_knowledge_base to use halfvec(3072) expression (matches HNSW index)
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding vector,
  match_count integer DEFAULT 10,
  match_threshold double precision DEFAULT 0.3
)
RETURNS TABLE(
  id uuid, title text, content_text text, category kb_category, 
  source_name text, version_date date, similarity double precision
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    kb.id, kb.title, kb.content_text, kb.category, kb.source_name, kb.version_date,
    (1 - (kb.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)))::float AS similarity
  FROM public.knowledge_base kb
  WHERE kb.is_active = true
    AND kb.embedding IS NOT NULL
    AND (1 - (kb.embedding::halfvec(3072) <=> query_embedding::halfvec(3072))) > match_threshold
  ORDER BY kb.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;

-- Update match_legal_practice to use halfvec(3072) expression (matches HNSW index)
CREATE OR REPLACE FUNCTION public.match_legal_practice(
  query_embedding vector,
  match_count integer DEFAULT 10,
  match_threshold double precision DEFAULT 0.3,
  category_filter text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, title text, practice_category practice_category, court_type court_type,
  outcome case_outcome, applied_articles jsonb, key_violations text[],
  legal_reasoning_summary text, content_snippet text, similarity double precision,
  decision_date date, case_number_anonymized text, court_name text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    lp.id, lp.title, lp.practice_category, lp.court_type, lp.outcome,
    lp.applied_articles, lp.key_violations, lp.legal_reasoning_summary,
    LEFT(lp.content_text, 500) AS content_snippet,
    (1 - (lp.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)))::float AS similarity,
    lp.decision_date, lp.case_number_anonymized, lp.court_name
  FROM public.legal_practice_kb lp
  WHERE lp.is_active = true
    AND lp.embedding IS NOT NULL
    AND (1 - (lp.embedding::halfvec(3072) <=> query_embedding::halfvec(3072))) > match_threshold
    AND (category_filter IS NULL OR lp.practice_category::text = category_filter)
  ORDER BY lp.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;
