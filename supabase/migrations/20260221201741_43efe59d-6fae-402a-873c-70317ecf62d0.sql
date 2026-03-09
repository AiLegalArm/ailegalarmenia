
-- Add unique constraint on lemma_norm for upsert support
ALTER TABLE public.armenian_dictionary ADD CONSTRAINT armenian_dictionary_lemma_norm_key UNIQUE (lemma_norm);

-- Import jobs tracking table
CREATE TABLE public.dictionary_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  source text,
  mode text NOT NULL DEFAULT 'upsert' CHECK (mode IN ('upsert','insert')),
  file_type text NOT NULL CHECK (file_type IN ('csv','jsonl')),
  total_rows int NOT NULL DEFAULT 0,
  processed int NOT NULL DEFAULT 0,
  inserted int NOT NULL DEFAULT 0,
  updated int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  error_report jsonb DEFAULT '[]'::jsonb,
  completed_at timestamptz
);

ALTER TABLE public.dictionary_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage import jobs"
  ON public.dictionary_import_jobs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Storage bucket for import files
INSERT INTO storage.buckets (id, name, public) VALUES ('dictionary-imports', 'dictionary-imports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can manage dictionary imports"
  ON storage.objects FOR ALL
  USING (bucket_id = 'dictionary-imports' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'dictionary-imports' AND has_role(auth.uid(), 'admin'::app_role));
