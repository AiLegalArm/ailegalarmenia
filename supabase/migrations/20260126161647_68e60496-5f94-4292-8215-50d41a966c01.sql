-- =============================================
-- Ավելացնել lawyer դերի հիերարխիա (Add lawyer role hierarchy)
-- Փաստաբաններն անհատական կապված են auditor-ների հետ
-- (Lawyers are individually linked to auditors)
-- =============================================

-- Ավելացնել auditor_id սյունը profiles աղյուսակին
-- (Add auditor_id column to profiles table)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS auditor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Ստեղծել ինդեքս արագ որոնման համար
-- (Create index for fast lookups)
CREATE INDEX IF NOT EXISTS idx_profiles_auditor_id ON public.profiles(auditor_id);

-- Ավելացնել մեկնաբանություն սյան համար
-- (Add comment to column)
COMMENT ON COLUMN public.profiles.auditor_id IS 'Փաստաբանի վերահսկիչի ID-ն (ID of the auditor supervising this lawyer)';

-- =============================================
-- RLS քաղաքականություններ profiles աղյուսակի համար
-- (RLS policies for profiles table)
-- =============================================

-- Auditors-ը կարող են տեսնել միայն իրենց փաստաբաններին
-- (Auditors can see only their assigned lawyers)
CREATE POLICY "Auditors can view their lawyers"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'auditor')
    AND auditor_id = auth.uid()
  );

-- Փաստաբանները կարող են տեսնել իրենց վերահսկիչին
-- (Lawyers can view their auditor)
CREATE POLICY "Lawyers can view their auditor"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'lawyer')
    AND id = (SELECT auditor_id FROM public.profiles WHERE id = auth.uid())
  );

-- =============================================
-- Թարմացնել user_roles RLS քաղաքականություններ
-- (Update user_roles RLS policies)
-- =============================================

-- Auditors-ը կարող են տեսնել իրենց փաստաբանների դերերը
-- (Auditors can view roles of their assigned lawyers)
CREATE POLICY "Auditors can view their lawyers roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'auditor')
    AND user_id IN (
      SELECT id FROM public.profiles WHERE auditor_id = auth.uid()
    )
  );

-- =============================================
-- Թարմացնել cases RLS քաղաքականություններ
-- (Update cases RLS policies)
-- =============================================

-- Auditors-ը կարող են տեսնել իրենց փաստաբանների գործերը
-- (Auditors can view cases of their assigned lawyers)
CREATE POLICY "Auditors can view their lawyers cases"
  ON public.cases FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'auditor')
    AND lawyer_id IN (
      SELECT id FROM public.profiles WHERE auditor_id = auth.uid()
    )
    AND deleted_at IS NULL
  );

-- =============================================
-- Թարմացնել case_files RLS քաղաքականություններ
-- (Update case_files RLS policies)
-- =============================================

-- Auditors-ը կարող են տեսնել իրենց փաստաբանների գործերի ֆայլերը
-- (Auditors can view files from their lawyers' cases)
CREATE POLICY "Auditors can view their lawyers case files"
  ON public.case_files FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'auditor')
    AND deleted_at IS NULL
    AND case_id IN (
      SELECT id FROM public.cases 
      WHERE lawyer_id IN (
        SELECT id FROM public.profiles WHERE auditor_id = auth.uid()
      )
    )
  );

-- =============================================
-- Թարմացնել ai_analysis RLS քաղաքականություններ
-- (Update ai_analysis RLS policies)
-- =============================================

-- Auditors-ը կարող են տեսնել իրենց փաստաբանների AI վերլուծությունները
-- (Auditors can view AI analysis from their lawyers' cases)
CREATE POLICY "Auditors can view their lawyers AI analysis"
  ON public.ai_analysis FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'auditor')
    AND case_id IN (
      SELECT id FROM public.cases 
      WHERE lawyer_id IN (
        SELECT id FROM public.profiles WHERE auditor_id = auth.uid()
      )
    )
  );

-- =============================================
-- Թարմացնել ocr_results RLS քաղաքականություններ
-- (Update ocr_results RLS policies)
-- =============================================

-- Auditors-ը կարող են տեսնել իրենց փաստաբանների OCR արդյունքները
-- (Auditors can view OCR results from their lawyers' files)
CREATE POLICY "Auditors can view their lawyers OCR results"
  ON public.ocr_results FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'auditor')
    AND file_id IN (
      SELECT cf.id FROM public.case_files cf
      JOIN public.cases c ON cf.case_id = c.id
      WHERE c.lawyer_id IN (
        SELECT id FROM public.profiles WHERE auditor_id = auth.uid()
      )
    )
  );

-- =============================================
-- Թարմացնել audio_transcriptions RLS քաղաքականություններ
-- (Update audio_transcriptions RLS policies)
-- =============================================

-- Auditors-ը կարող են տեսնել իրենց փաստաբանների ձայնագրությունների տեքստերը
-- (Auditors can view transcriptions from their lawyers' files)
CREATE POLICY "Auditors can view their lawyers transcriptions"
  ON public.audio_transcriptions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'auditor')
    AND file_id IN (
      SELECT cf.id FROM public.case_files cf
      JOIN public.cases c ON cf.case_id = c.id
      WHERE c.lawyer_id IN (
        SELECT id FROM public.profiles WHERE auditor_id = auth.uid()
      )
    )
  );
