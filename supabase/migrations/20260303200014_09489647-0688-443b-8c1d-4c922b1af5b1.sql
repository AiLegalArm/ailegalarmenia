
DROP POLICY IF EXISTS "Authenticated users can create AI analysis for accessible cases" ON public.ai_analysis;
CREATE POLICY "Authenticated users can create AI analysis for accessible cases"
ON public.ai_analysis FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'lawyer'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'client'::app_role)
    AND case_id IN (SELECT id FROM cases WHERE client_id = auth.uid())
  )
  OR (
    has_role(auth.uid(), 'auditor'::app_role)
    AND user_can_access_case(case_id)
  )
);

DROP POLICY IF EXISTS "Auditors can view team cases" ON public.cases;
CREATE POLICY "Auditors can view team cases"
ON public.cases FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'auditor'::app_role)
  AND deleted_at IS NULL
  AND lawyer_id IN (SELECT get_team_member_ids(auth.uid()))
);

DROP POLICY IF EXISTS "Auditors can create cases" ON public.cases;
CREATE POLICY "Auditors can create cases"
ON public.cases FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'auditor'::app_role));

DROP POLICY IF EXISTS "Auditors can update team cases" ON public.cases;
CREATE POLICY "Auditors can update team cases"
ON public.cases FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'auditor'::app_role) AND user_can_access_case(id))
WITH CHECK (has_role(auth.uid(), 'auditor'::app_role) AND user_can_access_case(id));

DROP POLICY IF EXISTS "Auditors can view team AI analysis" ON public.ai_analysis;
CREATE POLICY "Auditors can view team AI analysis"
ON public.ai_analysis FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'auditor'::app_role) AND user_can_access_case(case_id));

DROP POLICY IF EXISTS "Auditors can view team files" ON public.case_files;
CREATE POLICY "Auditors can view team files"
ON public.case_files FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'auditor'::app_role)
  AND deleted_at IS NULL
  AND case_id IN (SELECT c.id FROM cases c WHERE c.lawyer_id IN (SELECT get_team_member_ids(auth.uid())))
);

DROP POLICY IF EXISTS "Auditors can upload files to team cases" ON public.case_files;
CREATE POLICY "Auditors can upload files to team cases"
ON public.case_files FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'auditor'::app_role)
  AND uploaded_by = auth.uid()
  AND case_id IN (SELECT c.id FROM cases c WHERE c.lawyer_id IN (SELECT get_team_member_ids(auth.uid())))
);

DROP POLICY IF EXISTS "Auditors can view team transcriptions" ON public.audio_transcriptions;
CREATE POLICY "Auditors can view team transcriptions"
ON public.audio_transcriptions FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'auditor'::app_role)
  AND file_id IN (
    SELECT cf.id FROM case_files cf JOIN cases c ON cf.case_id = c.id
    WHERE c.lawyer_id IN (SELECT get_team_member_ids(auth.uid()))
  )
);
