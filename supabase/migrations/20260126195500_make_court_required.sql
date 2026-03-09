-- Make court_name field required in cases table
-- This migration adds NOT NULL constraint to court_name field

-- First, set a default value for any existing rows with NULL court_name
UPDATE public.cases 
SET court_name = 'Սահմանադրական դատարան'
WHERE court_name IS NULL OR court_name = '';

-- Now add the NOT NULL constraint
ALTER TABLE public.cases 
ALTER COLUMN court_name SET NOT NULL;
