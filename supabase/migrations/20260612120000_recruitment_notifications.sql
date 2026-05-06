-- In-app notifications for recruitment requests.
--
-- Two events create notifications:
--   1. new_request   manager submits → notifies all users with recruitment.approve_request
--   2. status_changed  HR updates status → notifies the original requester (created_by)
--
-- The UI reads these to show:
--   • unread badge on the top bar bell (for both HR and the requesting manager)
--   • a /notifications/recruitment list page

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.recruitment_notifications (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations(id) on delete cascade,
  recipient_id    uuid not null references public.profiles(id) on delete cascade,
  request_id      uuid not null references public.recruitment_requests(id) on delete cascade,
  kind            text not null check (kind in ('new_request', 'status_changed')),
  old_status      text,
  new_status      text not null,
  job_title       text not null,
  actor_name      text,           -- who triggered the event
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists recruitment_notifications_recipient_idx
  on public.recruitment_notifications (recipient_id, read_at, created_at desc);

create index if not exists recruitment_notifications_request_idx
  on public.recruitment_notifications (request_id);

-- RLS: each user sees only their own notifications
alter table public.recruitment_notifications enable row level security;

create policy "users see own recruitment notifications"
  on public.recruitment_notifications for select
  using (recipient_id = auth.uid());

create policy "service role manages recruitment notifications"
  on public.recruitment_notifications for all
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- RPC: mark notification read
-- ---------------------------------------------------------------------------

create or replace function public.recruitment_notification_mark_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recruitment_notifications
  set read_at = now()
  where id = p_notification_id
    and recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.recruitment_notification_mark_read(uuid) from public;
grant execute on function public.recruitment_notification_mark_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: mark all read for current user
-- ---------------------------------------------------------------------------

create or replace function public.recruitment_notifications_mark_all_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recruitment_notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.recruitment_notifications_mark_all_read() from public;
grant execute on function public.recruitment_notifications_mark_all_read() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: unread count (used in layout badge)
-- ---------------------------------------------------------------------------

create or replace function public.recruitment_notifications_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.recruitment_notifications
  where recipient_id = auth.uid()
    and read_at is null;
$$;

revoke all on function public.recruitment_notifications_unread_count() from public;
grant execute on function public.recruitment_notifications_unread_count() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: list for current user (most recent 50)
-- ---------------------------------------------------------------------------

create or replace function public.recruitment_notifications_for_me()
returns table (
  id             uuid,
  request_id     uuid,
  kind           text,
  old_status     text,
  new_status     text,
  job_title      text,
  actor_name     text,
  read_at        timestamptz,
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.request_id,
    n.kind,
    n.old_status,
    n.new_status,
    n.job_title,
    n.actor_name,
    n.read_at,
    n.created_at
  from public.recruitment_notifications n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit 50;
$$;

revoke all on function public.recruitment_notifications_for_me() from public;
grant execute on function public.recruitment_notifications_for_me() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: create notification for a new request
--   Called server-side (service role) after insert into recruitment_requests.
--   Notifies all active users in the org with recruitment.approve_request.
-- ---------------------------------------------------------------------------

create or replace function public.recruitment_notify_new_request(
  p_request_id  uuid,
  p_actor_name  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id   uuid;
  v_title    text;
  v_status   text;
begin
  select org_id, job_title, status
  into v_org_id, v_title, v_status
  from public.recruitment_requests
  where id = p_request_id;

  if not found then return; end if;

  -- Notify every active user in the org who has recruitment.approve_request
  insert into public.recruitment_notifications
    (org_id, recipient_id, request_id, kind, new_status, job_title, actor_name)
  select
    v_org_id,
    ua.user_id,
    p_request_id,
    'new_request',
    v_status,
    v_title,
    p_actor_name
  from public.user_org_role_assignments ua
  join public.org_role_permissions orp on orp.role_id = ua.role_id
  join public.profiles p2 on p2.id = ua.user_id and p2.org_id = v_org_id and p2.status = 'active'
  where orp.permission_key = 'recruitment.approve_request'
    and ua.org_id = v_org_id
  on conflict do nothing;
end;
$$;

revoke all on function public.recruitment_notify_new_request(uuid, text) from public;
grant execute on function public.recruitment_notify_new_request(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: notify the requester when HR changes the status
-- ---------------------------------------------------------------------------

create or replace function public.recruitment_notify_status_changed(
  p_request_id  uuid,
  p_old_status  text,
  p_new_status  text,
  p_actor_name  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id    uuid;
  v_title     text;
  v_requester uuid;
begin
  select org_id, job_title, created_by
  into v_org_id, v_title, v_requester
  from public.recruitment_requests
  where id = p_request_id;

  if not found or v_requester is null then return; end if;

  -- Don't notify if the requester is the actor (HR who also raised the request)
  insert into public.recruitment_notifications
    (org_id, recipient_id, request_id, kind, old_status, new_status, job_title, actor_name)
  select
    v_org_id,
    v_requester,
    p_request_id,
    'status_changed',
    p_old_status,
    p_new_status,
    v_title,
    p_actor_name
  where exists (
    select 1 from public.profiles
    where id = v_requester and status = 'active'
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.recruitment_notify_status_changed(uuid, text, text, text) from public;
grant execute on function public.recruitment_notify_status_changed(uuid, text, text, text) to service_role;
