-- Add court field to cases table (required field for court selection)

-- Add court column to cases table
ALTER TABLE public.cases
  ADD COLUMN court TEXT;

-- Set a default value for existing records (first court in the list)
UPDATE public.cases
SET court = 'Սահմանադրական դատարան'
WHERE court IS NULL;

-- Make court required for new records
ALTER TABLE public.cases
  ALTER COLUMN court SET NOT NULL;

-- Add comment to column for documentation
COMMENT ON COLUMN public.cases.court IS 'Court handling the case. Required field.';
