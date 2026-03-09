-- Create table for managing AI prompts
CREATE TABLE public.ai_prompts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    function_name TEXT NOT NULL,
    module_type TEXT NOT NULL,
    name_hy TEXT NOT NULL,
    name_ru TEXT NOT NULL,
    name_en TEXT,
    description TEXT,
    prompt_text TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID,
    UNIQUE(function_name, module_type)
);

-- Create prompt version history table
CREATE TABLE public.ai_prompt_versions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    prompt_id UUID NOT NULL REFERENCES public.ai_prompts(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    prompt_text TEXT NOT NULL,
    change_reason TEXT,
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    changed_by UUID
);

-- Enable RLS
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_prompts (admin only)
CREATE POLICY "Admins can view prompts" ON public.ai_prompts
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert prompts" ON public.ai_prompts
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update prompts" ON public.ai_prompts
    FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete prompts" ON public.ai_prompts
    FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for prompt versions (admin only)
CREATE POLICY "Admins can view prompt versions" ON public.ai_prompt_versions
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert prompt versions" ON public.ai_prompt_versions
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger to track version history
CREATE OR REPLACE FUNCTION public.track_prompt_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Insert old version into history when prompt_text changes
    IF OLD.prompt_text IS DISTINCT FROM NEW.prompt_text THEN
        INSERT INTO public.ai_prompt_versions (
            prompt_id, version_number, prompt_text, change_reason, changed_by
        ) VALUES (
            OLD.id, OLD.current_version, OLD.prompt_text, 'Updated', auth.uid()
        );
        
        -- Increment version number
        NEW.current_version := COALESCE(OLD.current_version, 1) + 1;
    END IF;
    
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER track_ai_prompt_version
    BEFORE UPDATE ON public.ai_prompts
    FOR EACH ROW
    EXECUTE FUNCTION public.track_prompt_version();

-- Index for faster lookups
CREATE INDEX idx_ai_prompts_function ON public.ai_prompts(function_name);
CREATE INDEX idx_ai_prompts_module ON public.ai_prompts(module_type);
CREATE INDEX idx_ai_prompt_versions_prompt_id ON public.ai_prompt_versions(prompt_id);