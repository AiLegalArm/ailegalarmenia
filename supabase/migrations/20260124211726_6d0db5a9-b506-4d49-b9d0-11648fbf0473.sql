-- Create teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  leader_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team_members table (lawyers in teams)
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Function to check if user is team leader
CREATE OR REPLACE FUNCTION public.is_team_leader(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = _team_id AND leader_id = _user_id
  )
$$;

-- Function to get team IDs where user is leader
CREATE OR REPLACE FUNCTION public.get_led_team_ids(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.teams WHERE leader_id = _user_id
$$;

-- Function to get user IDs from teams where user is leader
CREATE OR REPLACE FUNCTION public.get_team_member_ids(_leader_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.user_id 
  FROM public.team_members tm
  JOIN public.teams t ON tm.team_id = t.id
  WHERE t.leader_id = _leader_id
$$;

-- RLS Policies for teams
CREATE POLICY "Admins can manage all teams" ON public.teams
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Team leaders can view their teams" ON public.teams
FOR SELECT USING (leader_id = auth.uid());

CREATE POLICY "Team members can view their team" ON public.teams
FOR SELECT USING (
  id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
);

-- RLS Policies for team_members
CREATE POLICY "Admins can manage all team members" ON public.team_members
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Team leaders can view their team members" ON public.team_members
FOR SELECT USING (
  team_id IN (SELECT public.get_led_team_ids(auth.uid()))
);

CREATE POLICY "Users can see their own membership" ON public.team_members
FOR SELECT USING (user_id = auth.uid());

-- Update cases RLS to allow team leaders to view their team's cases
CREATE POLICY "Team leaders can view team cases" ON public.cases
FOR SELECT USING (
  lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
  AND deleted_at IS NULL
);

-- Update case_files RLS for team leaders
CREATE POLICY "Team leaders can view team files" ON public.case_files
FOR SELECT USING (
  deleted_at IS NULL AND 
  case_id IN (
    SELECT id FROM public.cases 
    WHERE lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
  )
);

-- Update ai_analysis RLS for team leaders
CREATE POLICY "Team leaders can view team AI analysis" ON public.ai_analysis
FOR SELECT USING (
  case_id IN (
    SELECT id FROM public.cases 
    WHERE lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
  )
);

-- Update audio_transcriptions RLS for team leaders
CREATE POLICY "Team leaders can view team transcriptions" ON public.audio_transcriptions
FOR SELECT USING (
  file_id IN (
    SELECT cf.id FROM public.case_files cf
    JOIN public.cases c ON cf.case_id = c.id
    WHERE c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
  )
);

-- Update ocr_results RLS for team leaders
CREATE POLICY "Team leaders can view team OCR" ON public.ocr_results
FOR SELECT USING (
  file_id IN (
    SELECT cf.id FROM public.case_files cf
    JOIN public.cases c ON cf.case_id = c.id
    WHERE c.lawyer_id IN (SELECT public.get_team_member_ids(auth.uid()))
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_teams_updated_at
BEFORE UPDATE ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();