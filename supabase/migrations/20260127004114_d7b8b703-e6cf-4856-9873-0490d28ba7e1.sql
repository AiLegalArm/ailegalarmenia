-- Allow clients to create their own cases
CREATE POLICY "Clients can create their own cases"
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role) AND client_id = auth.uid()
);

-- Allow clients to update their own cases
CREATE POLICY "Clients can update their own cases"
ON public.cases
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role) AND client_id = auth.uid()
);