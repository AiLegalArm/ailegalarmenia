-- =============================================
-- STORAGE BUCKET FOR CASE FILES
-- =============================================

-- Create storage bucket for case files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'case-files', 
  'case-files', 
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/tiff', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg']
);

-- Storage policies for case-files bucket

-- Lawyers and admins can upload files
CREATE POLICY "Lawyers can upload case files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-files'
  AND (
    public.has_role(auth.uid(), 'lawyer')
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- Users can view files from their cases
CREATE POLICY "Users can view their case files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-files'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.case_files cf
      JOIN public.cases c ON cf.case_id = c.id
      WHERE cf.storage_path = name
      AND (c.lawyer_id = auth.uid() OR c.client_id = auth.uid())
    )
  )
);

-- Lawyers and admins can update files
CREATE POLICY "Lawyers can update case files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'case-files'
  AND (
    public.has_role(auth.uid(), 'lawyer')
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- Admins can delete files
CREATE POLICY "Admins can delete case files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-files'
  AND public.has_role(auth.uid(), 'admin')
);