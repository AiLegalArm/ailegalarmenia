-- Add SECURITY DEFINER RPC helpers to perform soft-delete reliably under RLS

CREATE OR REPLACE FUNCTION public.soft_delete_case(p_case_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.user_can_access_case_as(auth.uid(), p_case_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.cases
  SET deleted_at = now()
  WHERE id = p_case_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_case(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_case(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.soft_delete_case_file(p_file_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case_id uuid;
  v_uploaded_by uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT cf.case_id, cf.uploaded_by
  INTO v_case_id, v_uploaded_by
  FROM public.case_files cf
  WHERE cf.id = p_file_id;

  IF v_case_id IS NULL THEN
    RAISE EXCEPTION 'File not found';
  END IF;

  IF NOT (
    public.user_can_access_case_as(auth.uid(), v_case_id)
    OR v_uploaded_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.case_files
  SET deleted_at = now()
  WHERE id = p_file_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_case_file(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_case_file(uuid) TO authenticated;
