-- Add auditor_id column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS auditor_id uuid REFERENCES auth.users(id);

-- Create case_type enum if not exists
DO $$ BEGIN
  CREATE TYPE public.case_type AS ENUM ('criminal', 'civil', 'administrative');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add missing columns to cases table
ALTER TABLE public.cases 
ADD COLUMN IF NOT EXISTS case_type public.case_type DEFAULT 'civil',
ADD COLUMN IF NOT EXISTS current_stage text DEFAULT 'preliminary',
ADD COLUMN IF NOT EXISTS court text;

-- Create index for auditor_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_auditor_id ON public.profiles(auditor_id);