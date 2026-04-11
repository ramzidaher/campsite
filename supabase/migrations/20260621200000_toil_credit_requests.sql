-- TOIL overtime credit: employees request earned time (minutes/hours/days); managers approve/reject.
-- Credits apply to leave_allowances.toil_balance_days using org toil_minutes_per_day (default 8h = 1 day).

alter table public.org_leave_settings
  add column if not exists toil_minutes_per_day integer not null default 480
  check (toil_minutes_per_day > 0 and toil_minutes_per_day <= 1440);

comment on column public.org_leave_settings.toil_minutes_per_day is
  'Minutes counted as one full day when converting overtime into TOIL balance (e.g. 480 = 8h).';

-- ---------------------------------------------------------------------------
-- toil_credit_requests
-- ---------------------------------------------------------------------------

create table if not exists public.toil_credit_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  minutes_earned integer not null
    check (minutes_earned > 0 and minutes_earned <= 100000),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists toil_credit_requests_org_status_idx
  on public.toil_credit_requests (org_id, status);

create index if not exists toil_credit_requests_requester_idx
  on public.toil_credit_requests (requester_id, created_at desc);

comment on table public.toil_credit_requests is
  'Requests to add TOIL balance from overtime worked; approved by line manager or leave.manage_org.';

alter table public.toil_credit_requests enable row level security;

drop policy if exists toil_credit_requests_select on public.toil_credit_requests;
create policy toil_credit_requests_select
  on public.toil_credit_requests
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      requester_id = auth.uid()
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
      or (
        public.has_permission(auth.uid(), org_id, 'leave.view_direct_reports', '{}'::jsonb)
        and exists (
          select 1 from public.profiles s
          where s.id = toil_credit_requests.requester_id
            and s.reports_to_user_id = auth.uid()
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- leave_notifications: support TOIL credit events (one of leave_request_id or toil_credit_request_id)
-- ---------------------------------------------------------------------------

alter table public.leave_notifications
  alter column leave_request_id drop not null;

alter table public.leave_notifications
  add column if not exists toil_credit_request_id uuid references public.toil_credit_requests(id) on delete cascade;

alter table public.leave_notifications
  drop constraint if exists leave_notifications_event_check;

alter table public.leave_notifications
  add constraint leave_notifications_event_check
  check (
    event in (
      'leave_approved',
      'leave_rejected',
      'cancellation_approved',
      'cancellation_declined',
      'edit_approved',
      'edit_declined',
      'toil_credit_approved',
      'toil_credit_rejected'
    )
  );

alter table public.leave_notifications
  drop constraint if exists leave_notifications_target_check;

alter table public.leave_notifications
  add constraint leave_notifications_target_check
  check (
    (leave_request_id is not null and toil_credit_request_id is null)
    or (leave_request_id is null and toil_credit_request_id is not null)
  );

create index if not exists leave_notifications_toil_credit_idx
  on public.leave_notifications (toil_credit_request_id);

-- ---------------------------------------------------------------------------
-- leave_notify_requester_decision: insert must set toil_credit_request_id null
-- ---------------------------------------------------------------------------

create or replace function public.leave_notify_requester_decision(
  p_org_id uuid,
  p_leave_request_id uuid,
  p_requester_id uuid,
  p_event text,
  p_decider_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  if p_requester_id is null or p_decider_id is null then
    return;
  end if;

  if p_requester_id = p_decider_id then
    return;
  end if;

  if p_event not in (
    'leave_approved',
    'leave_rejected',
    'cancellation_approved',
    'cancellation_declined',
    'edit_approved',
    'edit_declined'
  ) then
    return;
  end if;

  select nullif(trim(coalesce(full_name, '')), '') into v_actor
  from public.profiles
  where id = p_decider_id;

  begin
    insert into public.leave_notifications (org_id, recipient_id, leave_request_id, toil_credit_request_id, event, actor_name)
    values (p_org_id, p_requester_id, p_leave_request_id, null, p_event, v_actor);
  exception
    when others then
      null;
  end;
end;
$$;

create or replace function public.leave_notify_toil_credit_decision(
  p_org_id uuid,
  p_toil_credit_id uuid,
  p_requester_id uuid,
  p_event text,
  p_decider_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  if p_requester_id is null or p_decider_id is null then
    return;
  end if;

  if p_requester_id = p_decider_id then
    return;
  end if;

  if p_event not in ('toil_credit_approved', 'toil_credit_rejected') then
    return;
  end if;

  select nullif(trim(coalesce(full_name, '')), '') into v_actor
  from public.profiles
  where id = p_decider_id;

  begin
    insert into public.leave_notifications (org_id, recipient_id, leave_request_id, toil_credit_request_id, event, actor_name)
    values (p_org_id, p_requester_id, null, p_toil_credit_id, p_event, v_actor);
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.leave_notify_toil_credit_decision(uuid, uuid, uuid, text, uuid) from public;

-- ---------------------------------------------------------------------------
-- leave_notifications_for_me: add toil_credit_request_id
-- ---------------------------------------------------------------------------

drop function if exists public.leave_notifications_for_me();

create function public.leave_notifications_for_me()
returns table (
  id uuid,
  leave_request_id uuid,
  toil_credit_request_id uuid,
  event text,
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
    n.leave_request_id,
    n.toil_credit_request_id,
    n.event,
    n.actor_name,
    n.read_at,
    n.created_at
  from public.leave_notifications n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit 75;
$$;

revoke all on function public.leave_notifications_for_me() from public;
grant execute on function public.leave_notifications_for_me() to authenticated;

-- ---------------------------------------------------------------------------
-- leave_pending_approval_count_for_me: include pending TOIL credits
-- ---------------------------------------------------------------------------

create or replace function public.leave_pending_approval_count_for_me()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  n int;
  m int;
begin
  if v_uid is null then
    return 0;
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    return 0;
  end if;

  if public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb) then
    select count(*)::int into n
    from public.leave_requests r
    where r.org_id = v_org and r.status in ('pending', 'pending_cancel', 'pending_edit');

    select count(*)::int into m
    from public.toil_credit_requests t
    where t.org_id = v_org and t.status = 'pending';

    return coalesce(n, 0) + coalesce(m, 0);
  end if;

  if not public.has_permission(v_uid, v_org, 'leave.approve_direct_reports', '{}'::jsonb) then
    return 0;
  end if;

  select count(*)::int into n
  from public.leave_requests r
  join public.profiles s on s.id = r.requester_id
  where r.org_id = v_org
    and r.status in ('pending', 'pending_cancel', 'pending_edit')
    and s.reports_to_user_id = v_uid;

  select count(*)::int into m
  from public.toil_credit_requests t
  join public.profiles s on s.id = t.requester_id
  where t.org_id = v_org
    and t.status = 'pending'
    and s.reports_to_user_id = v_uid;

  return coalesce(n, 0) + coalesce(m, 0);
end;
$$;

revoke all on function public.leave_pending_approval_count_for_me() from public;
grant execute on function public.leave_pending_approval_count_for_me() to authenticated;

-- ---------------------------------------------------------------------------
-- toil_credit_can_decide_request
-- ---------------------------------------------------------------------------

create or replace function public.toil_credit_can_decide_request(p_viewer uuid, p_request_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_requester uuid;
begin
  select t.org_id, t.requester_id
  into v_org, v_requester
  from public.toil_credit_requests t
  where t.id = p_request_id;

  if v_org is null then
    return false;
  end if;

  if public.has_permission(p_viewer, v_org, 'leave.manage_org', '{}'::jsonb) then
    return true;
  end if;

  if not public.has_permission(p_viewer, v_org, 'leave.approve_direct_reports', '{}'::jsonb) then
    return false;
  end if;

  return exists (
    select 1 from public.profiles s
    where s.id = v_requester
      and s.org_id = v_org
      and s.reports_to_user_id = p_viewer
  );
end;
$$;

revoke all on function public.toil_credit_can_decide_request(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- toil_credit_request_submit
-- ---------------------------------------------------------------------------

create or replace function public.toil_credit_request_submit(
  p_work_date date,
  p_minutes integer,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  rid uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'no active org profile';
  end if;

  if not public.has_permission(v_uid, v_org, 'leave.submit', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if p_work_date is null then
    raise exception 'work date required';
  end if;

  if p_minutes is null or p_minutes < 1 or p_minutes > 100000 then
    raise exception 'minutes must be between 1 and 100000';
  end if;

  insert into public.toil_credit_requests (org_id, requester_id, work_date, minutes_earned, note)
  values (
    v_org,
    v_uid,
    p_work_date,
    p_minutes,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into rid;

  return rid;
end;
$$;

revoke all on function public.toil_credit_request_submit(date, integer, text) from public;
grant execute on function public.toil_credit_request_submit(date, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- toil_credit_request_decide
-- ---------------------------------------------------------------------------

create or replace function public.toil_credit_request_decide(
  p_request_id uuid,
  p_approve boolean,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_requester uuid;
  v_work date;
  v_minutes integer;
  v_status text;
  v_yk text;
  v_mpd integer;
  v_days numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.toil_credit_can_decide_request(v_uid, p_request_id) then
    raise exception 'not allowed';
  end if;

  select org_id, requester_id, work_date, minutes_earned, status
  into v_org, v_requester, v_work, v_minutes, v_status
  from public.toil_credit_requests
  where id = p_request_id;

  if v_status <> 'pending' then
    raise exception 'request is not pending';
  end if;

  if not p_approve then
    update public.toil_credit_requests
    set
      status = 'rejected',
      decided_by = v_uid,
      decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where id = p_request_id;

    perform public.leave_notify_toil_credit_decision(v_org, p_request_id, v_requester, 'toil_credit_rejected', v_uid);
    return;
  end if;

  select coalesce(ols.toil_minutes_per_day, 480) into v_mpd
  from public.org_leave_settings ols
  where ols.org_id = v_org;

  if v_mpd is null or v_mpd < 1 then
    v_mpd := 480;
  end if;

  v_days := round(v_minutes::numeric / v_mpd::numeric, 4);
  v_yk := public.leave_calendar_year_key(v_org, v_work);

  perform public.leave_ensure_allowance_row(v_org, v_requester, v_yk);

  update public.leave_allowances
  set
    toil_balance_days = toil_balance_days + v_days,
    updated_at = now()
  where org_id = v_org and user_id = v_requester and leave_year = v_yk;

  update public.toil_credit_requests
  set
    status = 'approved',
    decided_by = v_uid,
    decided_at = now(),
    decision_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_request_id;

  perform public.leave_notify_toil_credit_decision(v_org, p_request_id, v_requester, 'toil_credit_approved', v_uid);
end;
$$;

revoke all on function public.toil_credit_request_decide(uuid, boolean, text) from public;
grant execute on function public.toil_credit_request_decide(uuid, boolean, text) to authenticated;
