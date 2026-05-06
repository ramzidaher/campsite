-- UK weekly-paid annual leave (statutory weeks × contracted days) + Statutory Sick Pay (SSP) tracking.
-- SSP defaults follow April 2026 reform (day-one pay, LEL optional, min(flat, 80% AWE)).

-- ---------------------------------------------------------------------------
-- 1. HR + org columns
-- ---------------------------------------------------------------------------

alter table public.employee_hr_records
  add column if not exists pay_frequency text not null default 'monthly'
    check (pay_frequency in ('weekly', 'monthly', 'four_weekly')),
  add column if not exists contracted_days_per_week numeric(5, 2)
    check (contracted_days_per_week is null or (contracted_days_per_week > 0 and contracted_days_per_week <= 7)),
  add column if not exists average_weekly_earnings_gbp numeric(14, 4)
    check (average_weekly_earnings_gbp is null or average_weekly_earnings_gbp >= 0);

comment on column public.employee_hr_records.pay_frequency is
  'Pay schedule; weekly is used with UK statutory annual leave formula when enabled for the org.';
comment on column public.employee_hr_records.contracted_days_per_week is
  'Working days per week (e.g. 5 full-time, 3 part-time) for statutory annual leave: weeks × days.';
comment on column public.employee_hr_records.average_weekly_earnings_gbp is
  'Average weekly earnings (AWE) for SSP  typically 8-week reference per HMRC.';

alter table public.org_leave_settings
  add column if not exists use_uk_weekly_paid_leave_formula boolean not null default false,
  add column if not exists statutory_weeks_annual_leave numeric(6, 2) not null default 5.6
    check (statutory_weeks_annual_leave > 0 and statutory_weeks_annual_leave <= 10),
  add column if not exists ssp_flat_weekly_rate_gbp numeric(10, 2) not null default 123.25
    check (ssp_flat_weekly_rate_gbp >= 0),
  add column if not exists ssp_lel_weekly_gbp numeric(10, 2)
    check (ssp_lel_weekly_gbp is null or ssp_lel_weekly_gbp >= 0),
  add column if not exists ssp_waiting_qualifying_days smallint not null default 0
    check (ssp_waiting_qualifying_days >= 0 and ssp_waiting_qualifying_days <= 7),
  add column if not exists ssp_reform_percent_of_earnings numeric(5, 4) not null default 0.8
    check (ssp_reform_percent_of_earnings > 0 and ssp_reform_percent_of_earnings <= 1);

comment on column public.org_leave_settings.use_uk_weekly_paid_leave_formula is
  'When true, weekly-paid staff with contracted_days_per_week get statutory_weeks × days full-year leave before pro-rating.';
comment on column public.org_leave_settings.ssp_waiting_qualifying_days is
  '0 = April 2026 reform (no waiting days); 3 = legacy pre-2026 first qualifying days unpaid.';

-- ---------------------------------------------------------------------------
-- 2. Weekly-paid full-year entitlement inside pro-rata
-- ---------------------------------------------------------------------------

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
  v_use_weekly boolean;
  v_stat_weeks numeric;
  v_pf text;
  v_dpw numeric;
begin
  v_leave_year := trim(coalesce(p_leave_year, ''));
  if v_leave_year = '' or v_leave_year !~ '^[0-9]{4}$' then
    return 0;
  end if;

  v_year_start_num := v_leave_year::integer;

  select
    coalesce(ols.leave_year_start_month, 1),
    coalesce(ols.leave_year_start_day, 1),
    coalesce(ols.use_uk_weekly_paid_leave_formula, false),
    coalesce(ols.statutory_weeks_annual_leave, 5.6)
  into v_start_month, v_start_day, v_use_weekly, v_stat_weeks
  from public.org_leave_settings ols
  where ols.org_id = p_org_id;

  if not found then
    v_start_month := 1;
    v_start_day := 1;
    v_use_weekly := false;
    v_stat_weeks := 5.6;
  end if;

  v_year_start := make_date(v_year_start_num, v_start_month, v_start_day);
  v_year_end := (v_year_start + interval '1 year' - interval '1 day')::date;

  select ehr.employment_start_date, ehr.pay_frequency::text, ehr.contracted_days_per_week
  into v_start_date, v_pf, v_dpw
  from public.employee_hr_records ehr
  where ehr.org_id = p_org_id
    and ehr.user_id = p_user_id;

  if v_use_weekly and v_pf = 'weekly' and v_dpw is not null then
    v_effective_entitlement := round((v_stat_weeks * v_dpw)::numeric * 2) / 2;
  else
    v_effective_entitlement := greatest(coalesce(p_full_year_entitlement_days, 0), 0);
  end if;

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

revoke all on function public.leave_prorate_annual_days(uuid, uuid, text, numeric) from public;

-- ---------------------------------------------------------------------------
-- 3. Org leave settings upsert  extend with SSP + weekly leave flags
-- ---------------------------------------------------------------------------

drop function if exists public.org_leave_settings_upsert(integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[]);

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
  p_ssp_reform_percent_of_earnings numeric default null
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
    ssp_reform_percent_of_earnings
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
    coalesce(p_ssp_reform_percent_of_earnings, 0.8)
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
    updated_at = now();
end;
$$;

revoke all on function public.org_leave_settings_upsert(
  integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[],
  boolean, numeric, numeric, numeric, boolean, smallint, numeric
) from public;
grant execute on function public.org_leave_settings_upsert(
  integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[],
  boolean, numeric, numeric, numeric, boolean, smallint, numeric
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. SSP helpers + summary RPC
-- ---------------------------------------------------------------------------

create or replace function public._ssp_is_qualifying_day(p_date date, p_non_working smallint[])
returns boolean
language sql
stable
as $$
  select not (extract(isodow from p_date)::smallint = any (coalesce(p_non_working, array[6, 7]::smallint[])));
$$;

create or replace function public._ssp_qualifying_days_per_week(p_non_working smallint[])
returns integer
language plpgsql
immutable
as $$
declare
  i int;
  n int := 0;
  v_off smallint[] := coalesce(p_non_working, array[6, 7]::smallint[]);
begin
  for i in 1..7 loop
    if not (i::smallint = any (v_off)) then
      n := n + 1;
    end if;
  end loop;
  return greatest(n, 1);
end;
$$;

revoke all on function public._ssp_is_qualifying_day(date, smallint[]) from public;
revoke all on function public._ssp_qualifying_days_per_week(smallint[]) from public;

create or replace function public.ssp_calculation_summary(
  p_user_id uuid,
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org uuid;
  v_from date;
  v_to date;
  v_off smallint[];
  v_flat numeric;
  v_lel numeric;
  v_wait smallint;
  v_pct numeric;
  v_awe numeric;
  v_pf text;
  v_qd_per_week int;
  v_weekly_ssp numeric;
  v_daily numeric;
  v_ineligible_lel boolean := false;
  rec record;
  last_s date;
  last_e date;
  merged_s date[] := '{}';
  merged_e date[] := '{}';
  i int;
  n_piws int := 0;
  piw_s date[] := '{}';
  piw_e date[] := '{}';
  cal_span int;
  grp_ids int[];
  current_g int := 1;
  v_max_g int;
  g int;
  piw_idx int;
  d date;
  wait_left int;
  paid_cap int;
  paid_so_far int := 0;
  grp_amt numeric;
  total_amt numeric := 0;
  piw_obj jsonb;
  grps jsonb := '[]'::jsonb;
  notes text[] := '{}';
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = p_user_id;
  if v_org is null or v_org <> public.current_org_id() then
    raise exception 'not allowed';
  end if;

  if not (
    p_user_id = v_viewer
    or public.has_permission(v_viewer, v_org, 'leave.manage_org', '{}'::jsonb)
    or (
      public.has_permission(v_viewer, v_org, 'leave.view_direct_reports', '{}'::jsonb)
      and exists (
        select 1 from public.profiles s
        where s.id = p_user_id and s.reports_to_user_id = v_viewer
      )
    )
  ) then
    raise exception 'not allowed';
  end if;

  v_to := coalesce(p_to, current_date);
  v_from := coalesce(p_from, v_to - interval '730 days');

  select
    coalesce(ols.non_working_iso_dows, array[6, 7]::smallint[]),
    coalesce(ols.ssp_flat_weekly_rate_gbp, 123.25),
    ols.ssp_lel_weekly_gbp,
    coalesce(ols.ssp_waiting_qualifying_days, 0)::smallint,
    coalesce(ols.ssp_reform_percent_of_earnings, 0.8)
  into v_off, v_flat, v_lel, v_wait, v_pct
  from public.org_leave_settings ols
  where ols.org_id = v_org;

  if not found then
    v_off := array[6, 7]::smallint[];
    v_flat := 123.25;
    v_lel := null;
    v_wait := 0;
    v_pct := 0.8;
  end if;

  select ehr.average_weekly_earnings_gbp, ehr.pay_frequency::text
  into v_awe, v_pf
  from public.employee_hr_records ehr
  where ehr.org_id = v_org and ehr.user_id = p_user_id;

  v_qd_per_week := public._ssp_qualifying_days_per_week(v_off);

  if v_lel is not null and v_awe is not null and v_awe < v_lel then
    v_ineligible_lel := true;
    notes := array_append(notes, 'Average weekly earnings below Lower Earnings Limit  SSP not payable (legacy rule).');
  end if;

  if not v_ineligible_lel then
    if v_awe is null then
      v_weekly_ssp := v_flat;
      notes := array_append(notes, 'AWE not set on HR record; using statutory flat weekly rate only.');
    else
      v_weekly_ssp := least(v_flat, v_pct * v_awe);
    end if;
    v_daily := round((v_weekly_ssp / v_qd_per_week::numeric)::numeric, 4);
  else
    v_weekly_ssp := 0;
    v_daily := 0;
  end if;

  -- Merge absence intervals (overlap or consecutive calendar days)
  last_s := null;
  for rec in
    select start_date, end_date
    from public.sickness_absences
    where org_id = v_org
      and user_id = p_user_id
      and end_date >= v_from
      and start_date <= v_to
    order by start_date, end_date
  loop
    if last_s is null then
      last_s := rec.start_date;
      last_e := rec.end_date;
    elsif rec.start_date <= last_e + 1 then
      if rec.end_date > last_e then
        last_e := rec.end_date;
      end if;
    else
      merged_s := array_append(merged_s, last_s);
      merged_e := array_append(merged_e, last_e);
      last_s := rec.start_date;
      last_e := rec.end_date;
    end if;
  end loop;
  if last_s is not null then
    merged_s := array_append(merged_s, last_s);
    merged_e := array_append(merged_e, last_e);
  end if;

  -- PIW = merged interval with 4+ calendar days
  for i in 1..coalesce(array_length(merged_s, 1), 0)
  loop
    cal_span := (merged_e[i] - merged_s[i] + 1);
    if cal_span >= 4 then
      n_piws := n_piws + 1;
      piw_s := array_append(piw_s, merged_s[i]);
      piw_e := array_append(piw_e, merged_e[i]);
    end if;
  end loop;

  if n_piws = 0 then
    return jsonb_build_object(
      'scheme', case when v_wait > 0 then 'legacy_waiting_days' else 'uk_2026_reform' end,
      'qualifying_days_per_week', v_qd_per_week,
      'average_weekly_earnings_gbp', v_awe,
      'pay_frequency', v_pf,
      'ssp_flat_weekly_rate_gbp', v_flat,
      'ssp_weekly_payable_gbp', v_weekly_ssp,
      'ssp_daily_rate_gbp', v_daily,
      'ineligible_below_lel', v_ineligible_lel,
      'linked_groups', '[]'::jsonb,
      'total_ssp_gbp', 0,
      'notes', to_jsonb(notes)
    );
  end if;

  -- Link PIWs: gap between previous end and next start > 56 days => new group
  grp_ids := array_fill(1, ARRAY[n_piws]);
  for i in 2..n_piws
  loop
    if piw_s[i] - piw_e[i - 1] > 56 then
      current_g := current_g + 1;
    end if;
    grp_ids[i] := current_g;
  end loop;

  select coalesce(max(x), 1) into v_max_g from unnest(grp_ids) as t(x);

  for g in 1..v_max_g
  loop
    grp_amt := 0;
    wait_left := coalesce(v_wait, 0);
    paid_cap := 28 * v_qd_per_week;
    paid_so_far := 0;
    piw_obj := '[]'::jsonb;

    for piw_idx in 1..n_piws
    loop
      if grp_ids[piw_idx] <> g then
        continue;
      end if;

      d := piw_s[piw_idx];
      while d <= piw_e[piw_idx]
      loop
        if public._ssp_is_qualifying_day(d, v_off) then
          if not v_ineligible_lel then
            if wait_left > 0 then
              wait_left := wait_left - 1;
            elsif paid_so_far < paid_cap then
              paid_so_far := paid_so_far + 1;
              grp_amt := grp_amt + coalesce(v_daily, 0);
            end if;
          end if;
        end if;
        d := d + 1;
      end loop;

      piw_obj := piw_obj || jsonb_build_array(
        jsonb_build_object(
          'start', piw_s[piw_idx],
          'end', piw_e[piw_idx],
          'calendar_days', (piw_e[piw_idx] - piw_s[piw_idx] + 1)
        )
      );
    end loop;

    grps := grps || jsonb_build_array(
      jsonb_build_object(
        'group_index', g,
        'piws', piw_obj,
        'payable_qualifying_days_capped', paid_so_far,
        'ssp_amount_gbp', round(grp_amt::numeric, 2)
      )
    );

    total_amt := total_amt + round(grp_amt::numeric, 2);
  end loop;

  return jsonb_build_object(
    'scheme', case when v_wait > 0 then 'legacy_waiting_days' else 'uk_2026_reform' end,
    'qualifying_days_per_week', v_qd_per_week,
    'average_weekly_earnings_gbp', v_awe,
    'pay_frequency', v_pf,
    'ssp_flat_weekly_rate_gbp', v_flat,
    'ssp_weekly_payable_gbp', v_weekly_ssp,
    'ssp_daily_rate_gbp', v_daily,
    'ineligible_below_lel', v_ineligible_lel,
    'linked_groups', grps,
    'total_ssp_gbp', round(total_amt::numeric, 2),
    'notes', to_jsonb(notes)
  );
end;
$$;

revoke all on function public.ssp_calculation_summary(uuid, date, date) from public;
grant execute on function public.ssp_calculation_summary(uuid, date, date) to authenticated;
