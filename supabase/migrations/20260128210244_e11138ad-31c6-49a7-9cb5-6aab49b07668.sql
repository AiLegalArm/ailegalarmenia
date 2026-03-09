-- Fix UPDATE policies for case_files to allow soft delete by case owner

-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "Clients can update their uploaded files" ON public.case_files;
DROP POLICY IF EXISTS "Lawyers and admins can update files" ON public.case_files;

-- Allow clients to soft-delete files on their cases (regardless of uploader)
CREATE POLICY "Clients can soft-delete files on their cases" 
ON public.case_files 
FOR UPDATE 
TO authenticated
USING (
  case_id IN (SELECT id FROM cases WHERE client_id = auth.uid())
)
WITH CHECK (
  case_id IN (SELECT id FROM cases WHERE client_id = auth.uid())
);

-- Allow lawyers and admins to update files on their cases
CREATE POLICY "Lawyers and admins can update files" 
ON public.case_files 
FOR UPDATE 
TO authenticated
USING (
  (case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid()))
  OR has_role(auth.uid(), 'admin')
)
WITH CHECK (
  (case_id IN (SELECT id FROM cases WHERE lawyer_id = auth.uid()))
  OR has_role(auth.uid(), 'admin')
);