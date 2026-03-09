
-- Create chunks table for legal practice KB
CREATE TABLE public.legal_practice_kb_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_id UUID NOT NULL REFERENCES public.legal_practice_kb(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_hash TEXT,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(doc_id, chunk_index)
);

-- Enable RLS
ALTER TABLE public.legal_practice_kb_chunks ENABLE ROW LEVEL SECURITY;

-- Admin can manage chunks
CREATE POLICY "Admins can manage chunks" ON public.legal_practice_kb_chunks
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can read chunks
CREATE POLICY "Authenticated users can read chunks" ON public.legal_practice_kb_chunks
  FOR SELECT USING (auth.role() = 'authenticated');

-- Create index for fast lookups
CREATE INDEX idx_lp_kb_chunks_doc_id ON public.legal_practice_kb_chunks(doc_id);
CREATE INDEX idx_lp_kb_chunks_hash ON public.legal_practice_kb_chunks(chunk_hash);

-- RPC to find docs without chunks
CREATE OR REPLACE FUNCTION public.kb_docs_without_chunks()
RETURNS SETOF public.legal_practice_kb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.*
  FROM public.legal_practice_kb d
  LEFT JOIN public.legal_practice_kb_chunks c ON c.doc_id = d.id
  WHERE c.id IS NULL
    AND d.is_active = true
  ORDER BY d.updated_at DESC
  LIMIT 5000;
$$;
