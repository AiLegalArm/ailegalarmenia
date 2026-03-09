-- Fix: allow soft-delete (UPDATE deleted_at) on cases without RLS violation
-- The current UPDATE policies lack explicit WITH CHECK, which can block updates in PostgREST.

-- Client updates (including soft-delete)
DROP POLICY IF EXISTS "Clients can update their own cases" ON public.cases;
CREATE POLICY "Clients can update their own cases"
ON public.cases
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND client_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role)
  AND client_id = auth.uid()
);

-- Lawyer updates (including soft-delete)
DROP POLICY IF EXISTS "Lawyers can update their cases" ON public.cases;
CREATE POLICY "Lawyers can update their cases"
ON public.cases
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  lawyer_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  lawyer_id = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Team leader updates for their team members' cases
DROP POLICY IF EXISTS "Team leaders can update team cases" ON public.cases;
CREATE POLICY "Team leaders can update team cases"
ON public.cases
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  lawyer_id IN (SELECT get_team_member_ids(auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  lawyer_id IN (SELECT get_team_member_ids(auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);
