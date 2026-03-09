
-- Add embedding columns
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE public.legal_practice_kb ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create HNSW indexes for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_kb_embedding ON public.knowledge_base 
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_practice_embedding ON public.legal_practice_kb 
  USING hnsw (embedding vector_cosine_ops);

-- RPC: Match knowledge base documents by vector similarity
CREATE OR REPLACE FUNCTION public.match_knowledge_base(
  query_embedding vector(768),
  match_count int DEFAULT 10,
  match_threshold float DEFAULT 0.3
) 
RETURNS TABLE(
  id uuid, 
  title text, 
  content_text text, 
  category kb_category, 
  source_name text, 
  version_date date,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    kb.id, 
    kb.title, 
    kb.content_text, 
    kb.category, 
    kb.source_name,
    kb.version_date,
    (1 - (kb.embedding <=> query_embedding))::float AS similarity
  FROM public.knowledge_base kb
  WHERE kb.is_active = true
    AND kb.embedding IS NOT NULL
    AND (1 - (kb.embedding <=> query_embedding)) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- RPC: Match legal practice documents by vector similarity
CREATE OR REPLACE FUNCTION public.match_legal_practice(
  query_embedding vector(768),
  match_count int DEFAULT 10,
  match_threshold float DEFAULT 0.3,
  category_filter text DEFAULT NULL
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
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
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
    (1 - (lp.embedding <=> query_embedding))::float AS similarity
  FROM public.legal_practice_kb lp
  WHERE lp.is_active = true
    AND lp.embedding IS NOT NULL
    AND (1 - (lp.embedding <=> query_embedding)) > match_threshold
    AND (category_filter IS NULL OR lp.practice_category::text = category_filter)
  ORDER BY lp.embedding <=> query_embedding
  LIMIT match_count;
$$;
