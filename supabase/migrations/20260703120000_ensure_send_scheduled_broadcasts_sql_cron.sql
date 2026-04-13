-- Release due scheduled broadcasts in-database (no HTTP / pg_net auth issues).
-- Edge function `process-broadcast-notifications` also calls `release_due_scheduled_broadcasts`;
-- if pg_cron HTTP posts return 401, this job still promotes `scheduled` → `sent` every minute.

do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid
      into v_job_id
    from cron.job
    where jobname = 'send-scheduled-broadcasts'
    limit 1;

    if v_job_id is null then
      perform cron.schedule(
        'send-scheduled-broadcasts',
        '* * * * *',
        $job$select public.release_due_scheduled_broadcasts();$job$
      );
    end if;
  end if;
end
$$;
