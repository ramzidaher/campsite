-- Block overlapping annual/TOIL leave bookings for the same person (inclusive dates).

create or replace function public.leave_request_has_overlap(
  p_org_id uuid,
  p_user_id uuid,
  p_start date,
  p_end date,
  p_exclude_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leave_requests r
    where r.org_id = p_org_id
      and r.requester_id = p_user_id
      and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
      and r.status in ('pending', 'approved', 'pending_edit', 'pending_cancel')
      and (
        (r.start_date <= p_end and r.end_date >= p_start)
        or (
          r.proposed_start_date is not null
          and r.proposed_end_date is not null
          and r.proposed_start_date <= p_end
          and r.proposed_end_date >= p_start
        )
      )
  );
$$;

revoke all on function public.leave_request_has_overlap(uuid, uuid, date, date, uuid) from public;

create or replace function public.leave_request_submit(
  p_kind text,
  p_start date,
  p_end date,
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
  v_yk text;
  v_days numeric;
  v_ent numeric;
  v_used_pending numeric;
  v_bal numeric;
  v_pending_toil numeric;
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

  if p_kind not in ('annual', 'toil') then
    raise exception 'invalid kind';
  end if;

  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'invalid dates';
  end if;

  if public.leave_request_has_overlap(v_org, v_uid, p_start, p_end, null) then
    raise exception 'leave request overlaps an existing booking';
  end if;

  v_days := public.leave_calendar_days_inclusive(p_start, p_end);
  v_yk := public.leave_calendar_year_key(v_org, p_start);

  perform public.leave_ensure_allowance_row(v_org, v_uid, v_yk);

  if p_kind = 'annual' then
    select la.annual_entitlement_days into v_ent
    from public.leave_allowances la
    where la.org_id = v_org and la.user_id = v_uid and la.leave_year = v_yk;

    v_used_pending :=
      public.leave_sum_request_days(v_org, v_uid, 'annual', v_yk, array['pending', 'approved']::text[], null);

    if v_used_pending + v_days > coalesce(v_ent, 0) then
      raise exception 'annual leave would exceed entitlement for leave year %', v_yk;
    end if;
  else
    select la.toil_balance_days into v_bal
    from public.leave_allowances la
    where la.org_id = v_org and la.user_id = v_uid and la.leave_year = v_yk;

    v_pending_toil := public.leave_pending_toil_days_excluding(v_org, v_uid, v_yk, null);
    if coalesce(v_bal, 0) - v_pending_toil < v_days then
      raise exception 'insufficient TOIL balance';
    end if;
  end if;

  insert into public.leave_requests (
    org_id, requester_id, kind, start_date, end_date, status, note
  )
  values (
    v_org, v_uid, p_kind, p_start, p_end, 'pending', nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into rid;

  return rid;
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

  if public.leave_request_has_overlap(v_org, v_requester, p_start, p_end, p_request_id) then
    raise exception 'leave request overlaps an existing booking';
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

  if public.leave_request_has_overlap(v_org, v_requester, v_start, v_end, p_request_id) then
    raise exception 'leave request overlaps an existing booking';
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
