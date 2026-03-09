-- Allow users to soft-delete (and otherwise update) their own uploaded files
-- This fixes scenarios where a user uploaded a file but is not considered a "case member" by the existing policy.

CREATE POLICY "Uploaders can update own case files"
ON public.case_files
FOR UPDATE
TO authenticated
USING (uploaded_by = auth.uid())
WITH CHECK (uploaded_by = auth.uid());

-- (Optional hard delete support for future use)
CREATE POLICY "Uploaders can delete own case files"
ON public.case_files
FOR DELETE
TO authenticated
USING (uploaded_by = auth.uid());