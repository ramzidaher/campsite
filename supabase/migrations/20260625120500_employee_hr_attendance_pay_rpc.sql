-- Extends HR upsert + hr_employee_file with timesheet clock + hourly pay; patches SSP for voided sickness.

drop function if exists public.employee_hr_record_upsert(
  uuid, text, text, text, text, numeric, text, date, date, integer, uuid, text,
  text, text, text, numeric, integer, numeric, text, date, date, jsonb,
  date, date, date, text, date, text, text, text, text, text, text,
  text, text, text, text, text, date, date, text, text, text,
  text, numeric, numeric, boolean, numeric
);
drop function if exists public.employee_hr_record_upsert(
  uuid, text, text, text, text, numeric, text, date, date, integer, uuid, text,
  text, text, text, numeric, integer, numeric, text, date, date, jsonb,
  date, date, date, text, date, text, text, text, text, text, text,
  text, text, text, text, text, date, date, text, text, text,
  text, numeric, numeric
);

create or replace function public.employee_hr_record_upsert(
  p_user_id uuid,
  p_job_title text,
  p_grade_level text,
  p_contract_type text,
  p_salary_band text,
  p_fte numeric,
  p_work_location text,
  p_employment_start_date date,
  p_probation_end_date date,
  p_notice_period_weeks integer,
  p_hired_from_application_id uuid,
  p_notes text,
  p_position_type text,
  p_pay_grade text,
  p_employment_basis text,
  p_weekly_hours numeric,
  p_positions_count integer,
  p_budget_amount numeric,
  p_budget_currency text,
  p_department_start_date date,
  p_continuous_employment_start_date date,
  p_custom_fields jsonb,
  p_contract_start_date date,
  p_contract_end_date date,
  p_contract_signed_on date,
  p_contract_document_url text,
  p_contract_review_date date,
  p_home_address_line1 text,
  p_home_address_line2 text,
  p_home_city text,
  p_home_county text,
  p_home_postcode text,
  p_home_country text,
  p_emergency_contact_name text,
  p_emergency_contact_relationship text,
  p_emergency_contact_phone text,
  p_emergency_contact_email text,
  p_rtw_status text,
  p_rtw_checked_on date,
  p_rtw_expiry_date date,
  p_rtw_check_method text,
  p_rtw_document_url text,
  p_visa_type text,
  p_pay_frequency text,
  p_contracted_days_per_week numeric,
  p_average_weekly_earnings_gbp numeric,
  p_timesheet_clock_enabled boolean default false,
  p_hourly_pay_gbp numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_record_id uuid;
  v_existing public.employee_hr_records;
  v_cf jsonb;
  v_positions integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.manage_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from public.profiles t where t.id = p_user_id and t.org_id = v_org
  ) then
    raise exception 'target user not in org';
  end if;

  if p_contract_type not in ('full_time', 'part_time', 'contractor', 'zero_hours') then
    raise exception 'invalid contract_type';
  end if;

  if p_work_location not in ('office', 'remote', 'hybrid') then
    raise exception 'invalid work_location';
  end if;

  if p_fte is null or p_fte <= 0 or p_fte > 1 then
    raise exception 'fte must be > 0 and <= 1';
  end if;

  if coalesce(p_rtw_status, 'unknown') not in ('unknown', 'required', 'in_progress', 'verified', 'expired', 'not_required') then
    raise exception 'invalid rtw_status';
  end if;

  if lower(trim(coalesce(p_pay_frequency, 'monthly'))) not in ('weekly', 'monthly', 'four_weekly') then
    raise exception 'invalid pay_frequency';
  end if;

  if p_contracted_days_per_week is not null
     and (p_contracted_days_per_week <= 0 or p_contracted_days_per_week > 7) then
    raise exception 'contracted_days_per_week must be greater than 0 and at most 7';
  end if;

  if p_hourly_pay_gbp is not null and p_hourly_pay_gbp < 0 then
    raise exception 'hourly_pay_gbp must be null or >= 0';
  end if;

  v_cf := coalesce(p_custom_fields, '{}'::jsonb);
  if jsonb_typeof(v_cf) <> 'object' then
    raise exception 'custom_fields must be a JSON object';
  end if;

  v_positions := coalesce(p_positions_count, 1);
  if v_positions < 1 then
    raise exception 'positions_count must be at least 1';
  end if;

  if p_hired_from_application_id is not null then
    if not exists (
      select 1 from public.job_applications a where a.id = p_hired_from_application_id and a.org_id = v_org
    ) then
      raise exception 'application not in org';
    end if;
  end if;

  select * into v_existing
  from public.employee_hr_records
  where org_id = v_org and user_id = p_user_id;

  if v_existing.id is null then
    insert into public.employee_hr_records (
      org_id, user_id,
      job_title, grade_level, contract_type, salary_band,
      fte, work_location,
      employment_start_date, probation_end_date, notice_period_weeks,
      hired_from_application_id, notes,
      position_type, pay_grade, employment_basis, weekly_hours,
      positions_count, budget_amount, budget_currency,
      department_start_date, continuous_employment_start_date, custom_fields,
      contract_start_date, contract_end_date, contract_signed_on, contract_document_url, contract_review_date,
      home_address_line1, home_address_line2, home_city, home_county, home_postcode, home_country,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_email,
      rtw_status, rtw_checked_on, rtw_expiry_date, rtw_check_method, rtw_document_url, visa_type,
      pay_frequency, contracted_days_per_week, average_weekly_earnings_gbp,
      timesheet_clock_enabled, hourly_pay_gbp,
      created_by, updated_by
    ) values (
      v_org, p_user_id,
      coalesce(trim(p_job_title), ''), coalesce(trim(p_grade_level), ''),
      p_contract_type, coalesce(trim(p_salary_band), ''),
      p_fte, p_work_location,
      p_employment_start_date, p_probation_end_date, p_notice_period_weeks,
      p_hired_from_application_id, nullif(trim(coalesce(p_notes, '')), ''),
      coalesce(trim(coalesce(p_position_type, '')), ''),
      coalesce(trim(coalesce(p_pay_grade, '')), ''),
      coalesce(trim(coalesce(p_employment_basis, '')), ''),
      p_weekly_hours,
      v_positions,
      p_budget_amount,
      coalesce(trim(coalesce(p_budget_currency, '')), ''),
      p_department_start_date,
      p_continuous_employment_start_date,
      v_cf,
      p_contract_start_date, p_contract_end_date, p_contract_signed_on, coalesce(trim(coalesce(p_contract_document_url, '')), ''), p_contract_review_date,
      coalesce(trim(coalesce(p_home_address_line1, '')), ''),
      coalesce(trim(coalesce(p_home_address_line2, '')), ''),
      coalesce(trim(coalesce(p_home_city, '')), ''),
      coalesce(trim(coalesce(p_home_county, '')), ''),
      coalesce(trim(coalesce(p_home_postcode, '')), ''),
      coalesce(trim(coalesce(p_home_country, '')), ''),
      coalesce(trim(coalesce(p_emergency_contact_name, '')), ''),
      coalesce(trim(coalesce(p_emergency_contact_relationship, '')), ''),
      coalesce(trim(coalesce(p_emergency_contact_phone, '')), ''),
      coalesce(trim(coalesce(p_emergency_contact_email, '')), ''),
      coalesce(trim(coalesce(p_rtw_status, 'unknown')), 'unknown'),
      p_rtw_checked_on,
      p_rtw_expiry_date,
      coalesce(trim(coalesce(p_rtw_check_method, '')), ''),
      coalesce(trim(coalesce(p_rtw_document_url, '')), ''),
      coalesce(trim(coalesce(p_visa_type, '')), ''),
      lower(trim(coalesce(p_pay_frequency, 'monthly'))),
      p_contracted_days_per_week,
      p_average_weekly_earnings_gbp,
      coalesce(p_timesheet_clock_enabled, false),
      p_hourly_pay_gbp,
      v_uid, v_uid
    )
    returning id into v_record_id;

    insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
    values (v_org, v_record_id, v_uid, 'record', null, 'created');

  else
    v_record_id := v_existing.id;

    if v_existing.contract_start_date is distinct from p_contract_start_date then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'contract_start_date', v_existing.contract_start_date::text, p_contract_start_date::text);
    end if;
    if v_existing.contract_end_date is distinct from p_contract_end_date then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'contract_end_date', v_existing.contract_end_date::text, p_contract_end_date::text);
    end if;
    if v_existing.contract_signed_on is distinct from p_contract_signed_on then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'contract_signed_on', v_existing.contract_signed_on::text, p_contract_signed_on::text);
    end if;
    if coalesce(v_existing.contract_document_url, '') <> coalesce(trim(coalesce(p_contract_document_url, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'contract_document_url', v_existing.contract_document_url, trim(coalesce(p_contract_document_url, '')));
    end if;
    if v_existing.contract_review_date is distinct from p_contract_review_date then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'contract_review_date', v_existing.contract_review_date::text, p_contract_review_date::text);
    end if;
    if coalesce(v_existing.home_address_line1, '') <> coalesce(trim(coalesce(p_home_address_line1, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'home_address_line1', v_existing.home_address_line1, trim(coalesce(p_home_address_line1, '')));
    end if;
    if coalesce(v_existing.home_address_line2, '') <> coalesce(trim(coalesce(p_home_address_line2, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'home_address_line2', v_existing.home_address_line2, trim(coalesce(p_home_address_line2, '')));
    end if;
    if coalesce(v_existing.home_city, '') <> coalesce(trim(coalesce(p_home_city, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'home_city', v_existing.home_city, trim(coalesce(p_home_city, '')));
    end if;
    if coalesce(v_existing.home_county, '') <> coalesce(trim(coalesce(p_home_county, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'home_county', v_existing.home_county, trim(coalesce(p_home_county, '')));
    end if;
    if coalesce(v_existing.home_postcode, '') <> coalesce(trim(coalesce(p_home_postcode, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'home_postcode', v_existing.home_postcode, trim(coalesce(p_home_postcode, '')));
    end if;
    if coalesce(v_existing.home_country, '') <> coalesce(trim(coalesce(p_home_country, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'home_country', v_existing.home_country, trim(coalesce(p_home_country, '')));
    end if;
    if coalesce(v_existing.emergency_contact_name, '') <> coalesce(trim(coalesce(p_emergency_contact_name, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'emergency_contact_name', v_existing.emergency_contact_name, trim(coalesce(p_emergency_contact_name, '')));
    end if;
    if coalesce(v_existing.emergency_contact_relationship, '') <> coalesce(trim(coalesce(p_emergency_contact_relationship, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'emergency_contact_relationship', v_existing.emergency_contact_relationship, trim(coalesce(p_emergency_contact_relationship, '')));
    end if;
    if coalesce(v_existing.emergency_contact_phone, '') <> coalesce(trim(coalesce(p_emergency_contact_phone, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'emergency_contact_phone', v_existing.emergency_contact_phone, trim(coalesce(p_emergency_contact_phone, '')));
    end if;
    if coalesce(v_existing.emergency_contact_email, '') <> coalesce(trim(coalesce(p_emergency_contact_email, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'emergency_contact_email', v_existing.emergency_contact_email, trim(coalesce(p_emergency_contact_email, '')));
    end if;
    if coalesce(v_existing.rtw_status, 'unknown') <> coalesce(trim(coalesce(p_rtw_status, 'unknown')), 'unknown') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'rtw_status', v_existing.rtw_status, trim(coalesce(p_rtw_status, 'unknown')));
    end if;
    if v_existing.rtw_checked_on is distinct from p_rtw_checked_on then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'rtw_checked_on', v_existing.rtw_checked_on::text, p_rtw_checked_on::text);
    end if;
    if v_existing.rtw_expiry_date is distinct from p_rtw_expiry_date then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'rtw_expiry_date', v_existing.rtw_expiry_date::text, p_rtw_expiry_date::text);
    end if;
    if coalesce(v_existing.rtw_check_method, '') <> coalesce(trim(coalesce(p_rtw_check_method, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'rtw_check_method', v_existing.rtw_check_method, trim(coalesce(p_rtw_check_method, '')));
    end if;
    if coalesce(v_existing.rtw_document_url, '') <> coalesce(trim(coalesce(p_rtw_document_url, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'rtw_document_url', v_existing.rtw_document_url, trim(coalesce(p_rtw_document_url, '')));
    end if;
    if coalesce(v_existing.visa_type, '') <> coalesce(trim(coalesce(p_visa_type, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'visa_type', v_existing.visa_type, trim(coalesce(p_visa_type, '')));
    end if;
    if coalesce(v_existing.pay_frequency, 'monthly') <> lower(trim(coalesce(p_pay_frequency, 'monthly'))) then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'pay_frequency', v_existing.pay_frequency, lower(trim(coalesce(p_pay_frequency, 'monthly'))));
    end if;
    if v_existing.contracted_days_per_week is distinct from p_contracted_days_per_week then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'contracted_days_per_week', v_existing.contracted_days_per_week::text, p_contracted_days_per_week::text);
    end if;
    if v_existing.average_weekly_earnings_gbp is distinct from p_average_weekly_earnings_gbp then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'average_weekly_earnings_gbp', v_existing.average_weekly_earnings_gbp::text, p_average_weekly_earnings_gbp::text);
    end if;
    if coalesce(v_existing.timesheet_clock_enabled, false) <> coalesce(p_timesheet_clock_enabled, false) then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'timesheet_clock_enabled', v_existing.timesheet_clock_enabled::text, coalesce(p_timesheet_clock_enabled, false)::text);
    end if;
    if v_existing.hourly_pay_gbp is distinct from p_hourly_pay_gbp then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'hourly_pay_gbp', v_existing.hourly_pay_gbp::text, p_hourly_pay_gbp::text);
    end if;

    update public.employee_hr_records set
      job_title = coalesce(trim(p_job_title), ''),
      grade_level = coalesce(trim(p_grade_level), ''),
      contract_type = p_contract_type,
      salary_band = coalesce(trim(p_salary_band), ''),
      fte = p_fte,
      work_location = p_work_location,
      employment_start_date = p_employment_start_date,
      probation_end_date = p_probation_end_date,
      notice_period_weeks = p_notice_period_weeks,
      hired_from_application_id = p_hired_from_application_id,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      position_type = coalesce(trim(coalesce(p_position_type, '')), ''),
      pay_grade = coalesce(trim(coalesce(p_pay_grade, '')), ''),
      employment_basis = coalesce(trim(coalesce(p_employment_basis, '')), ''),
      weekly_hours = p_weekly_hours,
      positions_count = v_positions,
      budget_amount = p_budget_amount,
      budget_currency = coalesce(trim(coalesce(p_budget_currency, '')), ''),
      department_start_date = p_department_start_date,
      continuous_employment_start_date = p_continuous_employment_start_date,
      custom_fields = v_cf,
      contract_start_date = p_contract_start_date,
      contract_end_date = p_contract_end_date,
      contract_signed_on = p_contract_signed_on,
      contract_document_url = coalesce(trim(coalesce(p_contract_document_url, '')), ''),
      contract_review_date = p_contract_review_date,
      home_address_line1 = coalesce(trim(coalesce(p_home_address_line1, '')), ''),
      home_address_line2 = coalesce(trim(coalesce(p_home_address_line2, '')), ''),
      home_city = coalesce(trim(coalesce(p_home_city, '')), ''),
      home_county = coalesce(trim(coalesce(p_home_county, '')), ''),
      home_postcode = coalesce(trim(coalesce(p_home_postcode, '')), ''),
      home_country = coalesce(trim(coalesce(p_home_country, '')), ''),
      emergency_contact_name = coalesce(trim(coalesce(p_emergency_contact_name, '')), ''),
      emergency_contact_relationship = coalesce(trim(coalesce(p_emergency_contact_relationship, '')), ''),
      emergency_contact_phone = coalesce(trim(coalesce(p_emergency_contact_phone, '')), ''),
      emergency_contact_email = coalesce(trim(coalesce(p_emergency_contact_email, '')), ''),
      rtw_status = coalesce(trim(coalesce(p_rtw_status, 'unknown')), 'unknown'),
      rtw_checked_on = p_rtw_checked_on,
      rtw_expiry_date = p_rtw_expiry_date,
      rtw_check_method = coalesce(trim(coalesce(p_rtw_check_method, '')), ''),
      rtw_document_url = coalesce(trim(coalesce(p_rtw_document_url, '')), ''),
      visa_type = coalesce(trim(coalesce(p_visa_type, '')), ''),
      pay_frequency = lower(trim(coalesce(p_pay_frequency, 'monthly'))),
      contracted_days_per_week = p_contracted_days_per_week,
      average_weekly_earnings_gbp = p_average_weekly_earnings_gbp,
      timesheet_clock_enabled = coalesce(p_timesheet_clock_enabled, false),
      hourly_pay_gbp = p_hourly_pay_gbp,
      updated_by = v_uid
    where id = v_record_id;
  end if;

  return v_record_id;
end;
$$;

grant execute on function public.employee_hr_record_upsert(
  uuid, text, text, text, text, numeric, text, date, date, integer, uuid, text,
  text, text, text, numeric, integer, numeric, text, date, date, jsonb,
  date, date, date, text, date, text, text, text, text, text, text,
  text, text, text, text, text, date, date, text, text, text,
  text, numeric, numeric, boolean, numeric
) to authenticated;


-- hr_employee_file: pay fields

drop function if exists public.hr_employee_file(uuid);
create or replace function public.hr_employee_file(p_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  status text,
  avatar_url text,
  role text,
  reports_to_user_id uuid,
  reports_to_name text,
  department_names text[],
  hr_record_id uuid,
  job_title text,
  grade_level text,
  contract_type text,
  salary_band text,
  fte numeric,
  work_location text,
  employment_start_date date,
  probation_end_date date,
  notice_period_weeks integer,
  hired_from_application_id uuid,
  notes text,
  record_created_at timestamptz,
  record_updated_at timestamptz,
  position_type text,
  pay_grade text,
  employment_basis text,
  weekly_hours numeric,
  positions_count integer,
  budget_amount numeric,
  budget_currency text,
  department_start_date date,
  continuous_employment_start_date date,
  custom_fields jsonb,
  length_of_service_years integer,
  length_of_service_months integer,
  contract_start_date date,
  contract_end_date date,
  contract_signed_on date,
  contract_document_url text,
  contract_review_date date,
  home_address_line1 text,
  home_address_line2 text,
  home_city text,
  home_county text,
  home_postcode text,
  home_country text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  emergency_contact_email text,
  rtw_status text,
  rtw_checked_on date,
  rtw_expiry_date date,
  rtw_check_method text,
  rtw_document_url text,
  visa_type text,
  pay_frequency text,
  contracted_days_per_week numeric,
  average_weekly_earnings_gbp numeric,
  timesheet_clock_enabled boolean,
  hourly_pay_gbp numeric,
  probation_check_completed_at timestamptz,
  probation_check_completed_by uuid
)
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

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null then raise exception 'not authenticated'; end if;

  if public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    null;
  elsif public.has_permission(v_uid, v_org, 'hr.view_direct_reports', '{}'::jsonb)
    and exists (
      select 1 from public.profiles t
       where t.id = p_user_id
         and t.reports_to_user_id = v_uid
         and t.org_id = v_org
    )
  then
    null;
  elsif p_user_id = v_uid
    and public.has_permission(v_uid, v_org, 'hr.view_own', '{}'::jsonb)
  then
    null;
  else
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1 from public.profiles t where t.id = p_user_id and t.org_id = v_org
  ) then
    raise exception 'employee not found';
  end if;

  return query
  select
    p.id                         as user_id,
    p.full_name::text,
    p.email::text,
    p.status::text,
    p.avatar_url::text,
    p.role::text,
    p.reports_to_user_id,
    m.full_name::text            as reports_to_name,
    coalesce(array_agg(d.name order by d.name) filter (where d.name is not null), '{}'::text[]) as department_names,
    r.id                         as hr_record_id,
    r.job_title::text,
    r.grade_level::text,
    r.contract_type::text,
    r.salary_band::text,
    r.fte,
    r.work_location::text,
    r.employment_start_date,
    r.probation_end_date,
    r.notice_period_weeks,
    r.hired_from_application_id,
    r.notes::text,
    r.created_at                 as record_created_at,
    r.updated_at                 as record_updated_at,
    r.position_type::text,
    r.pay_grade::text,
    r.employment_basis::text,
    r.weekly_hours,
    r.positions_count,
    r.budget_amount,
    r.budget_currency::text,
    r.department_start_date,
    r.continuous_employment_start_date,
    r.custom_fields,
    case when r.employment_start_date is not null then extract(year from age(current_date, r.employment_start_date))::integer else null end as length_of_service_years,
    case when r.employment_start_date is not null then extract(month from age(current_date, r.employment_start_date))::integer else null end as length_of_service_months,
    r.contract_start_date,
    r.contract_end_date,
    r.contract_signed_on,
    r.contract_document_url::text,
    r.contract_review_date,
    r.home_address_line1::text,
    r.home_address_line2::text,
    r.home_city::text,
    r.home_county::text,
    r.home_postcode::text,
    r.home_country::text,
    r.emergency_contact_name::text,
    r.emergency_contact_relationship::text,
    r.emergency_contact_phone::text,
    r.emergency_contact_email::text,
    r.rtw_status::text,
    r.rtw_checked_on,
    r.rtw_expiry_date,
    r.rtw_check_method::text,
    r.rtw_document_url::text,
    r.visa_type::text,
    r.pay_frequency::text,
    r.contracted_days_per_week,
    r.average_weekly_earnings_gbp,
    r.timesheet_clock_enabled,
    r.hourly_pay_gbp,
    r.probation_check_completed_at,
    r.probation_check_completed_by
  from public.profiles p
  left join public.profiles m on m.id = p.reports_to_user_id
  left join public.user_departments ud on ud.user_id = p.id
  left join public.departments d on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r on r.user_id = p.id and r.org_id = v_org
  where p.id = p_user_id
    and p.org_id = v_org
  group by
    p.id, p.full_name, p.email, p.status, p.avatar_url, p.role,
    p.reports_to_user_id, m.full_name,
    r.id, r.job_title, r.grade_level, r.contract_type, r.salary_band,
    r.fte, r.work_location, r.employment_start_date, r.probation_end_date,
    r.notice_period_weeks, r.hired_from_application_id, r.notes,
    r.created_at, r.updated_at, r.position_type, r.pay_grade, r.employment_basis,
    r.weekly_hours, r.positions_count, r.budget_amount, r.budget_currency,
    r.department_start_date, r.continuous_employment_start_date, r.custom_fields,
    r.contract_start_date, r.contract_end_date, r.contract_signed_on, r.contract_document_url, r.contract_review_date,
    r.home_address_line1, r.home_address_line2, r.home_city, r.home_county, r.home_postcode, r.home_country,
    r.emergency_contact_name, r.emergency_contact_relationship, r.emergency_contact_phone, r.emergency_contact_email,
    r.rtw_status, r.rtw_checked_on, r.rtw_expiry_date, r.rtw_check_method, r.rtw_document_url, r.visa_type,
    r.pay_frequency, r.contracted_days_per_week, r.average_weekly_earnings_gbp,
    r.timesheet_clock_enabled, r.hourly_pay_gbp,
    r.probation_check_completed_at, r.probation_check_completed_by;
end;
$$;

grant execute on function public.hr_employee_file(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- SSP: ignore voided sickness episodes
-- ---------------------------------------------------------------------------

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
    notes := array_append(notes, 'Average weekly earnings below Lower Earnings Limit — SSP not payable (legacy rule).');
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

  last_s := null;
  for rec in
    select start_date, end_date
    from public.sickness_absences
    where org_id = v_org
      and user_id = p_user_id
      and voided_at is null
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
