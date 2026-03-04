
-- ============================================================
-- Storage RLS hardening: kb-page-images, telegram-uploads
-- Idempotent: DROP IF EXISTS + CREATE
-- ============================================================

-- ─── A) kb-page-images: restrict INSERT & DELETE to admin ───

DROP POLICY IF EXISTS "Authenticated users can upload kb page images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete kb page images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload kb page images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete kb page images" ON storage.objects;

CREATE POLICY "Admins can upload kb page images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'kb-page-images'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete kb page images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'kb-page-images'
  AND public.has_role(auth.uid(), 'admin')
);

-- SELECT stays as-is (public bucket, anyone can view)

-- ─── B) telegram-uploads: restrict INSERT to service_role ───

DROP POLICY IF EXISTS "Service can upload telegram files" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload telegram files" ON storage.objects;

CREATE POLICY "Service role can upload telegram files"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (
  bucket_id = 'telegram-uploads'
);

-- SELECT and DELETE already scoped to auth.uid() folder – no changes needed

-- ─── C) case-files: no changes needed ───
-- All existing policies are correctly scoped to case membership
-- or user-owned autofill/complaints folders. Verified:
--   - Case members: lawyer_id, client_id, team, or admin
--   - Autofill: foldername[1] = auth.uid(), foldername[2] = 'autofill'
--   - Complaints: foldername[1] = auth.uid(), foldername[2] = 'complaints'
