-- Drop existing INSERT policies on case_files
DROP POLICY IF EXISTS "Clients can upload files to their cases" ON public.case_files;
DROP POLICY IF EXISTS "Lawyers can upload files" ON public.case_files;

-- Create a single unified INSERT policy for authenticated users
CREATE POLICY "Authenticated users can upload files to their cases"
ON public.case_files
FOR INSERT
TO authenticated
WITH CHECK (
  case_id IN (
    SELECT id FROM cases 
    WHERE lawyer_id = auth.uid() 
       OR client_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);