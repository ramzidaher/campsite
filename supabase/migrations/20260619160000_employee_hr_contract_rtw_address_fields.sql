-- Add contract, home address, RTW and emergency contact fields to employee HR records.

alter table public.employee_hr_records
  add column if not exists contract_start_date date,
  add column if not exists contract_end_date date,
  add column if not exists contract_signed_on date,
  add column if not exists contract_document_url text not null default '',
  add column if not exists contract_review_date date,
  add column if not exists home_address_line1 text not null default '',
  add column if not exists home_address_line2 text not null default '',
  add column if not exists home_city text not null default '',
  add column if not exists home_county text not null default '',
  add column if not exists home_postcode text not null default '',
  add column if not exists home_country text not null default '',
  add column if not exists emergency_contact_name text not null default '',
  add column if not exists emergency_contact_relationship text not null default '',
  add column if not exists emergency_contact_phone text not null default '',
  add column if not exists emergency_contact_email text not null default '',
  add column if not exists rtw_status text not null default 'unknown'
    check (rtw_status in ('unknown', 'required', 'in_progress', 'verified', 'expired', 'not_required')),
  add column if not exists rtw_checked_on date,
  add column if not exists rtw_expiry_date date,
  add column if not exists rtw_check_method text not null default '',
  add column if not exists rtw_document_url text not null default '',
  add column if not exists visa_type text not null default '';

comment on column public.employee_hr_records.contract_document_url is
  'Link to signed contract document (storage or external URL).';
comment on column public.employee_hr_records.rtw_status is
  'Right-to-work check lifecycle status.';

drop function if exists public.employee_hr_record_upsert(
  uuid, text, text, text, text, numeric, text, date, date, integer, uuid, text,
  text, text, text, numeric, integer, numeric, text, date, date, jsonb
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
  p_visa_type text
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
  text, text, text, text, text, date, date, text, text, text
) to authenticated;

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
  visa_type text
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
    r.visa_type::text
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
    r.rtw_status, r.rtw_checked_on, r.rtw_expiry_date, r.rtw_check_method, r.rtw_document_url, r.visa_type;
end;
$$;

drop function if exists public.hr_directory_list();
create or replace function public.hr_directory_list()
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
  rtw_status text,
  rtw_expiry_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_org         uuid;
  v_full_access boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null then raise exception 'not authenticated'; end if;

  v_full_access := public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb);

  if not v_full_access and not public.has_permission(v_uid, v_org, 'hr.view_direct_reports', '{}'::jsonb) then
    raise exception 'not allowed';
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
    r.rtw_status::text,
    r.rtw_expiry_date
  from public.profiles p
  left join public.profiles m on m.id = p.reports_to_user_id
  left join public.user_departments ud on ud.user_id = p.id
  left join public.departments d on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r on r.user_id = p.id and r.org_id = v_org
  where p.org_id = v_org
    and p.status = 'active'
    and (v_full_access or p.reports_to_user_id = v_uid)
  group by
    p.id, p.full_name, p.email, p.status, p.avatar_url, p.role,
    p.reports_to_user_id, m.full_name,
    r.id, r.job_title, r.grade_level, r.contract_type, r.salary_band,
    r.fte, r.work_location, r.employment_start_date, r.probation_end_date,
    r.notice_period_weeks, r.position_type, r.pay_grade, r.employment_basis,
    r.weekly_hours, r.positions_count, r.budget_amount, r.budget_currency,
    r.department_start_date, r.continuous_employment_start_date, r.custom_fields,
    r.contract_start_date, r.contract_end_date, r.rtw_status, r.rtw_expiry_date
  order by p.full_name;
end;
$$;
