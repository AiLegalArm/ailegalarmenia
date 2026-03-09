
-- Create storage bucket for PDF page screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('kb-page-images', 'kb-page-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read page images
CREATE POLICY "Anyone can view kb page images"
ON storage.objects FOR SELECT
USING (bucket_id = 'kb-page-images');

-- Allow authenticated users to upload page images (service role via edge functions)
CREATE POLICY "Authenticated users can upload kb page images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'kb-page-images' AND auth.role() = 'authenticated');

-- Allow deletion by authenticated users
CREATE POLICY "Authenticated users can delete kb page images"
ON storage.objects FOR DELETE
USING (bucket_id = 'kb-page-images' AND auth.role() = 'authenticated');
