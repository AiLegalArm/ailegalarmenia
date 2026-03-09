-- Add temporal_metadata_source column for analytics coverage tracking
ALTER TABLE public.eval_run_results
ADD COLUMN IF NOT EXISTS temporal_metadata_source text DEFAULT NULL;

COMMENT ON COLUMN public.eval_run_results.temporal_metadata_source IS 'Source of temporal metadata: inline, db_fallback, or none';
