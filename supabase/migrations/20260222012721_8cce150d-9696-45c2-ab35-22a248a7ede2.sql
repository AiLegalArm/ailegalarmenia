
-- Queue table for background chunk+embed processing
CREATE TABLE IF NOT EXISTS public.practice_chunk_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES public.legal_practice_kb(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'chunk' CHECK (job_type IN ('chunk', 'embed', 'chunk_and_embed')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead_letter')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, job_type)
);

-- Indexes for efficient worker queries
CREATE INDEX idx_practice_chunk_jobs_status ON public.practice_chunk_jobs(status, attempts);
CREATE INDEX idx_practice_chunk_jobs_document ON public.practice_chunk_jobs(document_id);

-- Enable RLS
ALTER TABLE public.practice_chunk_jobs ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage chunk jobs"
  ON public.practice_chunk_jobs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Service role full access for edge functions
CREATE POLICY "Service role full access to chunk jobs"
  ON public.practice_chunk_jobs FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_practice_chunk_jobs_updated_at
  BEFORE UPDATE ON public.practice_chunk_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
