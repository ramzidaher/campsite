-- Phase 2.5 follow-up:
-- 1) Throttle enqueue writes so stale/missing shell reads do not continuously
--    update the same queue row under burst traffic.
-- 2) Increase queue drain batch size for the existing cron job.

create or replace function public.enqueue_badge_counter_recalc_for_user(
  p_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if p_user_id is null then
    return;
  end if;

  select p.org_id into v_org_id
  from public.profiles p
  where p.id = p_user_id;

  if v_org_id is null then
    return;
  end if;

  insert into public.badge_counter_recalc_queue (user_id, org_id, reason, requested_at)
  values (p_user_id, v_org_id, p_reason, now())
  on conflict (user_id) do update
  set requested_at = excluded.requested_at,
      reason = coalesce(excluded.reason, public.badge_counter_recalc_queue.reason)
  where public.badge_counter_recalc_queue.requested_at < (now() - interval '15 seconds')
     or public.badge_counter_recalc_queue.reason is distinct from excluded.reason;
end;
$$;

create or replace function public.enqueue_badge_counter_recalc_for_org(
  p_org_id uuid,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enqueued integer := 0;
begin
  if p_org_id is null then
    return 0;
  end if;

  insert into public.badge_counter_recalc_queue (user_id, org_id, reason, requested_at)
  select p.id, p.org_id, p_reason, now()
  from public.profiles p
  where p.org_id = p_org_id
    and p.status = 'active'
  on conflict (user_id) do update
  set requested_at = excluded.requested_at,
      reason = coalesce(excluded.reason, public.badge_counter_recalc_queue.reason)
  where public.badge_counter_recalc_queue.requested_at < (now() - interval '15 seconds')
     or public.badge_counter_recalc_queue.reason is distinct from excluded.reason;

  get diagnostics v_enqueued = row_count;
  return v_enqueued;
end;
$$;

do $cron$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid
      into v_job_id
    from cron.job
    where jobname = 'process-badge-counter-recalc-queue'
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
      'process-badge-counter-recalc-queue',
      '* * * * *',
      $job$select public.process_badge_counter_recalc_queue(2000);$job$
    );
  end if;
end
$cron$;
