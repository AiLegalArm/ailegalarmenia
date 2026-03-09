-- Fix UPDATE policies for case_files to allow soft delete

-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "Clients can update their uploaded files" ON public.case_files;
DROP POLICY IF EXISTS "Lawyers can update their files" ON public.case_files;

-- Recreate UPDATE policy for clients with proper WITH CHECK
CREATE POLICY "Clients can update their uploaded files" 
ON public.case_files 
FOR UPDATE 
TO authenticated
USING (
  (uploaded_by = auth.uid()) 
  AND (case_id IN (SELECT id FROM cases WHERE client_id = auth.uid()))
)
WITH CHECK (
  (uploaded_by = auth.uid()) 
  AND (case_id IN (SELECT id FROM cases WHERE client_id = auth.uid()))
);

-- Recreate UPDATE policy for lawyers/admins with proper WITH CHECK
CREATE POLICY "Lawyers and admins can update files" 
ON public.case_files 
FOR UPDATE 
TO authenticated
USING (
  (uploaded_by = auth.uid()) 
  OR has_role(auth.uid(), 'admin')
)
WITH CHECK (
  (uploaded_by = auth.uid()) 
  OR has_role(auth.uid(), 'admin')
);