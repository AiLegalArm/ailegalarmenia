-- Make case_type and current_stage required fields

-- Set default values for existing NULL records
UPDATE public.cases
SET case_type = 'criminal'
WHERE case_type IS NULL;

UPDATE public.cases
SET current_stage = 'investigation'
WHERE current_stage IS NULL;

-- Make fields required
ALTER TABLE public.cases
  ALTER COLUMN case_type SET NOT NULL,
  ALTER COLUMN current_stage SET NOT NULL;

-- Update comments
COMMENT ON COLUMN public.cases.case_type IS 'Type of case: criminal, civil, or administrative. Required field.';
COMMENT ON COLUMN public.cases.current_stage IS 'Current stage of the case process. Required field.';
