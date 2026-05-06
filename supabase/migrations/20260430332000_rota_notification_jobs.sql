-- Queue rows for async rota notifications (worker pattern aligned with broadcast_notification_jobs).

create table if not exists public.rota_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  event_type text not null
    check (event_type in (
      'shift_created',
      'shift_updated',
      'shift_deleted',
      'request_created',
      'request_peer_accepted',
      'request_resolved'
    )),
  rota_shift_id uuid references public.rota_shifts (id) on delete set null,
  change_request_id uuid references public.rota_change_requests (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text
);

create index if not exists rota_notification_jobs_pending_idx
  on public.rota_notification_jobs (created_at)
  where processed_at is null;

alter table public.rota_notification_jobs enable row level security;

drop policy if exists rota_notification_jobs_deny on public.rota_notification_jobs;
create policy rota_notification_jobs_deny
  on public.rota_notification_jobs
  for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Enqueue (SECURITY DEFINER triggers  bypass RLS)
-- ---------------------------------------------------------------------------

create or replace function public.rota_enqueue_notification_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev text;
  sid uuid;
  oid uuid;
begin
  if tg_op = 'INSERT' then
    ev := 'shift_created';
    sid := new.id;
    oid := new.org_id;
  elsif tg_op = 'UPDATE' then
    ev := 'shift_updated';
    sid := new.id;
    oid := new.org_id;
  else
    ev := 'shift_deleted';
    sid := old.id;
    oid := old.org_id;
  end if;

  insert into public.rota_notification_jobs (org_id, event_type, rota_shift_id, payload)
  values (
    oid,
    ev,
    sid,
    jsonb_build_object(
      'op', lower(tg_op),
      'shift_id', sid,
      'user_id', case when tg_op = 'DELETE' then old.user_id else new.user_id end,
      'rota_id', case when tg_op = 'DELETE' then old.rota_id else new.rota_id end
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists rota_shifts_notify on public.rota_shifts;
create trigger rota_shifts_notify
  after insert or update or delete on public.rota_shifts
  for each row
  execute procedure public.rota_enqueue_notification_fn();

create or replace function public.rota_change_requests_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status = 'pending_final' and old.status = 'pending_peer' then
    ev := 'request_peer_accepted';
  elsif new.status in ('approved', 'rejected') and old.status = 'pending_final' then
    ev := 'request_resolved';
  else
    return new;
  end if;

  insert into public.rota_notification_jobs (org_id, event_type, change_request_id, payload)
  values (
    new.org_id,
    ev,
    new.id,
    jsonb_build_object(
      'request_id', new.id,
      'request_type', new.request_type,
      'status', new.status,
      'requested_by', new.requested_by
    )
  );

  return new;
end;
$$;

drop trigger if exists rota_change_requests_notify on public.rota_change_requests;
create trigger rota_change_requests_notify
  after update on public.rota_change_requests
  for each row
  execute procedure public.rota_change_requests_notify_fn();

create or replace function public.rota_change_requests_insert_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rota_notification_jobs (org_id, event_type, change_request_id, payload)
  values (
    new.org_id,
    'request_created',
    new.id,
    jsonb_build_object(
      'request_id', new.id,
      'request_type', new.request_type,
      'requested_by', new.requested_by,
      'status', new.status
    )
  );
  return new;
end;
$$;

drop trigger if exists rota_change_requests_insert_notify on public.rota_change_requests;
create trigger rota_change_requests_insert_notify
  after insert on public.rota_change_requests
  for each row
  execute procedure public.rota_change_requests_insert_notify_fn();
