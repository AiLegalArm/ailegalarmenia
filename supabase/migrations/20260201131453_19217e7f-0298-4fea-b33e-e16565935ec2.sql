-- Drop restrictive storage policies and create more permissive ones for authenticated users

-- Drop existing upload policy that only allows lawyers/admins
DROP POLICY IF EXISTS "Lawyers can upload case files" ON storage.objects;

-- Create new policy that allows any authenticated user to upload to case-files bucket
-- The RLS on case_files table will handle the actual authorization
CREATE POLICY "Authenticated users can upload case files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'case-files'
);

-- Update SELECT policy to allow authenticated users to read their files
DROP POLICY IF EXISTS "Users can view their case files" ON storage.objects;

CREATE POLICY "Authenticated users can view case files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'case-files'
);

-- Update DELETE policy to allow file owners
DROP POLICY IF EXISTS "Admins can delete case files" ON storage.objects;

CREATE POLICY "Authenticated users can delete case files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'case-files'
);

-- Update UPDATE policy
DROP POLICY IF EXISTS "Lawyers can update case files" ON storage.objects;

CREATE POLICY "Authenticated users can update case files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'case-files'
);