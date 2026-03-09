-- Add version history table for knowledge base
CREATE TABLE public.kb_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_text TEXT NOT NULL,
  category kb_category NOT NULL,
  source_name TEXT,
  source_url TEXT,
  article_number TEXT,
  version_date DATE,
  version_number INTEGER NOT NULL DEFAULT 1,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  change_reason TEXT
);

-- Enable RLS
ALTER TABLE public.kb_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies for kb_versions
CREATE POLICY "Everyone can read KB versions"
ON public.kb_versions
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage KB versions"
ON public.kb_versions
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create index for faster lookups
CREATE INDEX idx_kb_versions_kb_id ON public.kb_versions(kb_id);
CREATE INDEX idx_kb_versions_changed_at ON public.kb_versions(changed_at DESC);

-- Add version tracking to knowledge_base
ALTER TABLE public.knowledge_base ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;

-- Function to auto-create version history on update
CREATE OR REPLACE FUNCTION public.track_kb_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert old version into history
  INSERT INTO public.kb_versions (
    kb_id, title, content_text, category, source_name, source_url, 
    article_number, version_date, version_number, changed_by
  ) VALUES (
    OLD.id, OLD.title, OLD.content_text, OLD.category, OLD.source_name, 
    OLD.source_url, OLD.article_number, OLD.version_date, OLD.current_version, auth.uid()
  );
  
  -- Increment version number
  NEW.current_version := COALESCE(OLD.current_version, 1) + 1;
  NEW.updated_at := now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for version tracking
CREATE TRIGGER track_kb_version_trigger
BEFORE UPDATE ON public.knowledge_base
FOR EACH ROW
WHEN (OLD.content_text IS DISTINCT FROM NEW.content_text OR OLD.title IS DISTINCT FROM NEW.title)
EXECUTE FUNCTION public.track_kb_version();