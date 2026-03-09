
-- Re-activate the pipeline orchestrator cron job
SELECT cron.unschedule(6);

SELECT cron.schedule(
  'practice-pipeline-orchestrator',
  '* * * * *',
  $$SELECT public.invoke_pipeline_orchestrator()$$
);
