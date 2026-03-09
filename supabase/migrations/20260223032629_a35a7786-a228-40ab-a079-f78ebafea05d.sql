
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings"
ON public.app_settings FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can read settings"
ON public.app_settings FOR SELECT
USING (auth.uid() IS NOT NULL);

INSERT INTO public.app_settings (key, value) VALUES ('ai_provider', 'gateway');
