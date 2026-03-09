-- Add party_role column to cases table for claimant/defendant selection
ALTER TABLE public.cases 
ADD COLUMN IF NOT EXISTS party_role TEXT CHECK (party_role IN ('claimant', 'defendant'));

-- Add comment for documentation
COMMENT ON COLUMN public.cases.party_role IS 'Процессуальная роль пользователя: claimant (истец) или defendant (ответчик)';