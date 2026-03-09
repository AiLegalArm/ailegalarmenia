-- =============================================================================
-- LEGAL PRACTICE KNOWLEDGE BASE - ISOLATED FROM USER CASES
-- =============================================================================

-- Create enum for court types
CREATE TYPE public.court_type AS ENUM (
  'first_instance',
  'appeal',
  'cassation',
  'constitutional',
  'echr'
);

-- Create enum for case outcome
CREATE TYPE public.case_outcome AS ENUM (
  'granted',
  'rejected',
  'partial',
  'remanded',
  'discontinued'
);

-- Create enum for practice category (matches folder structure)
CREATE TYPE public.practice_category AS ENUM (
  'criminal',
  'civil',
  'administrative',
  'echr'
);

-- =============================================================================
-- MAIN TABLE: legal_practice_kb
-- Stores anonymized court decisions, complaints, rulings
-- STRICTLY SEPARATED from user case data
-- =============================================================================
CREATE TABLE public.legal_practice_kb (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Document identification
  title TEXT NOT NULL,
  description TEXT,
  content_text TEXT NOT NULL,
  
  -- Court and case metadata
  court_type court_type NOT NULL,
  practice_category practice_category NOT NULL,
  court_name TEXT,
  case_number_anonymized TEXT,
  decision_date DATE,
  
  -- Legal references
  applied_articles JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"code": "criminal_code", "articles": ["104", "105"]}, {"code": "echr", "articles": ["6", "13"]}]
  
  -- Outcome and summary
  outcome case_outcome NOT NULL,
  key_violations TEXT[],
  legal_reasoning_summary TEXT,
  
  -- Source and versioning
  source_name TEXT,
  source_url TEXT,
  is_anonymized BOOLEAN NOT NULL DEFAULT true,
  
  -- Access control
  is_active BOOLEAN NOT NULL DEFAULT true,
  visibility TEXT NOT NULL DEFAULT 'ai_only' CHECK (visibility IN ('ai_only', 'admin_only', 'internal')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.legal_practice_kb ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES - ADMIN ONLY ACCESS
-- End users should NEVER see this table directly
-- =============================================================================

-- Only admins can view legal practice KB
CREATE POLICY "Admins can manage legal practice KB"
ON public.legal_practice_kb
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================
CREATE INDEX idx_legal_practice_kb_category ON public.legal_practice_kb(practice_category);
CREATE INDEX idx_legal_practice_kb_court_type ON public.legal_practice_kb(court_type);
CREATE INDEX idx_legal_practice_kb_outcome ON public.legal_practice_kb(outcome);
CREATE INDEX idx_legal_practice_kb_active ON public.legal_practice_kb(is_active) WHERE is_active = true;

-- Full-text search index
CREATE INDEX idx_legal_practice_kb_search ON public.legal_practice_kb 
USING GIN (to_tsvector('simple', title || ' ' || COALESCE(content_text, '') || ' ' || COALESCE(legal_reasoning_summary, '')));

-- =============================================================================
-- TRIGGER: Auto-update updated_at
-- =============================================================================
CREATE TRIGGER update_legal_practice_kb_updated_at
BEFORE UPDATE ON public.legal_practice_kb
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- FUNCTION: Search legal practice KB (for AI use)
-- Returns ONLY reference material, clearly marked
-- =============================================================================
CREATE OR REPLACE FUNCTION public.search_legal_practice(
  search_query TEXT,
  category practice_category DEFAULT NULL,
  court court_type DEFAULT NULL,
  result_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  practice_category practice_category,
  court_type court_type,
  outcome case_outcome,
  applied_articles JSONB,
  key_violations TEXT[],
  legal_reasoning_summary TEXT,
  content_snippet TEXT,
  relevance_rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    -- Return only first 500 chars as snippet
    LEFT(lp.content_text, 500) AS content_snippet,
    ts_rank(
      to_tsvector('simple', lp.title || ' ' || COALESCE(lp.content_text, '') || ' ' || COALESCE(lp.legal_reasoning_summary, '')),
      plainto_tsquery('simple', search_query)
    ) AS relevance_rank
  FROM public.legal_practice_kb lp
  WHERE 
    lp.is_active = true
    AND (category IS NULL OR lp.practice_category = category)
    AND (court IS NULL OR lp.court_type = court)
    AND (
      to_tsvector('simple', lp.title || ' ' || COALESCE(lp.content_text, '') || ' ' || COALESCE(lp.legal_reasoning_summary, ''))
      @@ plainto_tsquery('simple', search_query)
    )
  ORDER BY relevance_rank DESC
  LIMIT result_limit
$$;

-- =============================================================================
-- COMMENTS: Document the separation between KB and user data
-- =============================================================================
COMMENT ON TABLE public.legal_practice_kb IS 
'Isolated Knowledge Base for legal practice examples (court decisions, complaints, rulings).
CRITICAL: This data is REFERENCE-ONLY and must NEVER be mixed with user case facts.
- Used for structural patterns, legal logic, and analogous practice references
- Accessible only to AI (for analysis) and Admins (for management)
- All documents must be anonymized before storage';

COMMENT ON COLUMN public.legal_practice_kb.visibility IS 
'Access control: ai_only = AI can read for reference, admin_only = visible in admin panel, internal = system use only';

COMMENT ON COLUMN public.legal_practice_kb.applied_articles IS 
'JSON array of legal articles applied. Format: [{"code": "criminal_code", "articles": ["104", "105"]}]';

COMMENT ON COLUMN public.legal_practice_kb.is_anonymized IS 
'MUST be true for all entries. Personal data must be removed before storage.';