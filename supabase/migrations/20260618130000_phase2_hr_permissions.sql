-- Phase 2: RBAC / Permissions Completion
-- 1. Add hr.view_own and hr.view_direct_reports to permission_catalog
-- 2. Grant hr.view_own to all roles, hr.view_direct_reports to manager/coordinator/org_admin
-- 3. Add RLS SELECT policies for self-view and direct-reports view on HR record tables
-- 4. Replace hr_employee_file RPC with multi-tier access (admin / manager / self)
-- 5. Replace hr_directory_list RPC to filter by direct reports when caller lacks hr.view_records

-- ---------------------------------------------------------------------------
-- 1. Permission catalog
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('hr.view_own',
   'View own HR record',
   'View your own HR record including job title, contract type, and employment dates.',
   false),
  ('hr.view_direct_reports',
   'View direct reports HR records',
   'View HR records and employment details for employees who report directly to you.',
   false)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description;

-- ---------------------------------------------------------------------------
-- 2. Permission grants
-- ---------------------------------------------------------------------------

insert into public.org_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.org_roles r
join (
  values
    -- hr.view_own: every role can see their own HR record
    ('org_admin',      'hr.view_own'),
    ('manager',        'hr.view_own'),
    ('coordinator',    'hr.view_own'),
    ('administrator',  'hr.view_own'),
    ('duty_manager',   'hr.view_own'),
    ('csa',            'hr.view_own'),
    ('society_leader', 'hr.view_own'),

    -- hr.view_direct_reports: managers and above see their direct reports
    ('org_admin',   'hr.view_direct_reports'),
    ('manager',     'hr.view_direct_reports'),
    ('coordinator', 'hr.view_direct_reports')

) as p(role_key, permission_key)
  on p.role_key = r.key
  and r.is_archived = false
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. RLS policies on employee_hr_records
-- ---------------------------------------------------------------------------

-- Self-view: any active employee can see their own record
drop policy if exists employee_hr_records_select_own on public.employee_hr_records;
create policy employee_hr_records_select_own
  on public.employee_hr_records for select to authenticated
  using (
    org_id = public.current_org_id()
    and user_id = auth.uid()
    and public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
  );

-- Manager view: direct reports only
drop policy if exists employee_hr_records_select_direct_reports on public.employee_hr_records;
create policy employee_hr_records_select_direct_reports
  on public.employee_hr_records for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
    and exists (
      select 1
        from public.profiles p
       where p.id = user_id
         and p.reports_to_user_id = auth.uid()
         and p.org_id = public.current_org_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. RLS policies on employee_hr_record_events
-- ---------------------------------------------------------------------------

-- Self-view audit events
drop policy if exists employee_hr_record_events_select_own on public.employee_hr_record_events;
create policy employee_hr_record_events_select_own
  on public.employee_hr_record_events for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
    and exists (
      select 1
        from public.employee_hr_records r
       where r.id = record_id
         and r.user_id = auth.uid()
    )
  );

-- Manager view of direct reports' audit events
drop policy if exists employee_hr_record_events_select_direct_reports on public.employee_hr_record_events;
create policy employee_hr_record_events_select_direct_reports
  on public.employee_hr_record_events for select to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
    and exists (
      select 1
        from public.employee_hr_records r
        join public.profiles p on p.id = r.user_id
       where r.id = record_id
         and p.reports_to_user_id = auth.uid()
         and p.org_id = public.current_org_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Replace hr_employee_file with multi-tier permission check
--    Access tiers (first match wins):
--      a) hr.view_records     → HR admin, full access to any employee
--      b) hr.view_direct_reports + is direct manager → manager access
--      c) hr.view_own + p_user_id = caller → self-view
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
  if v_org is null then raise exception 'not authenticated'; end if;

  -- Tier a: HR admin
  if public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    null; -- allowed
  -- Tier b: manager viewing a direct report
  elsif public.has_permission(v_uid, v_org, 'hr.view_direct_reports', '{}'::jsonb)
    and exists (
      select 1 from public.profiles t
       where t.id = p_user_id
         and t.reports_to_user_id = v_uid
         and t.org_id = v_org
    )
  then
    null; -- allowed
  -- Tier c: self-view
  elsif p_user_id = v_uid
    and public.has_permission(v_uid, v_org, 'hr.view_own', '{}'::jsonb)
  then
    null; -- allowed
  else
    raise exception 'not allowed';
  end if;

  -- Target must be in the same org
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
  group by
    p.id, p.full_name, p.email, p.status, p.avatar_url, p.role,
    p.reports_to_user_id, m.full_name,
    r.id, r.job_title, r.grade_level, r.contract_type, r.salary_band,
    r.fte, r.work_location, r.employment_start_date, r.probation_end_date,
    r.notice_period_weeks, r.hired_from_application_id, r.notes,
    r.created_at, r.updated_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Replace hr_directory_list with direct-reports filtering
--    Full access  (hr.view_records):          returns all active org members
--    Scoped access (hr.view_direct_reports):  returns only direct reports
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
  v_uid        uuid := auth.uid();
  v_org        uuid;
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
    -- when scoped, only return direct reports of the caller
    and (v_full_access or p.reports_to_user_id = v_uid)
  group by
    p.id, p.full_name, p.email, p.status, p.avatar_url, p.role,
    p.reports_to_user_id, m.full_name,
    r.id, r.job_title, r.grade_level, r.contract_type, r.salary_band,
    r.fte, r.work_location, r.employment_start_date, r.probation_end_date,
    r.notice_period_weeks
  order by p.full_name;
end;
$$;
