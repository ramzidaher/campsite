-- Phase 3: shift reminder jobs (user profile shift_reminder_before_minutes) + dedupe log.

alter table public.rota_notification_jobs
  drop constraint if exists rota_notification_jobs_event_type_check;

alter table public.rota_notification_jobs
  add constraint rota_notification_jobs_event_type_check
  check (event_type in (
    'shift_created',
    'shift_updated',
    'shift_deleted',
    'shift_reminder',
    'request_created',
    'request_peer_accepted',
    'request_resolved'
  ));

create table if not exists public.rota_shift_reminder_sent (
  shift_id uuid not null references public.rota_shifts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  shift_starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (shift_id, user_id, shift_starts_at)
);

create index if not exists rota_shift_reminder_sent_shift_idx
  on public.rota_shift_reminder_sent (shift_id);

alter table public.rota_shift_reminder_sent enable row level security;

drop policy if exists rota_shift_reminder_sent_deny on public.rota_shift_reminder_sent;
create policy rota_shift_reminder_sent_deny
  on public.rota_shift_reminder_sent
  for all
  to authenticated
  using (false)
  with check (false);

comment on table public.rota_shift_reminder_sent is
  'Dedupe table: one reminder notification per assignee per shift start instant.';

-- Enqueue reminder jobs for shifts entering the user''s reminder window (call from cron / Edge every ~15–25 min).
create or replace function public.enqueue_rota_shift_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  with cand as (
    select
      s.id as shift_id,
      s.org_id,
      s.user_id,
      s.start_time as shift_starts_at,
      p.shift_reminder_before_minutes as m
    from public.rota_shifts s
    inner join public.profiles p
      on p.id = s.user_id
     and p.org_id = s.org_id
     and p.status = 'active'
     and p.shift_reminder_before_minutes is not null
    where s.user_id is not null
      and s.start_time > now()
      and s.start_time <= now() + interval '2 days'
      and (
        s.rota_id is null
        or exists (
          select 1 from public.rotas r
          where r.id = s.rota_id and r.status = 'published'
        )
      )
      and now() >= s.start_time - (p.shift_reminder_before_minutes * interval '1 minute')
      and now() < s.start_time - (p.shift_reminder_before_minutes * interval '1 minute') + interval '25 minutes'
  ),
  new_rows as (
    insert into public.rota_shift_reminder_sent (shift_id, user_id, shift_starts_at)
    select c.shift_id, c.user_id, c.shift_starts_at
    from cand c
    on conflict (shift_id, user_id, shift_starts_at) do nothing
    returning shift_id, user_id, shift_starts_at
  ),
  job_ins as (
    insert into public.rota_notification_jobs (org_id, event_type, rota_shift_id, payload)
    select
      c.org_id,
      'shift_reminder',
      c.shift_id,
      jsonb_build_object(
        'shift_id', c.shift_id,
        'user_id', c.user_id,
        'shift_starts_at', c.shift_starts_at,
        'reminder_minutes', c.m
      )
    from cand c
    inner join new_rows nr
      on nr.shift_id = c.shift_id
     and nr.user_id = c.user_id
     and nr.shift_starts_at = c.shift_starts_at
    returning id
  )
  select count(*)::integer into n from job_ins;

  return coalesce(n, 0);
end;
$$;

revoke all on function public.enqueue_rota_shift_reminders() from public;
grant execute on function public.enqueue_rota_shift_reminders() to service_role;

comment on function public.enqueue_rota_shift_reminders() is
  'Creates rota_notification_jobs (shift_reminder) for upcoming shifts; idempotent via rota_shift_reminder_sent. service_role or DB owner (cron).';
