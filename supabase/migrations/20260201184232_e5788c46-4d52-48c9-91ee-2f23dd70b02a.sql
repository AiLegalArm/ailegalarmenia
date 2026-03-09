-- Fix: allow case participants to UPDATE (including soft-delete) regardless of assigned app_role
-- The previous policies required has_role(...,'client') which can block legitimate users.

-- Replace multiple UPDATE policies with a single participant-based policy
DROP POLICY IF EXISTS "Clients can update their own cases" ON public.cases;
DROP POLICY IF EXISTS "Lawyers can update their cases" ON public.cases;
DROP POLICY IF EXISTS "Team leaders can update team cases" ON public.cases;

CREATE POLICY "Case participants can update cases"
ON public.cases
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  client_id = auth.uid()
  OR lawyer_id = auth.uid()
  OR lawyer_id IN (SELECT get_team_member_ids(auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  client_id = auth.uid()
  OR lawyer_id = auth.uid()
  OR lawyer_id IN (SELECT get_team_member_ids(auth.uid()))
  OR has_role(auth.uid(), 'admin'::app_role)
);
