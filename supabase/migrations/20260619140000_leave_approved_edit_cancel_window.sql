-- Allow approved leave edits/cancellations via approval requests with a time window.

alter table public.org_leave_settings
  add column if not exists approved_request_change_window_hours integer not null default 48
  check (approved_request_change_window_hours >= 1 and approved_request_change_window_hours <= 720);

alter table public.leave_requests
  drop constraint if exists leave_requests_status_check;

alter table public.leave_requests
  add constraint leave_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled', 'pending_cancel', 'pending_edit'));

alter table public.leave_requests
  add column if not exists requested_action_at timestamptz,
  add column if not exists proposed_kind text check (proposed_kind in ('annual', 'toil')),
  add column if not exists proposed_start_date date,
  add column if not exists proposed_end_date date,
  add column if not exists proposed_note text;

create or replace function public.org_leave_settings_upsert(
  p_bradford_window_days integer,
  p_leave_year_start_month smallint,
  p_leave_year_start_day smallint,
  p_approved_request_change_window_hours integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  insert into public.org_leave_settings (
    org_id, bradford_window_days, leave_year_start_month, leave_year_start_day, approved_request_change_window_hours
  )
  values (
    v_org,
    coalesce(p_bradford_window_days, 365),
    coalesce(p_leave_year_start_month, 1),
    coalesce(p_leave_year_start_day, 1),
    coalesce(p_approved_request_change_window_hours, 48)
  )
  on conflict (org_id) do update
  set
    bradford_window_days = coalesce(excluded.bradford_window_days, public.org_leave_settings.bradford_window_days),
    leave_year_start_month = coalesce(excluded.leave_year_start_month, public.org_leave_settings.leave_year_start_month),
    leave_year_start_day = coalesce(excluded.leave_year_start_day, public.org_leave_settings.leave_year_start_day),
    approved_request_change_window_hours = coalesce(excluded.approved_request_change_window_hours, public.org_leave_settings.approved_request_change_window_hours),
    updated_at = now();
end;
$$;

create or replace function public.leave_request_decide(
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
  v_kind text;
  v_start date;
  v_end date;
  v_note text;
  v_status text;
  v_days numeric;
  v_yk text;
  v_ent numeric;
  v_used_other numeric;
  v_bal numeric;
  v_pending_toil numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.leave_can_decide_request(v_uid, p_request_id) then
    raise exception 'not allowed';
  end if;

  select
    org_id,
    requester_id,
    coalesce(proposed_kind, kind),
    coalesce(proposed_start_date, start_date),
    coalesce(proposed_end_date, end_date),
    coalesce(proposed_note, note),
    status
  into v_org, v_requester, v_kind, v_start, v_end, v_note, v_status
  from public.leave_requests
  where id = p_request_id;

  if v_status not in ('pending', 'pending_cancel', 'pending_edit') then
    raise exception 'request is not awaiting approval';
  end if;

  if v_status = 'pending_cancel' then
    if p_approve then
      update public.leave_requests
      set
        status = 'cancelled',
        decided_by = v_uid,
        decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), ''),
        requested_action_at = null,
        proposed_kind = null,
        proposed_start_date = null,
        proposed_end_date = null,
        proposed_note = null,
        updated_at = now()
      where id = p_request_id;
    else
      update public.leave_requests
      set
        status = 'approved',
        decided_by = v_uid,
        decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), ''),
        requested_action_at = null,
        proposed_kind = null,
        proposed_start_date = null,
        proposed_end_date = null,
        proposed_note = null,
        updated_at = now()
      where id = p_request_id;
    end if;
    return;
  end if;

  if not p_approve then
    if v_status = 'pending_edit' then
      update public.leave_requests
      set
        status = 'approved',
        decided_by = v_uid,
        decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), ''),
        requested_action_at = null,
        proposed_kind = null,
        proposed_start_date = null,
        proposed_end_date = null,
        proposed_note = null,
        updated_at = now()
      where id = p_request_id;
    else
      update public.leave_requests
      set
        status = 'rejected',
        decided_by = v_uid,
        decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
      where id = p_request_id;
    end if;
    return;
  end if;

  v_days := public.leave_calendar_days_inclusive(v_start, v_end);
  v_yk := public.leave_calendar_year_key(v_org, v_start);
  perform public.leave_ensure_allowance_row(v_org, v_requester, v_yk);

  if v_kind = 'annual' then
    select la.annual_entitlement_days into v_ent
    from public.leave_allowances la
    where la.org_id = v_org and la.user_id = v_requester and la.leave_year = v_yk;

    v_used_other :=
      public.leave_sum_request_days(v_org, v_requester, 'annual', v_yk, array['pending', 'approved', 'pending_edit']::text[], p_request_id)
      + v_days;

    if v_used_other > coalesce(v_ent, 0) then
      raise exception 'annual leave would exceed entitlement';
    end if;
  else
    select la.toil_balance_days into v_bal
    from public.leave_allowances la
    where la.org_id = v_org and la.user_id = v_requester and la.leave_year = v_yk;

    v_pending_toil := public.leave_pending_toil_days_excluding(v_org, v_requester, v_yk, p_request_id);
    if coalesce(v_bal, 0) - v_pending_toil < v_days then
      raise exception 'insufficient TOIL balance';
    end if;
  end if;

  if v_status = 'pending_edit' then
    update public.leave_requests
    set
      kind = v_kind,
      start_date = v_start,
      end_date = v_end,
      note = v_note,
      status = 'approved',
      decided_by = v_uid,
      decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), ''),
      requested_action_at = null,
      proposed_kind = null,
      proposed_start_date = null,
      proposed_end_date = null,
      proposed_note = null,
      updated_at = now()
    where id = p_request_id;
    return;
  end if;

  if v_kind = 'toil' then
    update public.leave_allowances
    set
      toil_balance_days = toil_balance_days - v_days,
      updated_at = now()
    where org_id = v_org and user_id = v_requester and leave_year = v_yk;
  end if;

  update public.leave_requests
  set
    status = 'approved',
    decided_by = v_uid,
    decided_at = now(),
    decision_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.leave_request_cancel(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_requester uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select requester_id, status
  into v_requester, v_status
  from public.leave_requests
  where id = p_request_id;

  if v_requester is null then
    raise exception 'not found';
  end if;

  if v_requester <> v_uid then
    raise exception 'not allowed';
  end if;

  if v_status <> 'pending' then
    raise exception 'only pending requests can be cancelled directly';
  end if;

  update public.leave_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.leave_request_cancel_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_requester uuid;
  v_status text;
  v_decided_at timestamptz;
  v_window_hours integer := 48;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id, requester_id, status, decided_at
  into v_org, v_requester, v_status, v_decided_at
  from public.leave_requests
  where id = p_request_id;

  if v_requester is null then
    raise exception 'not found';
  end if;

  if v_requester <> v_uid then
    raise exception 'not allowed';
  end if;

  if v_status <> 'approved' then
    raise exception 'only approved requests can be sent for cancellation approval';
  end if;

  select coalesce(approved_request_change_window_hours, 48)
  into v_window_hours
  from public.org_leave_settings
  where org_id = v_org;

  if v_decided_at is null or now() > (v_decided_at + make_interval(hours => v_window_hours)) then
    raise exception 'cancellation request window has expired';
  end if;

  update public.leave_requests
  set
    status = 'pending_cancel',
    requested_action_at = now(),
    proposed_kind = null,
    proposed_start_date = null,
    proposed_end_date = null,
    proposed_note = null,
    updated_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.leave_request_edit_request(
  p_request_id uuid,
  p_kind text,
  p_start date,
  p_end date,
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
  v_status text;
  v_decided_at timestamptz;
  v_window_hours integer := 48;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_kind not in ('annual', 'toil') then
    raise exception 'invalid kind';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid dates';
  end if;

  select org_id, requester_id, status, decided_at
  into v_org, v_requester, v_status, v_decided_at
  from public.leave_requests
  where id = p_request_id;

  if v_requester is null then
    raise exception 'not found';
  end if;

  if v_requester <> v_uid then
    raise exception 'not allowed';
  end if;

  if v_status <> 'approved' then
    raise exception 'only approved requests can be sent for edit approval';
  end if;

  select coalesce(approved_request_change_window_hours, 48)
  into v_window_hours
  from public.org_leave_settings
  where org_id = v_org;

  if v_decided_at is null or now() > (v_decided_at + make_interval(hours => v_window_hours)) then
    raise exception 'edit request window has expired';
  end if;

  update public.leave_requests
  set
    status = 'pending_edit',
    requested_action_at = now(),
    proposed_kind = p_kind,
    proposed_start_date = p_start,
    proposed_end_date = p_end,
    proposed_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_request_id;
end;
$$;

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
    return coalesce(n, 0);
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

  return coalesce(n, 0);
end;
$$;

revoke all on function public.org_leave_settings_upsert(integer, smallint, smallint, integer) from public;
grant execute on function public.org_leave_settings_upsert(integer, smallint, smallint, integer) to authenticated;

revoke all on function public.leave_request_cancel_request(uuid) from public;
grant execute on function public.leave_request_cancel_request(uuid) to authenticated;

revoke all on function public.leave_request_edit_request(uuid, text, date, date, text) from public;
grant execute on function public.leave_request_edit_request(uuid, text, date, date, text) to authenticated;
