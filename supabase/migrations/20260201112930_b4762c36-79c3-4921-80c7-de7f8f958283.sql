-- Add storage policy for all authenticated users to upload to complaints folder
CREATE POLICY "Users can upload complaint files" 
ON storage.objects 
FOR INSERT 
TO authenticated 
WITH CHECK (
  bucket_id = 'case-files' 
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND (storage.foldername(name))[2] = 'complaints'
);

-- Add policy for users to view their own complaint files
CREATE POLICY "Users can view their complaint files" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (
  bucket_id = 'case-files' 
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND (storage.foldername(name))[2] = 'complaints'
);

-- Add policy for users to delete their own complaint files
CREATE POLICY "Users can delete their complaint files" 
ON storage.objects 
FOR DELETE 
TO authenticated 
USING (
  bucket_id = 'case-files' 
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND (storage.foldername(name))[2] = 'complaints'
);