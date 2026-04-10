-- Extended workforce / HR record fields (parity with common HR spreadsheets) plus
-- custom_fields JSON for org-specific labels without more migrations.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.employee_hr_records
  add column if not exists position_type text not null default '',
  add column if not exists pay_grade text not null default '',
  add column if not exists employment_basis text not null default '',
  add column if not exists weekly_hours numeric(5, 2)
    check (weekly_hours is null or (weekly_hours > 0 and weekly_hours <= 168)),
  add column if not exists positions_count integer not null default 1
    check (positions_count >= 1),
  add column if not exists budget_amount numeric(14, 2)
    check (budget_amount is null or budget_amount >= 0),
  add column if not exists budget_currency text not null default '',
  add column if not exists department_start_date date,
  add column if not exists continuous_employment_start_date date,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

comment on column public.employee_hr_records.position_type is
  'e.g. permanent, secondment, casual — free text for local HR vocabulary.';
comment on column public.employee_hr_records.pay_grade is
  'Pay / spinal point grade (e.g. after pay junction), distinct from grade_level if needed.';
comment on column public.employee_hr_records.employment_basis is
  'Basis of employment label (e.g. permanent, fixed-term).';
comment on column public.employee_hr_records.custom_fields is
  'Arbitrary string key/value pairs for fields not in the core schema.';

-- ---------------------------------------------------------------------------
-- 2. Upsert RPC (replaces previous 12-arg version)
-- ---------------------------------------------------------------------------

drop function if exists public.employee_hr_record_upsert(
  uuid, text, text, text, text, numeric, text, date, date, integer, uuid, text
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
  p_custom_fields jsonb
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
      v_uid, v_uid
    )
    returning id into v_record_id;

    insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
    values (v_org, v_record_id, v_uid, 'record', null, 'created');

  else
    v_record_id := v_existing.id;

    if coalesce(v_existing.job_title, '') <> coalesce(trim(p_job_title), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'job_title', v_existing.job_title, trim(p_job_title));
    end if;
    if coalesce(v_existing.grade_level, '') <> coalesce(trim(p_grade_level), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'grade_level', v_existing.grade_level, trim(p_grade_level));
    end if;
    if v_existing.contract_type <> p_contract_type then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'contract_type', v_existing.contract_type, p_contract_type);
    end if;
    if coalesce(v_existing.salary_band, '') <> coalesce(trim(p_salary_band), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'salary_band', v_existing.salary_band, trim(p_salary_band));
    end if;
    if v_existing.fte is distinct from p_fte then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'fte', v_existing.fte::text, p_fte::text);
    end if;
    if v_existing.work_location <> p_work_location then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'work_location', v_existing.work_location, p_work_location);
    end if;
    if v_existing.employment_start_date is distinct from p_employment_start_date then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'employment_start_date', v_existing.employment_start_date::text, p_employment_start_date::text);
    end if;
    if v_existing.probation_end_date is distinct from p_probation_end_date then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'probation_end_date', v_existing.probation_end_date::text, p_probation_end_date::text);
    end if;
    if v_existing.notice_period_weeks is distinct from p_notice_period_weeks then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'notice_period_weeks', v_existing.notice_period_weeks::text, p_notice_period_weeks::text);
    end if;
    if v_existing.hired_from_application_id is distinct from p_hired_from_application_id then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'hired_from_application_id', v_existing.hired_from_application_id::text, p_hired_from_application_id::text);
    end if;
    if coalesce(v_existing.notes, '') <> coalesce(nullif(trim(coalesce(p_notes, '')), ''), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'notes', v_existing.notes, nullif(trim(coalesce(p_notes, '')), ''));
    end if;

    if coalesce(v_existing.position_type, '') <> coalesce(trim(coalesce(p_position_type, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'position_type', v_existing.position_type, trim(coalesce(p_position_type, '')));
    end if;
    if coalesce(v_existing.pay_grade, '') <> coalesce(trim(coalesce(p_pay_grade, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'pay_grade', v_existing.pay_grade, trim(coalesce(p_pay_grade, '')));
    end if;
    if coalesce(v_existing.employment_basis, '') <> coalesce(trim(coalesce(p_employment_basis, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'employment_basis', v_existing.employment_basis, trim(coalesce(p_employment_basis, '')));
    end if;
    if v_existing.weekly_hours is distinct from p_weekly_hours then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'weekly_hours', v_existing.weekly_hours::text, p_weekly_hours::text);
    end if;
    if v_existing.positions_count is distinct from v_positions then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'positions_count', v_existing.positions_count::text, v_positions::text);
    end if;
    if v_existing.budget_amount is distinct from p_budget_amount then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'budget_amount', v_existing.budget_amount::text, p_budget_amount::text);
    end if;
    if coalesce(v_existing.budget_currency, '') <> coalesce(trim(coalesce(p_budget_currency, '')), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'budget_currency', v_existing.budget_currency, trim(coalesce(p_budget_currency, '')));
    end if;
    if v_existing.department_start_date is distinct from p_department_start_date then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'department_start_date', v_existing.department_start_date::text, p_department_start_date::text);
    end if;
    if v_existing.continuous_employment_start_date is distinct from p_continuous_employment_start_date then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'continuous_employment_start_date', v_existing.continuous_employment_start_date::text, p_continuous_employment_start_date::text);
    end if;
    if v_existing.custom_fields is distinct from v_cf then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'custom_fields', v_existing.custom_fields::text, v_cf::text);
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
      updated_by = v_uid
    where id = v_record_id;
  end if;

  return v_record_id;
end;
$$;

grant execute on function public.employee_hr_record_upsert(
  uuid, text, text, text, text, numeric, text, date, date, integer, uuid, text,
  text, text, text, numeric, integer, numeric, text, date, date, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. hr_employee_file: expose new columns + computed length of service
-- ---------------------------------------------------------------------------

-- Drop first: return type changes (new columns added).
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
  length_of_service_months integer
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
    coalesce(
      array_agg(d.name order by d.name) filter (where d.name is not null),
      '{}'::text[]
    )                            as department_names,
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
    case
      when r.employment_start_date is not null then
        extract(year from age(current_date, r.employment_start_date))::integer
      else null
    end                          as length_of_service_years,
    case
      when r.employment_start_date is not null then
        extract(month from age(current_date, r.employment_start_date))::integer
      else null
    end                          as length_of_service_months
  from public.profiles p
  left join public.profiles m
    on m.id = p.reports_to_user_id
  left join public.user_departments ud
    on ud.user_id = p.id
  left join public.departments d
    on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r
    on r.user_id = p.id and r.org_id = v_org
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
    r.department_start_date, r.continuous_employment_start_date, r.custom_fields;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. hr_directory_list: same shape for directory / exports
-- ---------------------------------------------------------------------------

-- Drop first: return type changes (new columns added).
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
  length_of_service_months integer
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

  if not v_full_access
    and not public.has_permission(v_uid, v_org, 'hr.view_direct_reports', '{}'::jsonb)
  then
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
    coalesce(
      array_agg(d.name order by d.name) filter (where d.name is not null),
      '{}'::text[]
    )                            as department_names,
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
    case
      when r.employment_start_date is not null then
        extract(year from age(current_date, r.employment_start_date))::integer
      else null
    end                          as length_of_service_years,
    case
      when r.employment_start_date is not null then
        extract(month from age(current_date, r.employment_start_date))::integer
      else null
    end                          as length_of_service_months
  from public.profiles p
  left join public.profiles m
    on m.id = p.reports_to_user_id
  left join public.user_departments ud
    on ud.user_id = p.id
  left join public.departments d
    on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r
    on r.user_id = p.id and r.org_id = v_org
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
    r.department_start_date, r.continuous_employment_start_date, r.custom_fields
  order by p.full_name;
end;
$$;
