-- Fix RLS for case_files soft-delete failing due to cases RLS in subqueries
-- Use SECURITY DEFINER helper to check case access without being affected by RLS on public.cases

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
        OR (c.lawyer_id IN (SELECT get_team_member_ids(auth.uid())))
        OR has_role(auth.uid(), 'admin'::app_role)
      )
  );
$$;

-- Recreate UPDATE policy to rely on the helper function
DROP POLICY IF EXISTS "Case members can update files" ON public.case_files;

CREATE POLICY "Case members can update files"
ON public.case_files
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  public.user_can_access_case(case_id)
  OR uploaded_by = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  public.user_can_access_case(case_id)
  OR uploaded_by = auth.uid()
  OR has_role(auth.uid(), 'admin'::app_role)
);
