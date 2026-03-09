-- Add auditor_id column to profiles table
-- This allows lawyers to be assigned to specific auditors

ALTER TABLE public.profiles
ADD COLUMN auditor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add comment to explain the column
COMMENT ON COLUMN public.profiles.auditor_id IS 'For lawyers: the auditor assigned to supervise them';

-- Create index for faster lookups of lawyers by auditor
CREATE INDEX idx_profiles_auditor_id ON public.profiles(auditor_id);
