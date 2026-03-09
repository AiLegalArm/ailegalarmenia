-- Create case_comments table for auditor feedback
CREATE TABLE public.case_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  content TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.case_comments ENABLE ROW LEVEL SECURITY;

-- Index for faster queries
CREATE INDEX idx_case_comments_case_id ON public.case_comments(case_id);
CREATE INDEX idx_case_comments_author_id ON public.case_comments(author_id);

-- RLS Policies

-- Admins can manage all comments
CREATE POLICY "Admins can manage all comments" ON public.case_comments
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Team leaders (auditors) can create comments on their team's cases
CREATE POLICY "Team leaders can create comments" ON public.case_comments
FOR INSERT WITH CHECK (
  auth.uid() = author_id
  AND case_id IN (
    SELECT c.id FROM public.cases c
    WHERE c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
  )
);

-- Team leaders can view comments on their team's cases
CREATE POLICY "Team leaders can view team comments" ON public.case_comments
FOR SELECT USING (
  case_id IN (
    SELECT c.id FROM public.cases c
    WHERE c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
  )
);

-- Team leaders can update their own comments
CREATE POLICY "Team leaders can update own comments" ON public.case_comments
FOR UPDATE USING (author_id = auth.uid());

-- Team leaders can delete their own comments
CREATE POLICY "Team leaders can delete own comments" ON public.case_comments
FOR DELETE USING (author_id = auth.uid());

-- Lawyers can view comments on their own cases
CREATE POLICY "Lawyers can view comments on their cases" ON public.case_comments
FOR SELECT USING (
  case_id IN (
    SELECT id FROM public.cases WHERE lawyer_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_case_comments_updated_at
BEFORE UPDATE ON public.case_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();