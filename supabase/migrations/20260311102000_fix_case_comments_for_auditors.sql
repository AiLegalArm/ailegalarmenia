-- 1. Удаляем старые политики для team leaders
DROP POLICY IF EXISTS "Team leaders can create comments" ON public.case_comments;
DROP POLICY IF EXISTS "Team leaders can view team comments" ON public.case_comments;
DROP POLICY IF EXISTS "Team leaders can update own comments" ON public.case_comments;
DROP POLICY IF EXISTS "Team leaders can delete own comments" ON public.case_comments;

-- 2. Создаем новые политики для аудиторов
CREATE POLICY "Auditors can create comments" ON public.case_comments
FOR INSERT WITH CHECK (
  auth.uid() = author_id
  AND public.has_role(auth.uid(), 'auditor')
  AND case_id IN (
    SELECT c.id FROM public.cases c
    WHERE c.lawyer_id IN (SELECT public.get_my_lawyer_ids())
  )
);

CREATE POLICY "Auditors can view team comments" ON public.case_comments
FOR SELECT USING (
  public.has_role(auth.uid(), 'auditor')
  AND case_id IN (
    SELECT c.id FROM public.cases c
    WHERE c.lawyer_id IN (SELECT public.get_my_lawyer_ids())
  )
);

CREATE POLICY "Auditors can update own comments" ON public.case_comments
FOR UPDATE USING (
  author_id = auth.uid()
  AND public.has_role(auth.uid(), 'auditor')
);

CREATE POLICY "Auditors can delete own comments" ON public.case_comments
FOR DELETE USING (
  author_id = auth.uid()
  AND public.has_role(auth.uid(), 'auditor')
);
