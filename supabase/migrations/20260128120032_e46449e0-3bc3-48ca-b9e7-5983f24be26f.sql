-- =============================================
-- FIX OVERLY PERMISSIVE RLS POLICIES
-- =============================================

-- 1. Fix kb_versions: Restrict to authenticated users only
DROP POLICY IF EXISTS "Everyone can read KB versions" ON public.kb_versions;

CREATE POLICY "Authenticated users can read KB versions"
ON public.kb_versions
FOR SELECT
TO authenticated
USING (true);

-- 2. Fix api_usage: Only allow authenticated users to insert their own usage
DROP POLICY IF EXISTS "Service can insert usage" ON public.api_usage;

CREATE POLICY "Authenticated users can insert own usage"
ON public.api_usage
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Note: user_id IS NULL allows edge functions with service role to insert without user context