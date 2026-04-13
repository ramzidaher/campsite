-- Calendar manual events: attendees + RSVP, in-app notifications, async push/email jobs.

-- ---------------------------------------------------------------------------
-- Attendees
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_event_attendees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  event_id uuid not null references public.calendar_events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited', 'accepted', 'declined', 'tentative')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

create index if not exists calendar_event_attendees_event_idx
  on public.calendar_event_attendees (event_id);

create index if not exists calendar_event_attendees_profile_idx
  on public.calendar_event_attendees (profile_id);

alter table public.calendar_event_attendees enable row level security;

drop policy if exists calendar_event_attendees_select on public.calendar_event_attendees;
create policy calendar_event_attendees_select
  on public.calendar_event_attendees
  for select
  to authenticated
  using (org_id = public.current_org_id());

drop policy if exists calendar_event_attendees_insert on public.calendar_event_attendees;
create policy calendar_event_attendees_insert
  on public.calendar_event_attendees
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1
      from public.calendar_events e
      where e.id = event_id
        and e.org_id = public.current_org_id()
        and (
          e.created_by = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.status = 'active'
              and p.role in ('org_admin', 'super_admin', 'manager')
          )
        )
    )
  );

drop policy if exists calendar_event_attendees_update_rsvp on public.calendar_event_attendees;
create policy calendar_event_attendees_update_rsvp
  on public.calendar_event_attendees
  for update
  to authenticated
  using (org_id = public.current_org_id() and profile_id = auth.uid())
  with check (org_id = public.current_org_id() and profile_id = auth.uid());

drop policy if exists calendar_event_attendees_manage on public.calendar_event_attendees;
create policy calendar_event_attendees_manage
  on public.calendar_event_attendees
  for all
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1
      from public.calendar_events e
      where e.id = event_id
        and e.org_id = public.current_org_id()
        and (
          e.created_by = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.status = 'active'
              and p.role in ('org_admin', 'super_admin', 'manager')
          )
        )
    )
  )
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1
      from public.calendar_events e
      where e.id = event_id
        and e.org_id = public.current_org_id()
        and (
          e.created_by = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.status = 'active'
              and p.role in ('org_admin', 'super_admin', 'manager')
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- In-app notifications (survive event delete — link optional)
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_event_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.calendar_events (id) on delete set null,
  kind text not null check (kind in ('invited', 'updated', 'cancelled')),
  event_title text not null,
  actor_name text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists calendar_event_notifications_recipient_idx
  on public.calendar_event_notifications (recipient_id, read_at, created_at desc);

create index if not exists calendar_event_notifications_event_idx
  on public.calendar_event_notifications (event_id);

create index if not exists calendar_event_notifications_unread_recipient_idx
  on public.calendar_event_notifications (recipient_id)
  where read_at is null;

alter table public.calendar_event_notifications enable row level security;

drop policy if exists calendar_event_notifications_select_own on public.calendar_event_notifications;
create policy calendar_event_notifications_select_own
  on public.calendar_event_notifications
  for select
  to authenticated
  using (recipient_id = auth.uid());

drop policy if exists calendar_event_notifications_service on public.calendar_event_notifications;
create policy calendar_event_notifications_service
  on public.calendar_event_notifications
  for all
  to authenticated
  using (false)
  with check (false);

-- Service role bypasses RLS; triggers use security definer.

-- ---------------------------------------------------------------------------
-- Async jobs (push + Resend)
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_event_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  event_id uuid references public.calendar_events (id) on delete set null,
  event_type text not null check (event_type in ('invite', 'update', 'cancel')),
  target_user_ids uuid[] not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text
);

create index if not exists calendar_event_notification_jobs_pending_idx
  on public.calendar_event_notification_jobs (created_at)
  where processed_at is null;

alter table public.calendar_event_notification_jobs enable row level security;

drop policy if exists calendar_event_notification_jobs_deny on public.calendar_event_notification_jobs;
create policy calendar_event_notification_jobs_deny
  on public.calendar_event_notification_jobs
  for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Trigger helpers
-- ---------------------------------------------------------------------------

create or replace function public.calendar_event_snapshot_payload(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select
    e.title,
    e.start_time,
    e.end_time,
    e.all_day,
    e.description
  into r
  from public.calendar_events e
  where e.id = p_event_id;

  if r is null then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'title', r.title,
    'start_time', r.start_time,
    'end_time', r.end_time,
    'all_day', r.all_day,
    'description', r.description
  );
end;
$$;

revoke all on function public.calendar_event_snapshot_payload(uuid) from public;

create or replace function public.calendar_event_enqueue_job(
  p_org_id uuid,
  p_event_id uuid,
  p_event_type text,
  p_target_user_ids uuid[],
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_target_user_ids is null or array_length(p_target_user_ids, 1) is null then
    return;
  end if;

  insert into public.calendar_event_notification_jobs (
    org_id,
    event_id,
    event_type,
    target_user_ids,
    payload
  )
  values (p_org_id, p_event_id, p_event_type, p_target_user_ids, coalesce(p_payload, '{}'::jsonb));
exception
  when others then
    null;
end;
$$;

revoke all on function public.calendar_event_enqueue_job(uuid, uuid, text, uuid[], jsonb) from public;

create or replace function public.calendar_event_insert_in_app(
  p_org_id uuid,
  p_recipient uuid,
  p_event_id uuid,
  p_kind text,
  p_title text,
  p_actor_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null then
    return;
  end if;

  insert into public.calendar_event_notifications (
    org_id,
    recipient_id,
    event_id,
    kind,
    event_title,
    actor_name
  )
  values (p_org_id, p_recipient, p_event_id, p_kind, coalesce(nullif(trim(p_title), ''), 'Event'), p_actor_name);
exception
  when others then
    null;
end;
$$;

revoke all on function public.calendar_event_insert_in_app(uuid, uuid, uuid, text, text, text) from public;

-- ---------------------------------------------------------------------------
-- AFTER INSERT on attendees → invite notify
-- ---------------------------------------------------------------------------

create or replace function public.calendar_event_attendees_after_insert_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_title text;
begin
  if new.profile_id = auth.uid() then
    return new;
  end if;

  select nullif(trim(coalesce(full_name, '')), '') into v_actor
  from public.profiles
  where id = auth.uid();

  select title into v_title
  from public.calendar_events
  where id = new.event_id;

  perform public.calendar_event_insert_in_app(
    new.org_id,
    new.profile_id,
    new.event_id,
    'invited',
    coalesce(v_title, 'Event'),
    v_actor
  );

  perform public.calendar_event_enqueue_job(
    new.org_id,
    new.event_id,
    'invite',
    array[new.profile_id],
    public.calendar_event_snapshot_payload(new.event_id)
  );

  return new;
end;
$$;

drop trigger if exists calendar_event_attendees_after_insert on public.calendar_event_attendees;
create trigger calendar_event_attendees_after_insert
  after insert on public.calendar_event_attendees
  for each row
  execute procedure public.calendar_event_attendees_after_insert_fn();

-- ---------------------------------------------------------------------------
-- AFTER UPDATE on calendar_events → notify attendees (manual only)
-- ---------------------------------------------------------------------------

create or replace function public.calendar_events_after_update_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_ids uuid[] := array[]::uuid[];
  r record;
begin
  if new.source <> 'manual' then
    return new;
  end if;

  if (
    old.title is not distinct from new.title
    and old.start_time is not distinct from new.start_time
    and old.end_time is not distinct from new.end_time
    and old.description is not distinct from new.description
    and old.all_day is not distinct from new.all_day
  ) then
    return new;
  end if;

  select nullif(trim(coalesce(full_name, '')), '') into v_actor
  from public.profiles
  where id = auth.uid();

  select coalesce(array_agg(a.profile_id), array[]::uuid[])
  into v_ids
  from public.calendar_event_attendees a
  where a.event_id = new.id
    and a.profile_id is distinct from auth.uid();

  if v_ids is null or array_length(v_ids, 1) is null then
    return new;
  end if;

  for r in
    select unnest(v_ids) as uid
  loop
    perform public.calendar_event_insert_in_app(
      new.org_id,
      r.uid,
      new.id,
      'updated',
      new.title,
      v_actor
    );
  end loop;

  perform public.calendar_event_enqueue_job(
    new.org_id,
    new.id,
    'update',
    v_ids,
    public.calendar_event_snapshot_payload(new.id)
  );

  return new;
end;
$$;

drop trigger if exists calendar_events_after_update_notify on public.calendar_events;
create trigger calendar_events_after_update_notify
  after update on public.calendar_events
  for each row
  execute procedure public.calendar_events_after_update_notify_fn();

-- ---------------------------------------------------------------------------
-- BEFORE DELETE on calendar_events → cancel notify (manual)
-- ---------------------------------------------------------------------------

create or replace function public.calendar_events_before_delete_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_ids uuid[] := array[]::uuid[];
  r record;
begin
  if old.source <> 'manual' then
    return old;
  end if;

  select nullif(trim(coalesce(full_name, '')), '') into v_actor
  from public.profiles
  where id = auth.uid();

  select coalesce(array_agg(a.profile_id), array[]::uuid[])
  into v_ids
  from public.calendar_event_attendees a
  where a.event_id = old.id
    and a.profile_id is distinct from auth.uid();

  if v_ids is null or array_length(v_ids, 1) is null then
    return old;
  end if;

  for r in
    select unnest(v_ids) as uid
  loop
    perform public.calendar_event_insert_in_app(
      old.org_id,
      r.uid,
      old.id,
      'cancelled',
      old.title,
      v_actor
    );
  end loop;

  perform public.calendar_event_enqueue_job(
    old.org_id,
    old.id,
    'cancel',
    v_ids,
    jsonb_build_object(
      'title', old.title,
      'start_time', old.start_time,
      'end_time', old.end_time,
      'all_day', old.all_day
    )
  );

  return old;
end;
$$;

drop trigger if exists calendar_events_before_delete_notify on public.calendar_events;
create trigger calendar_events_before_delete_notify
  before delete on public.calendar_events
  for each row
  execute procedure public.calendar_events_before_delete_notify_fn();

-- ---------------------------------------------------------------------------
-- RPCs: in-app list + unread + mark read
-- ---------------------------------------------------------------------------

create or replace function public.calendar_event_notifications_for_me()
returns table (
  id uuid,
  event_id uuid,
  kind text,
  event_title text,
  actor_name text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.event_id,
    n.kind,
    n.event_title,
    n.actor_name,
    n.read_at,
    n.created_at
  from public.calendar_event_notifications n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit 100;
$$;

revoke all on function public.calendar_event_notifications_for_me() from public;
grant execute on function public.calendar_event_notifications_for_me() to authenticated;

create or replace function public.calendar_event_notification_mark_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.calendar_event_notifications
  set read_at = now()
  where id = p_notification_id
    and recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.calendar_event_notification_mark_read(uuid) from public;
grant execute on function public.calendar_event_notification_mark_read(uuid) to authenticated;

create or replace function public.calendar_event_notifications_mark_all_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.calendar_event_notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.calendar_event_notifications_mark_all_read() from public;
grant execute on function public.calendar_event_notifications_mark_all_read() to authenticated;

create or replace function public.calendar_event_notifications_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.calendar_event_notifications
  where recipient_id = auth.uid()
    and read_at is null;
$$;

revoke all on function public.calendar_event_notifications_unread_count() from public;
grant execute on function public.calendar_event_notifications_unread_count() to authenticated;

-- ---------------------------------------------------------------------------
-- Badge bundle: add calendar_event_notifications
-- ---------------------------------------------------------------------------

create or replace function public.main_shell_badge_counts_bundle()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_org_id uuid;
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select p.org_id into v_org_id
  from   public.profiles p
  where  p.id = v_uid;

  if v_org_id is null then
    return '{}'::jsonb;
  end if;

  return (
    select jsonb_build_object(
      'broadcast_unread', (
        select count(*)::integer
        from   public.broadcasts b
        where  b.status = 'sent'
          and  public.broadcast_visible_to_reader(b)
          and  not exists (
                 select 1 from public.broadcast_reads r
                 where  r.broadcast_id = b.id and r.user_id = v_uid
               )
      ),
      'broadcast_pending_approvals', case
        when p.role = 'manager' then (
          select count(*)::integer
          from   public.broadcasts b
          join   public.dept_managers dm on dm.dept_id = b.dept_id
                                        and dm.user_id = v_uid
          where  b.status = 'pending_approval'
            and  b.org_id = v_org_id
        )
        when p.role in ('org_admin', 'super_admin') then (
          select count(*)::integer
          from   public.broadcasts b
          where  b.status = 'pending_approval'
            and  b.org_id = v_org_id
        )
        else 0
      end,

      'recruitment_notifications', (
        select count(*)::integer from public.recruitment_notifications
        where  recipient_id = v_uid and read_at is null
      ),
      'application_notifications', (
        select count(*)::integer from public.application_notifications
        where  recipient_id = v_uid and read_at is null
      ),
      'leave_notifications', (
        select count(*)::integer from public.leave_notifications
        where  recipient_id = v_uid and read_at is null
      ),
      'hr_metric_notifications', (
        select count(*)::integer from public.hr_metric_notifications
        where  recipient_id = v_uid and read_at is null
      ),
      'calendar_event_notifications', (
        select count(*)::integer from public.calendar_event_notifications
        where  recipient_id = v_uid and read_at is null
      ),

      'pending_approvals',          public.pending_approvals_nav_count(),
      'leave_pending_approval',     public.leave_pending_approval_count_for_me(),
      'recruitment_pending_review', public.recruitment_requests_pending_review_count(),

      'performance_pending', (
        select count(*)::integer
        from   public.performance_reviews pr
        where  pr.reviewer_id = v_uid
          and  pr.status = 'self_submitted'
      ),
      'onboarding_active', (
        select count(*)::integer
        from   public.onboarding_runs r
        where  r.user_id = v_uid and r.status = 'active'
      ),
      'rota_pending_final', case
        when public.has_permission(v_uid, v_org_id, 'rota.final_approve', '{}'::jsonb) then (
          select count(*)::integer
          from   public.rota_change_requests rcr
          where  rcr.org_id = v_org_id and rcr.status = 'pending_final'
        )
        else 0
      end,
      'rota_pending_peer', (
        select count(*)::integer
        from   public.rota_change_requests rcr
        where  rcr.org_id               = v_org_id
          and  rcr.counterparty_user_id = v_uid
          and  rcr.status               = 'pending_peer'
      )
    )
    from   public.profiles p
    where  p.id = v_uid
  );
end;
$$;

revoke all   on function public.main_shell_badge_counts_bundle() from public;
grant execute on function public.main_shell_badge_counts_bundle() to authenticated;

-- Allow SECURITY DEFINER triggers to insert notifications (bypass RLS via owner)
-- Notifications are inserted by trigger running as superuser — already bypasses RLS.
