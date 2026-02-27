
-- 1. Add mode to eval_cases (single_call or multi_call)
ALTER TABLE public.eval_cases
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'single_call';

-- 2. Add http_status and response_headers to eval_run_results
ALTER TABLE public.eval_run_results
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS response_headers jsonb;

-- 3. Create P0 Hardening Runtime eval suite
INSERT INTO public.eval_suites (id, name, description, is_active, version)
VALUES (
  'a0a0a0a0-a0a0-4000-8000-000000000001',
  'P0 Hardening Runtime',
  'Runtime regression gate for P0 hardening: CORS, strict_temporal, rate limiting, budget caps',
  true,
  1
);

-- 4A. CORS OPTIONS smoke test
INSERT INTO public.eval_cases (id, suite_id, name, description, target_function, mode, input_payload, invariants, tags)
VALUES (
  'b1b1b1b1-b1b1-4000-8000-000000000001',
  'a0a0a0a0-a0a0-4000-8000-000000000001',
  'CORS OPTIONS ai-analyze',
  'OPTIONS request to ai-analyze must return 204 with proper CORS headers',
  'ai-analyze',
  'single_call',
  '{"_method": "OPTIONS", "_headers": {"Origin": "https://ailegalarmenia.lovable.app"}}',
  '[
    {"type": "http_status_check", "params": {"expected": 204}},
    {"type": "header_check", "params": {"header": "access-control-allow-origin", "contains": "ailegalarmenia"}},
    {"type": "header_check", "params": {"header": "access-control-allow-headers", "contains": "authorization"}},
    {"type": "header_check", "params": {"header": "access-control-allow-headers", "contains": "content-type"}}
  ]',
  '{"p0", "cors"}'
);

-- 4B. strict_temporal ai-analyze
INSERT INTO public.eval_cases (id, suite_id, name, description, target_function, mode, input_payload, invariants, tags)
VALUES (
  'b1b1b1b1-b1b1-4000-8000-000000000002',
  'a0a0a0a0-a0a0-4000-8000-000000000001',
  'strict_temporal ai-analyze 400',
  'ai-analyze with strict_temporal=true and no reference_date must return 400',
  'ai-analyze',
  'single_call',
  '{"role": "advocate", "strict_temporal": true, "caseId": null}',
  '[
    {"type": "http_status_check", "params": {"expected": 400}},
    {"type": "field_check", "params": {"field": "error", "equals": "strict_temporal_violation"}}
  ]',
  '{"p0", "temporal"}'
);

-- 4C. Rate limit hourly (multi_call)
INSERT INTO public.eval_cases (id, suite_id, name, description, target_function, mode, input_payload, invariants, tags)
VALUES (
  'b1b1b1b1-b1b1-4000-8000-000000000003',
  'a0a0a0a0-a0a0-4000-8000-000000000001',
  'rate limit hourly legal-chat',
  'After exceeding hourly_limit, legal-chat must return 429. Requires client role with hourly_limit=2.',
  'legal-chat',
  'multi_call',
  '{"message": "test rate limit", "_call_count": 3}',
  '[
    {"type": "multi_call_status_sequence", "params": {"expected_last_status": 429, "expected_last_reason": "hourly_limit_exceeded"}}
  ]',
  '{"p0", "rate_limit"}'
);

-- 4D. Monthly token cap
INSERT INTO public.eval_cases (id, suite_id, name, description, target_function, mode, input_payload, invariants, tags)
VALUES (
  'b1b1b1b1-b1b1-4000-8000-000000000004',
  'a0a0a0a0-a0a0-4000-8000-000000000001',
  'monthly token cap legal-chat',
  'When monthly_token_limit is low (10), legal-chat must return 402 with monthly_token_exceeded',
  'legal-chat',
  'single_call',
  '{"message": "test monthly cap enforcement"}',
  '[
    {"type": "http_status_check", "params": {"expected": 402}},
    {"type": "field_check", "params": {"field": "reason", "equals": "monthly_token_exceeded"}}
  ]',
  '{"p0", "budget_cap"}'
);
