-- Fix: auth.uid() inside SECURITY DEFINER can be unreliable in some setups.
-- Use an explicit user_id parameter for access checks and reference it from policies.

CREATE OR REPLACE FUNCTION public.user_can_access_case_as(_user_id uuid, _case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cases c
    WHERE c.id = _case_id
      AND (
        c.lawyer_id = _user_id
        OR c.client_id = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.teams t
          JOIN public.team_members tm ON tm.team_id = t.id
          WHERE t.leader_id = _user_id
            AND tm.user_id = c.lawyer_id
        )
        OR public.has_role(_user_id, 'admin'::app_role)
      )
  );
$$;

-- Recreate UPDATE policy to use the explicit-user helper
DROP POLICY IF EXISTS "Case participants can update cases" ON public.cases;

CREATE POLICY "Case participants can update cases"
ON public.cases
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (public.user_can_access_case_as(auth.uid(), id))
WITH CHECK (public.user_can_access_case_as(auth.uid(), id));
