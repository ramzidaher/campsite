-- International leave law configuration profiles (beyond UK).

alter table public.org_leave_settings
  add column if not exists leave_law_country_code text not null default 'GB'
    check (leave_law_country_code ~ '^[A-Z]{2}$'),
  add column if not exists leave_law_profile text not null default 'uk'
    check (leave_law_profile in ('uk', 'eu_general', 'us_general', 'ca_general', 'au_general', 'custom'));

comment on column public.org_leave_settings.leave_law_country_code is
  'ISO country code used for leave-law defaults and policy context.';
comment on column public.org_leave_settings.leave_law_profile is
  'Leave law profile for non-UK policy baselines; custom keeps explicit org settings.';

drop function if exists public.org_leave_settings_upsert(
  integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[],
  boolean, numeric, numeric, numeric, boolean, smallint, numeric, boolean, boolean, numeric,
  boolean, boolean, numeric, boolean, text
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
  p_encashment_max_days numeric default null,
  p_leave_accrual_enabled boolean default null,
  p_leave_accrual_frequency text default null,
  p_leave_law_country_code text default null,
  p_leave_law_profile text default null
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
  v_accrual_frequency text;
  v_country text;
  v_profile text;
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
  v_accrual_frequency := coalesce(nullif(trim(coalesce(p_leave_accrual_frequency, '')), ''), 'monthly');
  if v_accrual_frequency not in ('monthly') then
    raise exception 'invalid leave accrual frequency';
  end if;

  v_country := upper(coalesce(nullif(trim(coalesce(p_leave_law_country_code, '')), ''), 'GB'));
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid leave law country code';
  end if;
  v_profile := coalesce(nullif(trim(coalesce(p_leave_law_profile, '')), ''), 'uk');
  if v_profile not in ('uk', 'eu_general', 'us_general', 'ca_general', 'au_general', 'custom') then
    raise exception 'invalid leave law profile';
  end if;

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
    encashment_max_days,
    leave_accrual_enabled,
    leave_accrual_frequency,
    leave_law_country_code,
    leave_law_profile
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
    coalesce(p_encashment_max_days, 0),
    coalesce(p_leave_accrual_enabled, false),
    v_accrual_frequency,
    v_country,
    v_profile
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
    leave_accrual_enabled = case
      when p_leave_accrual_enabled is null then public.org_leave_settings.leave_accrual_enabled
      else excluded.leave_accrual_enabled
    end,
    leave_accrual_frequency = case
      when p_leave_accrual_frequency is null then public.org_leave_settings.leave_accrual_frequency
      else excluded.leave_accrual_frequency
    end,
    leave_law_country_code = case
      when p_leave_law_country_code is null then public.org_leave_settings.leave_law_country_code
      else excluded.leave_law_country_code
    end,
    leave_law_profile = case
      when p_leave_law_profile is null then public.org_leave_settings.leave_law_profile
      else excluded.leave_law_profile
    end,
    updated_at = now();
end;
$$;

revoke all on function public.org_leave_settings_upsert(
  integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[],
  boolean, numeric, numeric, numeric, boolean, smallint, numeric, boolean, boolean, numeric,
  boolean, boolean, numeric, boolean, text, text, text
) from public;
grant execute on function public.org_leave_settings_upsert(
  integer, smallint, smallint, integer, numeric, boolean, boolean, smallint[],
  boolean, numeric, numeric, numeric, boolean, smallint, numeric, boolean, boolean, numeric,
  boolean, boolean, numeric, boolean, text, text, text
) to authenticated;
