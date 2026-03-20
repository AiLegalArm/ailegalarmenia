-- Fix get_user_roles to always return array (never null)
-- This prevents potential issues in frontend when roles are not assigned

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS app_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY_AGG(role),
    ARRAY[]::app_role[]
  ) 
  FROM public.user_roles 
  WHERE user_id = _user_id
$$;

-- Ensure admin can always read own roles (RLS bypass for self)
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Make sure admin role check works properly
-- Note: has_role function uses SECURITY DEFINER, so it bypasses RLS
