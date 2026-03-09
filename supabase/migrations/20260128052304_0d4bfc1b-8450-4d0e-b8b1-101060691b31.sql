-- Allow clients to upload files to their own cases
CREATE POLICY "Clients can upload files to their cases"
ON public.case_files
FOR INSERT
WITH CHECK (
  case_id IN (
    SELECT id FROM public.cases 
    WHERE client_id = auth.uid()
  )
);

-- Allow clients to update (soft delete) their uploaded files
CREATE POLICY "Clients can update their uploaded files"
ON public.case_files
FOR UPDATE
USING (
  uploaded_by = auth.uid() 
  AND case_id IN (
    SELECT id FROM public.cases 
    WHERE client_id = auth.uid()
  )
);