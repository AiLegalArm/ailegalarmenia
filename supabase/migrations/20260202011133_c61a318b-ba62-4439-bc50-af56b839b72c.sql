-- Add notes field to case_files for per-file task tracking
ALTER TABLE public.case_files 
ADD COLUMN notes TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.case_files.notes IS 'User notes/tasks for this file (e.g., what needs to be done)';