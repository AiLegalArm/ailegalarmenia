
-- Re-activate the pipeline orchestrator cron job
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'practice-pipeline-orchestrator';

SELECT cron.schedule(
  'practice-pipeline-orchestrator',
  '* * * * *',
  $$SELECT public.invoke_pipeline_orchestrator()$$
);
