
DROP FUNCTION IF EXISTS public.match_legal_practice(vector, integer, double precision, text);

CREATE FUNCTION public.match_legal_practice(
  query_embedding vector,
  match_count integer DEFAULT 10,
  match_threshold double precision DEFAULT 0.3,
  category_filter text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid,
  title text,
  practice_category practice_category,
  court_type court_type,
  outcome case_outcome,
  applied_articles jsonb,
  key_violations text[],
  legal_reasoning_summary text,
  content_snippet text,
  similarity double precision,
  decision_date date,
  case_number_anonymized text,
  court_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    lp.id, 
    lp.title, 
    lp.practice_category, 
    lp.court_type, 
    lp.outcome,
    lp.applied_articles,
    lp.key_violations,
    lp.legal_reasoning_summary,
    LEFT(lp.content_text, 500) AS content_snippet,
    (1 - (lp.embedding <=> query_embedding))::float AS similarity,
    lp.decision_date,
    lp.case_number_anonymized,
    lp.court_name
  FROM public.legal_practice_kb lp
  WHERE lp.is_active = true
    AND lp.embedding IS NOT NULL
    AND (1 - (lp.embedding <=> query_embedding)) > match_threshold
    AND (category_filter IS NULL OR lp.practice_category::text = category_filter)
  ORDER BY lp.embedding <=> query_embedding
  LIMIT match_count;
$$;
