-- Add case_type and current_stage to cases table

-- Create enum for case types
CREATE TYPE case_type AS ENUM (
  'criminal',      -- քրեական
  'civil',         -- քաղաքացիական
  'administrative' -- վարչական
);

-- Add case_type and current_stage columns to cases table
ALTER TABLE public.cases
  ADD COLUMN case_type case_type,
  ADD COLUMN current_stage TEXT;

-- Add comment to columns for documentation
COMMENT ON COLUMN public.cases.case_type IS 'Type of case: criminal, civil, or administrative';
COMMENT ON COLUMN public.cases.current_stage IS 'Current stage of the case process';
