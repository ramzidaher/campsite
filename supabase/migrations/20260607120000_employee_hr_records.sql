-- Employee HR records: job details, contract, employment dates, recruitment link, audit log.

-- ---------------------------------------------------------------------------
-- Core table
-- ---------------------------------------------------------------------------

create table if not exists public.employee_hr_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_title text not null default '',
  grade_level text not null default '',
  contract_type text not null default 'full_time'
    check (contract_type in ('full_time', 'part_time', 'contractor', 'zero_hours')),
  salary_band text not null default '',
  fte numeric(4, 2) not null default 1.00
    check (fte > 0 and fte <= 1),
  work_location text not null default 'office'
    check (work_location in ('office', 'remote', 'hybrid')),
  employment_start_date date,
  probation_end_date date,
  notice_period_weeks integer check (notice_period_weeks is null or notice_period_weeks >= 0),
  hired_from_application_id uuid references public.job_applications (id) on delete set null,
  notes text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists employee_hr_records_org_idx
  on public.employee_hr_records (org_id);

create index if not exists employee_hr_records_user_idx
  on public.employee_hr_records (user_id);

comment on table public.employee_hr_records is
  'One HR record per active employee per org  job details, contract, employment dates.';

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table if not exists public.employee_hr_record_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  record_id uuid not null references public.employee_hr_records (id) on delete cascade,
  changed_by uuid not null references public.profiles (id) on delete restrict,
  field_name text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index if not exists employee_hr_record_events_record_idx
  on public.employee_hr_record_events (record_id, created_at desc);

comment on table public.employee_hr_record_events is
  'Audit trail: every field change on an employee HR record.';

-- ---------------------------------------------------------------------------
-- Timestamps trigger
-- ---------------------------------------------------------------------------

create or replace function public.employee_hr_records_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_hr_records_updated_at_trg on public.employee_hr_records;
create trigger employee_hr_records_updated_at_trg
  before update on public.employee_hr_records
  for each row
  execute procedure public.employee_hr_records_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.employee_hr_records enable row level security;
alter table public.employee_hr_record_events enable row level security;

-- HR managers can read records in their org
drop policy if exists employee_hr_records_select on public.employee_hr_records;
create policy employee_hr_records_select
  on public.employee_hr_records
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.view_records', '{}'::jsonb)
  );

-- HR managers can insert/update records in their org
drop policy if exists employee_hr_records_insert on public.employee_hr_records;
create policy employee_hr_records_insert
  on public.employee_hr_records
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
  );

drop policy if exists employee_hr_records_update on public.employee_hr_records;
create policy employee_hr_records_update
  on public.employee_hr_records
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
  );

-- Audit log readable by HR managers
drop policy if exists employee_hr_record_events_select on public.employee_hr_record_events;
create policy employee_hr_record_events_select
  on public.employee_hr_record_events
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.view_records', '{}'::jsonb)
  );

-- Audit log inserts only via RPC (security definer)
drop policy if exists employee_hr_record_events_insert on public.employee_hr_record_events;
create policy employee_hr_record_events_insert
  on public.employee_hr_record_events
  for insert
  to authenticated
  with check (false);

-- ---------------------------------------------------------------------------
-- RPC: upsert HR record with field-level audit
-- ---------------------------------------------------------------------------

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
  p_notes text
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
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.manage_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  -- target user must be in same org
  if not exists (
    select 1 from public.profiles t where t.id = p_user_id and t.org_id = v_org
  ) then
    raise exception 'target user not in org';
  end if;

  -- validate contract_type
  if p_contract_type not in ('full_time', 'part_time', 'contractor', 'zero_hours') then
    raise exception 'invalid contract_type';
  end if;

  -- validate work_location
  if p_work_location not in ('office', 'remote', 'hybrid') then
    raise exception 'invalid work_location';
  end if;

  -- validate fte
  if p_fte is null or p_fte <= 0 or p_fte > 1 then
    raise exception 'fte must be > 0 and <= 1';
  end if;

  -- validate hired_from_application_id belongs to org (if set)
  if p_hired_from_application_id is not null then
    if not exists (
      select 1 from public.job_applications a where a.id = p_hired_from_application_id and a.org_id = v_org
    ) then
      raise exception 'application not in org';
    end if;
  end if;

  -- load existing record if any
  select * into v_existing
  from public.employee_hr_records
  where org_id = v_org and user_id = p_user_id;

  if v_existing.id is null then
    -- INSERT path
    insert into public.employee_hr_records (
      org_id, user_id,
      job_title, grade_level, contract_type, salary_band,
      fte, work_location,
      employment_start_date, probation_end_date, notice_period_weeks,
      hired_from_application_id, notes,
      created_by, updated_by
    ) values (
      v_org, p_user_id,
      coalesce(trim(p_job_title), ''), coalesce(trim(p_grade_level), ''),
      p_contract_type, coalesce(trim(p_salary_band), ''),
      p_fte, p_work_location,
      p_employment_start_date, p_probation_end_date, p_notice_period_weeks,
      p_hired_from_application_id, nullif(trim(coalesce(p_notes, '')), ''),
      v_uid, v_uid
    )
    returning id into v_record_id;

    -- one creation event
    insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
    values (v_org, v_record_id, v_uid, 'record', null, 'created');

  else
    v_record_id := v_existing.id;

    -- UPDATE path: write an audit event for each changed field
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
    if v_existing.fte <> p_fte then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'fte', v_existing.fte::text, p_fte::text);
    end if;
    if v_existing.work_location <> p_work_location then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'work_location', v_existing.work_location, p_work_location);
    end if;
    if coalesce(v_existing.employment_start_date::text, '') <> coalesce(p_employment_start_date::text, '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'employment_start_date', v_existing.employment_start_date::text, p_employment_start_date::text);
    end if;
    if coalesce(v_existing.probation_end_date::text, '') <> coalesce(p_probation_end_date::text, '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'probation_end_date', v_existing.probation_end_date::text, p_probation_end_date::text);
    end if;
    if coalesce(v_existing.notice_period_weeks::text, '') <> coalesce(p_notice_period_weeks::text, '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'notice_period_weeks', v_existing.notice_period_weeks::text, p_notice_period_weeks::text);
    end if;
    if coalesce(v_existing.hired_from_application_id::text, '') <> coalesce(p_hired_from_application_id::text, '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'hired_from_application_id', v_existing.hired_from_application_id::text, p_hired_from_application_id::text);
    end if;
    if coalesce(v_existing.notes, '') <> coalesce(nullif(trim(coalesce(p_notes, '')), ''), '') then
      insert into public.employee_hr_record_events (org_id, record_id, changed_by, field_name, old_value, new_value)
      values (v_org, v_record_id, v_uid, 'notes', v_existing.notes, nullif(trim(coalesce(p_notes, '')), ''));
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
      updated_by = v_uid
    where id = v_record_id;
  end if;

  return v_record_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: get HR directory for org (all members + their HR record if any)
-- ---------------------------------------------------------------------------

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
  notice_period_weeks integer
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
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
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
    r.notice_period_weeks
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
  group by p.id, p.full_name, p.email, p.status, p.avatar_url, p.role,
           p.reports_to_user_id, m.full_name, r.id, r.job_title, r.grade_level,
           r.contract_type, r.salary_band, r.fte, r.work_location,
           r.employment_start_date, r.probation_end_date, r.notice_period_weeks
  order by p.full_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: get single employee's full HR file
-- ---------------------------------------------------------------------------

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
  record_updated_at timestamptz
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
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
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
    r.hired_from_application_id,
    r.notes::text,
    r.created_at                 as record_created_at,
    r.updated_at                 as record_updated_at
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
  group by p.id, p.full_name, p.email, p.status, p.avatar_url, p.role,
           p.reports_to_user_id, m.full_name,
           r.id, r.job_title, r.grade_level, r.contract_type, r.salary_band,
           r.fte, r.work_location, r.employment_start_date, r.probation_end_date,
           r.notice_period_weeks, r.hired_from_application_id, r.notes,
           r.created_at, r.updated_at;
end;
$$;
