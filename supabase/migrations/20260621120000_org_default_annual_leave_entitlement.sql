-- Org-wide default full-year annual leave (days) plus bulk apply with existing pro-rata rules.

alter table public.org_leave_settings
  add column if not exists default_annual_entitlement_days numeric(10, 2)
    check (default_annual_entitlement_days is null or default_annual_entitlement_days >= 0);

comment on column public.org_leave_settings.default_annual_entitlement_days is
  'Optional full-year annual leave days for this organisation; bulk apply pro-rates using employment start and leave-year boundaries.';

-- Shared pro-rata logic (not granted to clients; only called from security definer RPCs owned by the same role).
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
  v_total_days integer;
  v_remaining_days integer;
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
      v_total_days := (v_year_end - v_year_start) + 1;
      v_remaining_days := (v_year_end - v_start_date) + 1;
      v_effective_entitlement := round((v_effective_entitlement * v_remaining_days::numeric / v_total_days::numeric) * 2) / 2;
    end if;
  end if;

  return v_effective_entitlement;
end;
$$;

revoke all on function public.leave_prorate_annual_days(uuid, uuid, text, numeric) from public;

create or replace function public.leave_allowance_upsert(
  p_target_user_id uuid,
  p_leave_year text,
  p_annual_entitlement_days numeric,
  p_toil_balance_days numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_leave_year text;
  v_effective_entitlement numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from public.profiles t where t.id = p_target_user_id and t.org_id = v_org
  ) then
    raise exception 'target not in org';
  end if;

  v_leave_year := trim(coalesce(p_leave_year, ''));
  if v_leave_year = '' then
    raise exception 'leave_year required';
  end if;
  if v_leave_year !~ '^[0-9]{4}$' then
    raise exception 'leave_year must be YYYY';
  end if;

  v_effective_entitlement := public.leave_prorate_annual_days(
    v_org,
    p_target_user_id,
    v_leave_year,
    greatest(coalesce(p_annual_entitlement_days, 0), 0)
  );

  insert into public.leave_allowances (
    org_id, user_id, leave_year, annual_entitlement_days, toil_balance_days
  )
  values (
    v_org,
    p_target_user_id,
    v_leave_year,
    v_effective_entitlement,
    greatest(coalesce(p_toil_balance_days, 0), 0)
  )
  on conflict (org_id, user_id, leave_year) do update
  set
    annual_entitlement_days = excluded.annual_entitlement_days,
    toil_balance_days = greatest(coalesce(excluded.toil_balance_days, 0), 0),
    updated_at = now();
end;
$$;

drop function if exists public.org_leave_settings_upsert(integer, smallint, smallint, integer);
drop function if exists public.org_leave_settings_upsert(integer, smallint, smallint, integer, numeric);

create or replace function public.org_leave_settings_upsert(
  p_bradford_window_days integer,
  p_leave_year_start_month smallint,
  p_leave_year_start_day smallint,
  p_approved_request_change_window_hours integer default null,
  p_default_annual_entitlement_days numeric default null,
  p_clear_default_annual_entitlement boolean default false
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

  insert into public.org_leave_settings (
    org_id,
    bradford_window_days,
    leave_year_start_month,
    leave_year_start_day,
    approved_request_change_window_hours,
    default_annual_entitlement_days
  )
  values (
    v_org,
    coalesce(p_bradford_window_days, 365),
    coalesce(p_leave_year_start_month, 1),
    coalesce(p_leave_year_start_day, 1),
    coalesce(p_approved_request_change_window_hours, 48),
    v_default
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
    updated_at = now();
end;
$$;

-- Apply org default to all active members for a leave year. Preserves TOIL balances. Optional overwrite of existing annual rows.
create or replace function public.leave_allowance_bulk_apply_org_default(
  p_leave_year text,
  p_overwrite_existing boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_yk text;
  v_default numeric;
  v_member uuid;
  v_eff numeric;
  v_toil numeric;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  v_yk := trim(coalesce(p_leave_year, ''));
  if v_yk = '' or v_yk !~ '^[0-9]{4}$' then
    raise exception 'leave_year must be YYYY';
  end if;

  select ols.default_annual_entitlement_days
  into v_default
  from public.org_leave_settings ols
  where ols.org_id = v_org;

  if v_default is null then
    raise exception 'Set default annual entitlement in organisation leave settings first';
  end if;

  for v_member in
    select p.id
    from public.profiles p
    where p.org_id = v_org
      and p.status = 'active'
  loop
    if not coalesce(p_overwrite_existing, false) then
      if exists (
        select 1
        from public.leave_allowances la
        where la.org_id = v_org
          and la.user_id = v_member
          and la.leave_year = v_yk
      ) then
        continue;
      end if;
    end if;

    v_toil := 0;
    select coalesce(la.toil_balance_days, 0)
    into v_toil
    from public.leave_allowances la
    where la.org_id = v_org
      and la.user_id = v_member
      and la.leave_year = v_yk;

    v_eff := public.leave_prorate_annual_days(v_org, v_member, v_yk, v_default);

    insert into public.leave_allowances (
      org_id, user_id, leave_year, annual_entitlement_days, toil_balance_days
    )
    values (v_org, v_member, v_yk, v_eff, greatest(v_toil, 0))
    on conflict (org_id, user_id, leave_year) do update
    set
      annual_entitlement_days = excluded.annual_entitlement_days,
      toil_balance_days = leave_allowances.toil_balance_days,
      updated_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.leave_allowance_bulk_apply_org_default(text, boolean) to authenticated;

revoke all on function public.org_leave_settings_upsert(integer, smallint, smallint, integer, numeric, boolean) from public;
grant execute on function public.org_leave_settings_upsert(integer, smallint, smallint, integer, numeric, boolean) to authenticated;
