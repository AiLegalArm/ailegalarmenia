
-- Drop the old unique constraint that blocks reuse of case_number from soft-deleted cases
ALTER TABLE public.cases DROP CONSTRAINT cases_case_number_key;

-- Create a partial unique index that only enforces uniqueness among non-deleted cases
CREATE UNIQUE INDEX cases_case_number_active_key ON public.cases (case_number) WHERE deleted_at IS NULL;
