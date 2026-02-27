
-- Create role_limits table for rate limiting and budget caps
CREATE TABLE public.role_limits (
  role text NOT NULL PRIMARY KEY,
  hourly_limit integer NOT NULL DEFAULT 20,
  monthly_token_limit bigint NOT NULL DEFAULT 5000000,
  monthly_cost_limit numeric NOT NULL DEFAULT 50.00,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.role_limits ENABLE ROW LEVEL SECURITY;

-- Only admins can manage limits
CREATE POLICY "Admins can manage role limits"
  ON public.role_limits FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can read limits (needed for frontend display)
CREATE POLICY "Authenticated users can read role limits"
  ON public.role_limits FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Insert default limits
INSERT INTO public.role_limits (role, hourly_limit, monthly_token_limit, monthly_cost_limit) VALUES
  ('admin',   100, 20000000, 500.00),
  ('lawyer',   30, 10000000, 200.00),
  ('client',   10,  2000000,  30.00),
  ('auditor',  15,  3000000,  50.00);

-- Create timestamp trigger
CREATE TRIGGER update_role_limits_updated_at
  BEFORE UPDATE ON public.role_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
