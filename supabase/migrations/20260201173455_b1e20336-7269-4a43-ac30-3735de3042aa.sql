-- Fix UPDATE permissions for case files: allow the uploader to soft-delete their own files
-- without accidentally restricting other legitimate updaters.

-- Remove the previously added granular policies (they can become RESTRICTIVE depending on environment)
DROP POLICY IF EXISTS "Uploaders can update own case files" ON public.case_files;
DROP POLICY IF EXISTS "Uploaders can delete own case files" ON public.case_files;

-- Recreate/update the main UPDATE policy to include the uploader condition.
DROP POLICY IF EXISTS "Case members can update files" ON public.case_files;

CREATE POLICY "Case members can update files"
ON public.case_files
FOR UPDATE
TO authenticated
USING (
  (
    case_id IN (
      SELECT c.id
      FROM public.cases c
      WHERE (
        (c.lawyer_id = auth.uid())
        OR (c.client_id = auth.uid())
        OR (c.lawyer_id IN (SELECT get_team_member_ids(auth.uid()) AS get_team_member_ids))
      )
    )
  )
  OR (uploaded_by = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  (
    case_id IN (
      SELECT c.id
      FROM public.cases c
      WHERE (
        (c.lawyer_id = auth.uid())
        OR (c.client_id = auth.uid())
        OR (c.lawyer_id IN (SELECT get_team_member_ids(auth.uid()) AS get_team_member_ids))
      )
    )
  )
  OR (uploaded_by = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
);
