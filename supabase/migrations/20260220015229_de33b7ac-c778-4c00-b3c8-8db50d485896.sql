
ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_party_role_check;

ALTER TABLE public.cases ADD CONSTRAINT cases_party_role_check 
CHECK (party_role = ANY (ARRAY[
  'claimant'::text,
  'defendant'::text,
  'plaintiff'::text,
  'respondent'::text,
  'applicant'::text,
  'government'::text,
  'defense'::text,
  'prosecutor'::text,
  'victim'::text,
  'appellant'::text,
  'appellee'::text,
  'petitioner'::text
]));
