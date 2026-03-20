-- Harden role helpers against role enumeration and return deterministic empty arrays.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_id UUID := auth.uid();
  requester_is_admin BOOLEAN := FALSE;
BEGIN
  IF requester_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF requester_id <> _user_id THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = requester_id
        AND role = 'admin'::public.app_role
    )
    INTO requester_is_admin;

    IF NOT requester_is_admin THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS public.app_role[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_id UUID := auth.uid();
  requester_is_admin BOOLEAN := FALSE;
BEGIN
  IF requester_id IS NULL THEN
    RETURN ARRAY[]::public.app_role[];
  END IF;

  IF requester_id <> _user_id THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = requester_id
        AND role = 'admin'::public.app_role
    )
    INTO requester_is_admin;

    IF NOT requester_is_admin THEN
      RETURN ARRAY[]::public.app_role[];
    END IF;
  END IF;

  RETURN COALESCE(
    (
      SELECT ARRAY_AGG(role ORDER BY role)
      FROM public.user_roles
      WHERE user_id = _user_id
    ),
    ARRAY[]::public.app_role[]
  );
END;
$$;
