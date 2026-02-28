-- Storage INSERT policy: allow authenticated users to upload to their own autofill folder
CREATE POLICY "Users can upload autofill files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'autofill'
);

-- Storage SELECT policy: allow authenticated users to read their own autofill files
CREATE POLICY "Users can view their autofill files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'autofill'
);

-- Storage DELETE policy: allow cleanup of autofill temp files
CREATE POLICY "Users can delete their autofill files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] = 'autofill'
);