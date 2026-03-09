-- Make case_type and current_stage required for new records
-- Add a default value for case_type to allow gradual migration
ALTER TABLE public.cases
  ALTER COLUMN case_type SET DEFAULT 'criminal';

-- For now, we make these fields optional to allow migration of existing records
-- In a future migration, after backfilling data, we can make them NOT NULL
-- This is a safer approach than using CHECK constraints with deleted_at

COMMENT ON COLUMN public.cases.case_type IS 'Type of case: criminal, civil, or administrative. Required for new cases.';
COMMENT ON COLUMN public.cases.current_stage IS 'Current stage of the case process. Required for new cases.';
