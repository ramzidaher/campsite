-- Queue claim leasing with SKIP LOCKED for concurrent workers.
-- Applies to the three active notification job queues.

alter table public.rota_notification_jobs
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz;

alter table public.calendar_event_notification_jobs
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz;

alter table public.one_on_one_notification_jobs
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz;

create index if not exists rota_notification_jobs_claimable_idx
  on public.rota_notification_jobs (created_at)
  where processed_at is null;

create index if not exists calendar_event_notification_jobs_claimable_idx
  on public.calendar_event_notification_jobs (created_at)
  where processed_at is null;

create index if not exists one_on_one_notification_jobs_claimable_idx
  on public.one_on_one_notification_jobs (created_at)
  where processed_at is null;

create or replace function public.claim_rota_notification_jobs(
  p_limit int default 20,
  p_lease_seconds int default 120
)
returns setof public.rota_notification_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 100));
  v_lease int := greatest(15, least(coalesce(p_lease_seconds, 120), 900));
  v_expires timestamptz := v_now + make_interval(secs => v_lease);
begin
  return query
  with picked as (
    select j.id
    from public.rota_notification_jobs j
    where j.processed_at is null
      and (j.claim_expires_at is null or j.claim_expires_at < v_now)
    order by j.created_at
    for update skip locked
    limit v_limit
  )
  update public.rota_notification_jobs j
  set claimed_at = v_now,
      claim_expires_at = v_expires
  from picked p
  where j.id = p.id
  returning j.*;
end;
$$;

create or replace function public.claim_calendar_event_notification_jobs(
  p_limit int default 20,
  p_lease_seconds int default 120
)
returns setof public.calendar_event_notification_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 100));
  v_lease int := greatest(15, least(coalesce(p_lease_seconds, 120), 900));
  v_expires timestamptz := v_now + make_interval(secs => v_lease);
begin
  return query
  with picked as (
    select j.id
    from public.calendar_event_notification_jobs j
    where j.processed_at is null
      and (j.claim_expires_at is null or j.claim_expires_at < v_now)
    order by j.created_at
    for update skip locked
    limit v_limit
  )
  update public.calendar_event_notification_jobs j
  set claimed_at = v_now,
      claim_expires_at = v_expires
  from picked p
  where j.id = p.id
  returning j.*;
end;
$$;

create or replace function public.claim_one_on_one_notification_jobs(
  p_limit int default 20,
  p_lease_seconds int default 120
)
returns setof public.one_on_one_notification_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 100));
  v_lease int := greatest(15, least(coalesce(p_lease_seconds, 120), 900));
  v_expires timestamptz := v_now + make_interval(secs => v_lease);
begin
  return query
  with picked as (
    select j.id
    from public.one_on_one_notification_jobs j
    where j.processed_at is null
      and (j.claim_expires_at is null or j.claim_expires_at < v_now)
    order by j.created_at
    for update skip locked
    limit v_limit
  )
  update public.one_on_one_notification_jobs j
  set claimed_at = v_now,
      claim_expires_at = v_expires
  from picked p
  where j.id = p.id
  returning j.*;
end;
$$;

grant execute on function public.claim_rota_notification_jobs(int, int) to service_role;
grant execute on function public.claim_calendar_event_notification_jobs(int, int) to service_role;
grant execute on function public.claim_one_on_one_notification_jobs(int, int) to service_role;
