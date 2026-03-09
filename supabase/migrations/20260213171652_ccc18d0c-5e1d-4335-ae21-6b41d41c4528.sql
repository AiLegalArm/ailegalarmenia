
-- ============================================================
-- Create public.legal_documents canonical table
-- Problem: legal_chunks.doc_id is an opaque UUID with no FK,
--          no canonical document record, no versioning metadata.
-- Risk: Orphaned chunks, inconsistent doc_type, no dedup.
-- Solution: Canonical documents table with FK + indexes.
-- ============================================================

-- 1) Create table
CREATE TABLE public.legal_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_type text NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'AM',
  branch text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  title_alt text,
  content_text text NOT NULL,
  document_number text,
  date_adopted date,
  date_effective date,
  source_url text,
  source_name text,
  source_hash text,
  court_meta jsonb DEFAULT '{}'::jsonb,
  applied_articles jsonb DEFAULT '[]'::jsonb,
  key_violations text[],
  legal_reasoning_summary text,
  decision_map jsonb DEFAULT '{}'::jsonb,
  ingestion_meta jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Enable RLS
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_documents FORCE ROW LEVEL SECURITY;

-- 3) RLS policies (same pattern as legal_chunks)
CREATE POLICY "Authenticated users can read active legal documents"
  ON public.legal_documents FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage legal documents"
  ON public.legal_documents FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access on legal documents"
  ON public.legal_documents FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4) Indexes
CREATE UNIQUE INDEX idx_legal_documents_source_hash
  ON public.legal_documents (source_hash)
  WHERE source_hash IS NOT NULL;

CREATE INDEX idx_legal_documents_doc_type_active
  ON public.legal_documents (doc_type, is_active);

CREATE INDEX idx_legal_documents_branch
  ON public.legal_documents (branch);

CREATE INDEX idx_legal_documents_jurisdiction
  ON public.legal_documents (jurisdiction);

-- 5) Updated_at trigger (reuse existing function)
CREATE TRIGGER update_legal_documents_updated_at
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Add FK from legal_chunks.doc_id -> legal_documents.id
ALTER TABLE public.legal_chunks
  ADD CONSTRAINT fk_legal_chunks_doc
  FOREIGN KEY (doc_id) REFERENCES public.legal_documents(id)
  ON DELETE CASCADE;
