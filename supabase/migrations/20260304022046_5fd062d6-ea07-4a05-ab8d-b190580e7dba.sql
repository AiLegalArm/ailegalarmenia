-- Create admin_pipeline_stats VIEW (SECURITY INVOKER) backed by the existing
-- SECURITY DEFINER function, so no raw rows are ever exposed and the
-- linter stays clean.

CREATE OR REPLACE VIEW public.admin_pipeline_stats
WITH (security_invoker = true) AS
  SELECT * FROM public.get_admin_pipeline_stats();

-- Lock down access: admin only via authenticated role
REVOKE ALL ON public.admin_pipeline_stats FROM public, anon, authenticated;
GRANT SELECT ON public.admin_pipeline_stats TO authenticated;

-- The underlying function already enforces has_role(auth.uid(), 'admin'),
-- so non-admin authenticated users will get zero rows.