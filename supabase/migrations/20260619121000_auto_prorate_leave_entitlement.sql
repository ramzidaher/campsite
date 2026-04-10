-- Auto pro-rate annual leave entitlement using employment start date
-- and organisation leave year boundaries.

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

  v_year_start_num := v_leave_year::integer;

  select
    coalesce(ols.leave_year_start_month, 1),
    coalesce(ols.leave_year_start_day, 1)
  into v_start_month, v_start_day
  from public.org_leave_settings ols
  where ols.org_id = v_org;

  v_year_start := make_date(v_year_start_num, v_start_month, v_start_day);
  v_year_end := (v_year_start + interval '1 year' - interval '1 day')::date;

  select ehr.employment_start_date
  into v_start_date
  from public.employee_hr_records ehr
  where ehr.org_id = v_org
    and ehr.user_id = p_target_user_id;

  v_effective_entitlement := greatest(coalesce(p_annual_entitlement_days, 0), 0);

  if v_start_date is not null then
    if v_start_date > v_year_end then
      v_effective_entitlement := 0;
    elsif v_start_date > v_year_start then
      v_total_days := (v_year_end - v_year_start) + 1;
      v_remaining_days := (v_year_end - v_start_date) + 1;
      v_effective_entitlement := round((v_effective_entitlement * v_remaining_days::numeric / v_total_days::numeric) * 2) / 2;
    end if;
  end if;

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
