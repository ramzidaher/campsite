-- Leave encashment workflow: request payout of unused annual leave with approval.

alter table public.org_leave_settings
  add column if not exists encashment_enabled boolean not null default false,
  add column if not exists encashment_requires_approval boolean not null default true,
  add column if not exists encashment_max_days numeric(10, 2) not null default 0
    check (encashment_max_days >= 0 and encashment_max_days <= 365);

comment on column public.org_leave_settings.encashment_enabled is
  'When true, employees can request annual leave encashment (unused leave payout).';
comment on column public.org_leave_settings.encashment_requires_approval is
  'When true, each encashment request requires manager/admin approval.';
comment on column public.org_leave_settings.encashment_max_days is
  'Maximum annual leave days that can be encashed per request.';

create table if not exists public.leave_encashment_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  leave_year text not null,
  days_requested numeric(10, 2) not null check (days_requested > 0),
  days_approved numeric(10, 2) check (days_approved is null or days_approved >= 0),
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leave_encashment_requests_org_status_idx
  on public.leave_encashment_requests (org_id, status);
create index if not exists leave_encashment_requests_requester_idx
  on public.leave_encashment_requests (requester_id, created_at desc);

alter table public.leave_encashment_requests enable row level security;

drop policy if exists leave_encashment_requests_select on public.leave_encashment_requests;
create policy leave_encashment_requests_select
  on public.leave_encashment_requests
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
          where s.id = leave_encashment_requests.requester_id
            and s.reports_to_user_id = auth.uid()
        )
      )
    )
  );

create or replace function public.leave_encashment_available_days(
  p_org_id uuid,
  p_user_id uuid,
  p_leave_year text
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ent numeric := 0;
  v_used numeric := 0;
  v_carryover numeric := 0;
  v_already numeric := 0;
begin
  select coalesce(la.annual_entitlement_days, 0)
  into v_ent
  from public.leave_allowances la
  where la.org_id = p_org_id
    and la.user_id = p_user_id
    and la.leave_year = p_leave_year;

  v_used := public.leave_sum_request_days(
    p_org_id,
    p_user_id,
    'annual',
    p_leave_year,
    array['pending', 'approved', 'pending_edit', 'pending_cancel']::text[],
    null
  );

  select coalesce(sum(c.days_requested), 0)
  into v_carryover
  from public.leave_carryover_requests c
  where c.org_id = p_org_id
    and c.requester_id = p_user_id
    and c.from_leave_year = p_leave_year
    and c.status in ('pending', 'approved');

  select coalesce(sum(e.days_requested), 0)
  into v_already
  from public.leave_encashment_requests e
  where e.org_id = p_org_id
    and e.requester_id = p_user_id
    and e.leave_year = p_leave_year
    and e.status in ('pending', 'approved');

  return greatest(0, coalesce(v_ent, 0) - coalesce(v_used, 0) - coalesce(v_carryover, 0) - coalesce(v_already, 0));
end;
$$;

revoke all on function public.leave_encashment_available_days(uuid, uuid, text) from public;

create or replace function public.leave_encashment_can_decide_request(p_viewer uuid, p_request_id uuid)
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
  select e.org_id, e.requester_id
  into v_org, v_requester
  from public.leave_encashment_requests e
  where e.id = p_request_id;

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

revoke all on function public.leave_encashment_can_decide_request(uuid, uuid) from public;

create or replace function public.leave_encashment_request_submit(
  p_leave_year text,
  p_days_requested numeric,
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
  v_enabled boolean := false;
  v_requires_approval boolean := true;
  v_max numeric := 0;
  v_available numeric := 0;
  v_req numeric;
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

  if p_leave_year is null or trim(p_leave_year) !~ '^[0-9]{4}$' then
    raise exception 'invalid leave_year';
  end if;
  if p_days_requested is null or p_days_requested <= 0 then
    raise exception 'days requested must be greater than zero';
  end if;

  select
    coalesce(ols.encashment_enabled, false),
    coalesce(ols.encashment_requires_approval, true),
    coalesce(ols.encashment_max_days, 0)
  into v_enabled, v_requires_approval, v_max
  from public.org_leave_settings ols
  where ols.org_id = v_org;

  if not coalesce(v_enabled, false) then
    raise exception 'leave encashment is disabled for this organisation';
  end if;

  v_available := public.leave_encashment_available_days(v_org, v_uid, trim(p_leave_year));
  v_req := round(least(p_days_requested, coalesce(v_max, 0), v_available), 2);
  if v_req <= 0 then
    raise exception 'no encashable leave days available';
  end if;

  insert into public.leave_encashment_requests (
    org_id, requester_id, leave_year, days_requested, note, status, decided_by, decided_at, days_approved
  )
  values (
    v_org,
    v_uid,
    trim(p_leave_year),
    v_req,
    nullif(trim(coalesce(p_note, '')), ''),
    case when v_requires_approval then 'pending' else 'approved' end,
    case when v_requires_approval then null else v_uid end,
    case when v_requires_approval then null else now() end,
    case when v_requires_approval then null else v_req end
  )
  returning id into rid;

  if not v_requires_approval then
    update public.leave_allowances
    set
      annual_entitlement_days = greatest(0, annual_entitlement_days - v_req),
      updated_at = now()
    where org_id = v_org and user_id = v_uid and leave_year = trim(p_leave_year);
  end if;

  return rid;
end;
$$;

revoke all on function public.leave_encashment_request_submit(text, numeric, text) from public;
grant execute on function public.leave_encashment_request_submit(text, numeric, text) to authenticated;

create or replace function public.leave_encashment_request_decide(
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
  v_year text;
  v_status text;
  v_req numeric := 0;
  v_max numeric := 0;
  v_available numeric := 0;
  v_apply numeric := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.leave_encashment_can_decide_request(v_uid, p_request_id) then
    raise exception 'not allowed';
  end if;

  select e.org_id, e.requester_id, e.leave_year, e.days_requested, e.status
  into v_org, v_requester, v_year, v_req, v_status
  from public.leave_encashment_requests e
  where e.id = p_request_id;

  if v_status <> 'pending' then
    raise exception 'request is not pending';
  end if;

  if not p_approve then
    update public.leave_encashment_requests
    set
      status = 'rejected',
      days_approved = 0,
      decided_by = v_uid,
      decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where id = p_request_id;
    return;
  end if;

  select coalesce(ols.encashment_max_days, 0)
  into v_max
  from public.org_leave_settings ols
  where ols.org_id = v_org;

  v_available := public.leave_encashment_available_days(v_org, v_requester, v_year);
  v_apply := round(least(v_req, coalesce(v_max, 0), v_available), 2);

  if v_apply <= 0 then
    raise exception 'no encashable leave days available to approve';
  end if;

  update public.leave_allowances
  set
    annual_entitlement_days = greatest(0, annual_entitlement_days - v_apply),
    updated_at = now()
  where org_id = v_org and user_id = v_requester and leave_year = v_year;

  update public.leave_encashment_requests
  set
    status = 'approved',
    days_approved = v_apply,
    decided_by = v_uid,
    decided_at = now(),
    decision_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.leave_encashment_request_decide(uuid, boolean, text) from public;
grant execute on function public.leave_encashment_request_decide(uuid, boolean, text) to authenticated;

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
  c int;
  e int;
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

    select count(*)::int into c
    from public.leave_carryover_requests cr
    where cr.org_id = v_org and cr.status = 'pending';

    select count(*)::int into e
    from public.leave_encashment_requests er
    where er.org_id = v_org and er.status = 'pending';

    return coalesce(n, 0) + coalesce(m, 0) + coalesce(c, 0) + coalesce(e, 0);
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

  select count(*)::int into c
  from public.leave_carryover_requests cr
  join public.profiles s on s.id = cr.requester_id
  where cr.org_id = v_org
    and cr.status = 'pending'
    and s.reports_to_user_id = v_uid;

  select count(*)::int into e
  from public.leave_encashment_requests er
  join public.profiles s on s.id = er.requester_id
  where er.org_id = v_org
    and er.status = 'pending'
    and s.reports_to_user_id = v_uid;

  return coalesce(n, 0) + coalesce(m, 0) + coalesce(c, 0) + coalesce(e, 0);
end;
$$;

revoke all on function public.leave_pending_approval_count_for_me() from public;
grant execute on function public.leave_pending_approval_count_for_me() to authenticated;

drop function if exists public.org_leave_settings_upsert(
  integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[],
  boolean, numeric, numeric, numeric, boolean, smallint, numeric, boolean, boolean, numeric
);

create or replace function public.org_leave_settings_upsert(
  p_bradford_window_days integer,
  p_leave_year_start_month smallint,
  p_leave_year_start_day smallint,
  p_approved_request_change_window_hours integer default null,
  p_default_annual_entitlement_days numeric default null,
  p_clear_default_annual_entitlement boolean default false,
  p_leave_use_working_days boolean default false,
  p_non_working_iso_dows smallint[] default array[6, 7]::smallint[],
  p_use_uk_weekly_paid_leave_formula boolean default null,
  p_statutory_weeks_annual_leave numeric default null,
  p_ssp_flat_weekly_rate_gbp numeric default null,
  p_ssp_lel_weekly_gbp numeric default null,
  p_clear_ssp_lel boolean default false,
  p_ssp_waiting_qualifying_days smallint default null,
  p_ssp_reform_percent_of_earnings numeric default null,
  p_carry_over_enabled boolean default null,
  p_carry_over_requires_approval boolean default null,
  p_carry_over_max_days numeric default null,
  p_encashment_enabled boolean default null,
  p_encashment_requires_approval boolean default null,
  p_encashment_max_days numeric default null
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
    non_working_iso_dows,
    use_uk_weekly_paid_leave_formula,
    statutory_weeks_annual_leave,
    ssp_flat_weekly_rate_gbp,
    ssp_lel_weekly_gbp,
    ssp_waiting_qualifying_days,
    ssp_reform_percent_of_earnings,
    carry_over_enabled,
    carry_over_requires_approval,
    carry_over_max_days,
    encashment_enabled,
    encashment_requires_approval,
    encashment_max_days
  )
  values (
    v_org,
    coalesce(p_bradford_window_days, 365),
    coalesce(p_leave_year_start_month, 1),
    coalesce(p_leave_year_start_day, 1),
    coalesce(p_approved_request_change_window_hours, 48),
    case when coalesce(p_clear_default_annual_entitlement, false) then null else v_default end,
    coalesce(p_leave_use_working_days, false),
    v_dows,
    coalesce(p_use_uk_weekly_paid_leave_formula, false),
    coalesce(p_statutory_weeks_annual_leave, 5.6),
    coalesce(p_ssp_flat_weekly_rate_gbp, 123.25),
    case when coalesce(p_clear_ssp_lel, false) then null else p_ssp_lel_weekly_gbp end,
    coalesce(p_ssp_waiting_qualifying_days, 0)::smallint,
    coalesce(p_ssp_reform_percent_of_earnings, 0.8),
    coalesce(p_carry_over_enabled, false),
    coalesce(p_carry_over_requires_approval, true),
    coalesce(p_carry_over_max_days, 0),
    coalesce(p_encashment_enabled, false),
    coalesce(p_encashment_requires_approval, true),
    coalesce(p_encashment_max_days, 0)
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
    use_uk_weekly_paid_leave_formula = case
      when p_use_uk_weekly_paid_leave_formula is null then public.org_leave_settings.use_uk_weekly_paid_leave_formula
      else excluded.use_uk_weekly_paid_leave_formula
    end,
    statutory_weeks_annual_leave = case
      when p_statutory_weeks_annual_leave is null then public.org_leave_settings.statutory_weeks_annual_leave
      else excluded.statutory_weeks_annual_leave
    end,
    ssp_flat_weekly_rate_gbp = case
      when p_ssp_flat_weekly_rate_gbp is null then public.org_leave_settings.ssp_flat_weekly_rate_gbp
      else excluded.ssp_flat_weekly_rate_gbp
    end,
    ssp_lel_weekly_gbp = case
      when coalesce(p_clear_ssp_lel, false) then null
      when p_ssp_lel_weekly_gbp is not null then excluded.ssp_lel_weekly_gbp
      else public.org_leave_settings.ssp_lel_weekly_gbp
    end,
    ssp_waiting_qualifying_days = case
      when p_ssp_waiting_qualifying_days is null then public.org_leave_settings.ssp_waiting_qualifying_days
      else excluded.ssp_waiting_qualifying_days
    end,
    ssp_reform_percent_of_earnings = case
      when p_ssp_reform_percent_of_earnings is null then public.org_leave_settings.ssp_reform_percent_of_earnings
      else excluded.ssp_reform_percent_of_earnings
    end,
    carry_over_enabled = case
      when p_carry_over_enabled is null then public.org_leave_settings.carry_over_enabled
      else excluded.carry_over_enabled
    end,
    carry_over_requires_approval = case
      when p_carry_over_requires_approval is null then public.org_leave_settings.carry_over_requires_approval
      else excluded.carry_over_requires_approval
    end,
    carry_over_max_days = case
      when p_carry_over_max_days is null then public.org_leave_settings.carry_over_max_days
      else excluded.carry_over_max_days
    end,
    encashment_enabled = case
      when p_encashment_enabled is null then public.org_leave_settings.encashment_enabled
      else excluded.encashment_enabled
    end,
    encashment_requires_approval = case
      when p_encashment_requires_approval is null then public.org_leave_settings.encashment_requires_approval
      else excluded.encashment_requires_approval
    end,
    encashment_max_days = case
      when p_encashment_max_days is null then public.org_leave_settings.encashment_max_days
      else excluded.encashment_max_days
    end,
    updated_at = now();
end;
$$;

revoke all on function public.org_leave_settings_upsert(
  integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[],
  boolean, numeric, numeric, numeric, boolean, smallint, numeric, boolean, boolean, numeric,
  boolean, boolean, numeric
) from public;
grant execute on function public.org_leave_settings_upsert(
  integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[],
  boolean, numeric, numeric, numeric, boolean, smallint, numeric, boolean, boolean, numeric,
  boolean, boolean, numeric
) to authenticated;
