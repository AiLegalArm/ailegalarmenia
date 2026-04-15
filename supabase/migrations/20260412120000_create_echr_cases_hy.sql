-- Create ECHR cases table that mirrors `out.jsonl` top-level schema,
-- but stores ONLY Armenian human-readable content in the same keys.
-- Technical/canonical fields remain unchanged (IDs, dates, codes, enums, etc.).

CREATE TABLE IF NOT EXISTS public.echr_cases_hy (
  -- PK / stable id (from out.jsonl)
  itemid TEXT PRIMARY KEY,

  -- Top-level scalar fields (TEXT)
  __articles TEXT,
  __conclusion TEXT,
  _decision_body TEXT,
  applicability TEXT,
  application TEXT,
  appno TEXT,
  decisiondate TEXT,
  docname TEXT,
  doctypebranch TEXT,
  ecli TEXT,
  importance TEXT,
  introductiondate TEXT,
  judgementdate TEXT,
  kpdate TEXT,
  languageisocode TEXT,
  originatingbody TEXT,
  originatingbody_name TEXT,
  originatingbody_type TEXT,
  rank TEXT,
  respondent TEXT,
  separateopinion TEXT,
  typedescription TEXT,

  -- Arrays (TEXT[])
  article TEXT[],
  documentcollectionid TEXT[],
  documents TEXT[],
  extractedappno TEXT[],
  kpthesaurus TEXT[],
  paragraphs TEXT[],
  parties TEXT[],
  representedby TEXT[],

  -- Structured fields (JSONB)
  attachments JSONB,
  conclusion JSONB,
  content JSONB,
  country JSONB,
  decision_body JSONB,
  externalsources JSONB,
  issue JSONB,
  scl JSONB,

  -- Technical ingestion metadata
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  import_ref TEXT NULL,
  translation_provider TEXT NULL
);

-- RLS
ALTER TABLE public.echr_cases_hy ENABLE ROW LEVEL SECURITY;

-- Admins can manage
CREATE POLICY "Admins can manage echr_cases_hy"
  ON public.echr_cases_hy
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role can manage (for batch loaders)
CREATE POLICY "Service role can manage echr_cases_hy"
  ON public.echr_cases_hy
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_echr_cases_hy_appno ON public.echr_cases_hy(appno);
CREATE INDEX IF NOT EXISTS idx_echr_cases_hy_ecli ON public.echr_cases_hy(ecli);
CREATE INDEX IF NOT EXISTS idx_echr_cases_hy_respondent ON public.echr_cases_hy(respondent);
CREATE INDEX IF NOT EXISTS idx_echr_cases_hy_originatingbody_name ON public.echr_cases_hy(originatingbody_name);

