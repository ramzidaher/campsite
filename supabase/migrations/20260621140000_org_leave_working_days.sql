-- Configurable working days for annual/TOIL: exclude chosen weekdays (default Sat/Sun) from leave totals.

alter table public.org_leave_settings
  add column if not exists leave_use_working_days boolean not null default false;

alter table public.org_leave_settings
  add column if not exists non_working_iso_dows smallint[] not null default array[6, 7]::smallint[];

comment on column public.org_leave_settings.leave_use_working_days is
  'When true, annual and TOIL leave deduct only working days (weekdays not listed in non_working_iso_dows).';

comment on column public.org_leave_settings.non_working_iso_dows is
  'ISO weekday numbers (1=Monday … 7=Sunday) that do not count toward leave. Default 6–7 (weekend).';

alter table public.org_leave_settings
  drop constraint if exists org_leave_settings_non_working_iso_dows_check;

alter table public.org_leave_settings
  add constraint org_leave_settings_non_working_iso_dows_check
  check (
    non_working_iso_dows <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
    and coalesce(array_length(non_working_iso_dows, 1), 0) <= 7
  );

-- Calendar-inclusive day count, or working days only per org (ISO Mon=1 … Sun=7).
create or replace function public.leave_org_day_count_inclusive(
  p_org_id uuid,
  p_start date,
  p_end date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_use_working boolean;
  v_off smallint[];
  d date;
  n numeric := 0;
  v_isod smallint;
begin
  if p_start is null or p_end is null or p_end < p_start then
    return 0;
  end if;

  select
    coalesce(ols.leave_use_working_days, false),
    ols.non_working_iso_dows
  into v_use_working, v_off
  from public.org_leave_settings ols
  where ols.org_id = p_org_id;

  if not found then
    return (p_end - p_start + 1)::numeric;
  end if;

  if not coalesce(v_use_working, false) then
    return (p_end - p_start + 1)::numeric;
  end if;

  if v_off is null or coalesce(array_length(v_off, 1), 0) = 0 then
    return (p_end - p_start + 1)::numeric;
  end if;

  d := p_start;
  while d <= p_end loop
    v_isod := extract(isodow from d)::smallint;
    if not (v_isod = any (v_off)) then
      n := n + 1;
    end if;
    d := d + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.leave_org_day_count_inclusive(uuid, date, date) from public;

create or replace function public.leave_my_org_day_count_inclusive(
  p_start date,
  p_end date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = auth.uid() and status = 'active';
  if v_org is null then
    raise exception 'no active org profile';
  end if;

  return public.leave_org_day_count_inclusive(v_org, p_start, p_end);
end;
$$;

grant execute on function public.leave_my_org_day_count_inclusive(date, date) to authenticated;

create or replace function public.leave_sum_request_days(
  p_org_id uuid,
  p_user_id uuid,
  p_kind text,
  p_year_key text,
  p_statuses text[],
  p_exclude_request_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(public.leave_org_day_count_inclusive(p_org_id, r.start_date, r.end_date)), 0)::numeric
  from public.leave_requests r
  where r.org_id = p_org_id
    and r.requester_id = p_user_id
    and r.kind = p_kind
    and r.status = any (p_statuses)
    and public.leave_calendar_year_key(p_org_id, r.start_date) = p_year_key
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id);
$$;

create or replace function public.leave_pending_toil_days_excluding(
  p_org_id uuid,
  p_user_id uuid,
  p_year_key text,
  p_exclude_request_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(public.leave_org_day_count_inclusive(p_org_id, r.start_date, r.end_date)), 0)::numeric
  from public.leave_requests r
  where r.org_id = p_org_id
    and r.requester_id = p_user_id
    and r.kind = 'toil'
    and r.status = 'pending'
    and public.leave_calendar_year_key(p_org_id, r.start_date) = p_year_key
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id);
$$;

create or replace function public.leave_prorate_annual_days(
  p_org_id uuid,
  p_user_id uuid,
  p_leave_year text,
  p_full_year_entitlement_days numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start_date date;
  v_leave_year text;
  v_year_start date;
  v_year_end date;
  v_total_days numeric;
  v_remaining_days numeric;
  v_effective_entitlement numeric;
  v_start_month smallint := 1;
  v_start_day smallint := 1;
  v_year_start_num integer;
begin
  v_leave_year := trim(coalesce(p_leave_year, ''));
  if v_leave_year = '' or v_leave_year !~ '^[0-9]{4}$' then
    return 0;
  end if;

  v_year_start_num := v_leave_year::integer;

  select
    coalesce(ols.leave_year_start_month, 1),
    coalesce(ols.leave_year_start_day, 1)
  into v_start_month, v_start_day
  from public.org_leave_settings ols
  where ols.org_id = p_org_id;

  v_year_start := make_date(v_year_start_num, v_start_month, v_start_day);
  v_year_end := (v_year_start + interval '1 year' - interval '1 day')::date;

  select ehr.employment_start_date
  into v_start_date
  from public.employee_hr_records ehr
  where ehr.org_id = p_org_id
    and ehr.user_id = p_user_id;

  v_effective_entitlement := greatest(coalesce(p_full_year_entitlement_days, 0), 0);

  if v_start_date is not null then
    if v_start_date > v_year_end then
      v_effective_entitlement := 0;
    elsif v_start_date > v_year_start then
      v_total_days := public.leave_org_day_count_inclusive(p_org_id, v_year_start, v_year_end);
      v_remaining_days := public.leave_org_day_count_inclusive(p_org_id, v_start_date, v_year_end);
      v_effective_entitlement := round(
        (v_effective_entitlement * v_remaining_days::numeric / nullif(v_total_days, 0)::numeric) * 2
      ) / 2;
    end if;
  end if;

  return v_effective_entitlement;
end;
$$;

drop function if exists public.org_leave_settings_upsert(integer, smallint, smallint, integer, numeric, boolean);

create or replace function public.org_leave_settings_upsert(
  p_bradford_window_days integer,
  p_leave_year_start_month smallint,
  p_leave_year_start_day smallint,
  p_approved_request_change_window_hours integer default null,
  p_default_annual_entitlement_days numeric default null,
  p_clear_default_annual_entitlement boolean default false,
  p_leave_use_working_days boolean default false,
  p_non_working_iso_dows smallint[] default array[6, 7]::smallint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_default numeric;
  v_dows smallint[];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if coalesce(p_clear_default_annual_entitlement, false) then
    v_default := null;
  elsif p_default_annual_entitlement_days is not null then
    v_default := p_default_annual_entitlement_days;
  else
    v_default := null;
  end if;

  v_dows := coalesce(p_non_working_iso_dows, array[6, 7]::smallint[]);

  insert into public.org_leave_settings (
    org_id,
    bradford_window_days,
    leave_year_start_month,
    leave_year_start_day,
    approved_request_change_window_hours,
    default_annual_entitlement_days,
    leave_use_working_days,
    non_working_iso_dows
  )
  values (
    v_org,
    coalesce(p_bradford_window_days, 365),
    coalesce(p_leave_year_start_month, 1),
    coalesce(p_leave_year_start_day, 1),
    coalesce(p_approved_request_change_window_hours, 48),
    case when coalesce(p_clear_default_annual_entitlement, false) then null else v_default end,
    coalesce(p_leave_use_working_days, false),
    v_dows
  )
  on conflict (org_id) do update
  set
    bradford_window_days = coalesce(excluded.bradford_window_days, public.org_leave_settings.bradford_window_days),
    leave_year_start_month = coalesce(excluded.leave_year_start_month, public.org_leave_settings.leave_year_start_month),
    leave_year_start_day = coalesce(excluded.leave_year_start_day, public.org_leave_settings.leave_year_start_day),
    approved_request_change_window_hours = coalesce(excluded.approved_request_change_window_hours, public.org_leave_settings.approved_request_change_window_hours),
    default_annual_entitlement_days = case
      when coalesce(p_clear_default_annual_entitlement, false) then null
      when p_default_annual_entitlement_days is not null then excluded.default_annual_entitlement_days
      else public.org_leave_settings.default_annual_entitlement_days
    end,
    leave_use_working_days = excluded.leave_use_working_days,
    non_working_iso_dows = excluded.non_working_iso_dows,
    updated_at = now();
end;
$$;

revoke all on function public.org_leave_settings_upsert(integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[]) from public;
grant execute on function public.org_leave_settings_upsert(integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[]) to authenticated;

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

  v_days := public.leave_org_day_count_inclusive(v_org, p_start, p_end);
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

  v_days := public.leave_org_day_count_inclusive(v_org, v_start, v_end);
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
