
CREATE TABLE IF NOT EXISTS public.agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  request_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed')),
  progress jsonb,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agent_jobs_idempotency UNIQUE (user_id, case_id, job_type, request_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_user_status ON public.agent_jobs (user_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_case ON public.agent_jobs (case_id);
CREATE INDEX IF NOT EXISTS idx_agent_jobs_queue_claim ON public.agent_jobs (status, created_at) WHERE status = 'queued';

CREATE OR REPLACE FUNCTION public.set_agent_jobs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_jobs_updated_at ON public.agent_jobs;
CREATE TRIGGER trg_agent_jobs_updated_at
  BEFORE UPDATE ON public.agent_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_agent_jobs_updated_at();

ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs"
  ON public.agent_jobs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own jobs"
  ON public.agent_jobs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access"
  ON public.agent_jobs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins full access"
  ON public.agent_jobs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
