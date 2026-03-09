-- Create table to store files received via Telegram
CREATE TABLE public.telegram_uploads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  caption TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_uploads ENABLE ROW LEVEL SECURITY;

-- Users can view their own uploads
CREATE POLICY "Users can view their own telegram uploads"
  ON public.telegram_uploads FOR SELECT
  USING (auth.uid() = user_id);

-- Users can delete their own uploads
CREATE POLICY "Users can delete their own telegram uploads"
  ON public.telegram_uploads FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can insert (from edge function)
CREATE POLICY "Service role can insert telegram uploads"
  ON public.telegram_uploads FOR INSERT
  WITH CHECK (true);

-- Admins can view all uploads
CREATE POLICY "Admins can view all telegram uploads"
  ON public.telegram_uploads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create storage bucket for telegram uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('telegram-uploads', 'telegram-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can view their own telegram files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'telegram-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own telegram files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'telegram-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Service can upload telegram files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'telegram-uploads');