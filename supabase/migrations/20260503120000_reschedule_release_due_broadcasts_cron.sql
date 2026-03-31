-- Ensure scheduled broadcasts are actually released by a cron job.
-- Older environments may have missed cron registration if pg_cron wasn't
-- available at migration time.

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

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
      'send-scheduled-broadcasts',
      '* * * * *',
      $job$select public.release_due_scheduled_broadcasts();$job$
    );
  end if;
end
$$;
