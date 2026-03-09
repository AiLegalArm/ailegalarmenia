-- Robust fix for persistent RLS failures on cases UPDATE (soft-delete)
-- 1) Make access check independent of role records and avoid SRF-in-IN edge cases
-- 2) Use the security definer helper in the cases UPDATE policy

CREATE OR REPLACE FUNCTION public.user_can_access_case(_case_id uuid)
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
        c.lawyer_id = auth.uid()
        OR c.client_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.teams t
          JOIN public.team_members tm ON tm.team_id = t.id
          WHERE t.leader_id = auth.uid()
            AND tm.user_id = c.lawyer_id
        )
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  );
$$;

-- Replace UPDATE policy to rely on helper
DROP POLICY IF EXISTS "Case participants can update cases" ON public.cases;

CREATE POLICY "Case participants can update cases"
ON public.cases
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (public.user_can_access_case(id))
WITH CHECK (public.user_can_access_case(id));
