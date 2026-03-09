
-- =============================================================================
-- Eval Framework: eval_suites, eval_cases, eval_runs, eval_run_results
-- =============================================================================

-- Eval suites group related test cases
CREATE TABLE public.eval_suites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eval_suites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage eval suites"
  ON public.eval_suites FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Individual eval test cases
CREATE TABLE public.eval_cases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suite_id uuid NOT NULL REFERENCES public.eval_suites(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- Which edge function to call: ai-analyze, generate-document, legal-chat, vector-search
  target_function text NOT NULL,
  -- Input payload sent to the edge function
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Expected invariants to check
  invariants jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Scenario tags: temporal, injection, multilingual, regression
  tags text[] NOT NULL DEFAULT '{}'::text[],
  -- Optional reference_date for temporal checks
  reference_date date,
  -- Expected language of output
  expected_language text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eval_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage eval cases"
  ON public.eval_cases FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- A single eval run (execution of a suite)
CREATE TABLE public.eval_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  suite_id uuid NOT NULL REFERENCES public.eval_suites(id),
  status text NOT NULL DEFAULT 'pending',
  total_cases integer NOT NULL DEFAULT 0,
  passed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  triggered_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eval_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage eval runs"
  ON public.eval_runs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Individual results per case per run
CREATE TABLE public.eval_run_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.eval_runs(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.eval_cases(id),
  status text NOT NULL DEFAULT 'pending',
  -- Raw response from the edge function
  raw_response jsonb,
  -- Invariant check results
  invariant_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Temporal violation details (Prompt B)
  temporal_violations jsonb,
  latency_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eval_run_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage eval run results"
  ON public.eval_run_results FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX idx_eval_cases_suite ON public.eval_cases(suite_id);
CREATE INDEX idx_eval_runs_suite ON public.eval_runs(suite_id);
CREATE INDEX idx_eval_run_results_run ON public.eval_run_results(run_id);
CREATE INDEX idx_eval_run_results_case ON public.eval_run_results(case_id);
