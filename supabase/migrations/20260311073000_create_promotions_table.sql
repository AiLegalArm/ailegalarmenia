CREATE TABLE public.promotions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image TEXT,
  target_link TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promotions_priority ON public.promotions(priority DESC);
CREATE INDEX idx_promotions_active ON public.promotions(is_active) WHERE is_active = true;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active promotions"
  ON public.promotions FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage promotions"
  ON public.promotions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
    )
  );

-- Create storage bucket for promotions
INSERT INTO storage.buckets (id, name, public)
VALUES ('promotions', 'promotions', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "promotions images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'promotions');

CREATE POLICY "Admins can insert promotion images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'promotions' AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update promotion images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'promotions' AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete promotion images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'promotions' AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
    )
  );
