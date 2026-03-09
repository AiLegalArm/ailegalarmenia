-- Add facts and legal_question columns to cases table
ALTER TABLE public.cases 
ADD COLUMN IF NOT EXISTS facts text,
ADD COLUMN IF NOT EXISTS legal_question text;