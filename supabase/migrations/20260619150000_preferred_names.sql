-- Preferred names for employee-facing and HR-visible name surfaces.

alter table public.profiles
  add column if not exists preferred_name text;

comment on column public.profiles.preferred_name is
  'Optional preferred name used for display; legal name remains in full_name.';

drop function if exists public.hr_employee_file(uuid);

create or replace function public.hr_employee_file(p_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  preferred_name text,
  display_name text,
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
  if v_uid is null then raise exception 'not authenticated'; end if;

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
    p.preferred_name::text,
    case
      when nullif(trim(coalesce(p.preferred_name, '')), '') is null then p.full_name::text
      when lower(trim(p.preferred_name)) = lower(trim(p.full_name)) then p.full_name::text
      else trim(p.preferred_name) || ' (' || p.full_name || ')'
    end                          as display_name,
    p.email::text,
    p.status::text,
    p.avatar_url::text,
    p.role::text,
    p.reports_to_user_id,
    case
      when nullif(trim(coalesce(m.preferred_name, '')), '') is null then m.full_name::text
      when lower(trim(m.preferred_name)) = lower(trim(m.full_name)) then m.full_name::text
      else trim(m.preferred_name) || ' (' || m.full_name || ')'
    end                          as reports_to_name,
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
      when r.employment_start_date is not null then extract(year from age(current_date, r.employment_start_date))::integer
      else null
    end                          as length_of_service_years,
    case
      when r.employment_start_date is not null then extract(month from age(current_date, r.employment_start_date))::integer
      else null
    end                          as length_of_service_months
  from public.profiles p
  left join public.profiles m on m.id = p.reports_to_user_id
  left join public.user_departments ud on ud.user_id = p.id
  left join public.departments d on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r on r.user_id = p.id and r.org_id = v_org
  where p.id = p_user_id and p.org_id = v_org
  group by
    p.id, p.full_name, p.preferred_name, p.email, p.status, p.avatar_url, p.role,
    p.reports_to_user_id, m.full_name, m.preferred_name,
    r.id, r.job_title, r.grade_level, r.contract_type, r.salary_band,
    r.fte, r.work_location, r.employment_start_date, r.probation_end_date,
    r.notice_period_weeks, r.hired_from_application_id, r.notes,
    r.created_at, r.updated_at, r.position_type, r.pay_grade, r.employment_basis,
    r.weekly_hours, r.positions_count, r.budget_amount, r.budget_currency,
    r.department_start_date, r.continuous_employment_start_date, r.custom_fields;
end;
$$;

drop function if exists public.hr_directory_list();

create or replace function public.hr_directory_list()
returns table (
  user_id uuid,
  full_name text,
  preferred_name text,
  display_name text,
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
  if v_uid is null then raise exception 'not authenticated'; end if;
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
    p.preferred_name::text,
    case
      when nullif(trim(coalesce(p.preferred_name, '')), '') is null then p.full_name::text
      when lower(trim(p.preferred_name)) = lower(trim(p.full_name)) then p.full_name::text
      else trim(p.preferred_name) || ' (' || p.full_name || ')'
    end                          as display_name,
    p.email::text,
    p.status::text,
    p.avatar_url::text,
    p.role::text,
    p.reports_to_user_id,
    case
      when nullif(trim(coalesce(m.preferred_name, '')), '') is null then m.full_name::text
      when lower(trim(m.preferred_name)) = lower(trim(m.full_name)) then m.full_name::text
      else trim(m.preferred_name) || ' (' || m.full_name || ')'
    end                          as reports_to_name,
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
    case
      when r.employment_start_date is not null then extract(year from age(current_date, r.employment_start_date))::integer
      else null
    end as length_of_service_years,
    case
      when r.employment_start_date is not null then extract(month from age(current_date, r.employment_start_date))::integer
      else null
    end as length_of_service_months
  from public.profiles p
  left join public.profiles m on m.id = p.reports_to_user_id
  left join public.user_departments ud on ud.user_id = p.id
  left join public.departments d on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r on r.user_id = p.id and r.org_id = v_org
  where p.org_id = v_org
    and p.status = 'active'
    and (v_full_access or p.reports_to_user_id = v_uid)
  group by
    p.id, p.full_name, p.preferred_name, p.email, p.status, p.avatar_url, p.role,
    p.reports_to_user_id, m.full_name, m.preferred_name,
    r.id, r.job_title, r.grade_level, r.contract_type, r.salary_band,
    r.fte, r.work_location, r.employment_start_date, r.probation_end_date,
    r.notice_period_weeks, r.position_type, r.pay_grade, r.employment_basis,
    r.weekly_hours, r.positions_count, r.budget_amount, r.budget_currency,
    r.department_start_date, r.continuous_employment_start_date, r.custom_fields
  order by display_name;
end;
$$;

create or replace function public.hr_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_today date := current_date;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    'headcount_total', (select count(*) from public.profiles where org_id = v_org and status = 'active'),
    'by_contract',
      coalesce((
        select jsonb_agg(row) from (
          select jsonb_build_object('contract_type', contract_type, 'count', count(*)) as row
          from public.employee_hr_records where org_id = v_org
          group by contract_type
          order by count(*) desc
        ) s
      ), '[]'::jsonb),
    'by_location',
      coalesce((
        select jsonb_agg(row) from (
          select jsonb_build_object('work_location', work_location, 'count', count(*)) as row
          from public.employee_hr_records where org_id = v_org
          group by work_location
          order by count(*) desc
        ) s
      ), '[]'::jsonb),
    'missing_hr_records',
      (select count(*) from public.profiles p
       where p.org_id = v_org and p.status = 'active'
         and not exists (select 1 from public.employee_hr_records r where r.user_id = p.id and r.org_id = v_org)),
    'onboarding_active', (select count(*) from public.onboarding_runs where org_id = v_org and status = 'active'),
    'probation_ending_soon',
      coalesce((
        select jsonb_agg(row) from (
          select jsonb_build_object(
            'user_id', p.id,
            'full_name', p.full_name,
            'preferred_name', p.preferred_name,
            'display_name',
              case
                when nullif(trim(coalesce(p.preferred_name, '')), '') is null then p.full_name
                when lower(trim(p.preferred_name)) = lower(trim(p.full_name)) then p.full_name
                else trim(p.preferred_name) || ' (' || p.full_name || ')'
              end,
            'probation_end_date', r.probation_end_date
          ) as row
          from public.employee_hr_records r
          join public.profiles p on p.id = r.user_id
          where r.org_id = v_org
            and r.probation_end_date is not null
            and r.probation_end_date >= v_today
            and r.probation_end_date <= v_today + 60
          order by r.probation_end_date
        ) s
      ), '[]'::jsonb),
    'review_cycles_active',
      coalesce((
        select jsonb_agg(row) from (
          select jsonb_build_object(
            'id', c.id, 'name', c.name, 'type', c.type,
            'total', count(pr.id),
            'completed', count(pr.id) filter (where pr.status = 'completed'),
            'manager_due', c.manager_assessment_due
          ) as row
          from public.review_cycles c
          left join public.performance_reviews pr on pr.cycle_id = c.id
          where c.org_id = v_org and c.status = 'active'
          group by c.id, c.name, c.type, c.manager_assessment_due
          order by c.created_at desc
        ) s
      ), '[]'::jsonb),
    'on_leave_today',
      coalesce((
        select jsonb_agg(row) from (
          select jsonb_build_object(
            'user_id', lr.requester_id,
            'full_name', p.full_name,
            'preferred_name', p.preferred_name,
            'display_name',
              case
                when nullif(trim(coalesce(p.preferred_name, '')), '') is null then p.full_name
                when lower(trim(p.preferred_name)) = lower(trim(p.full_name)) then p.full_name
                else trim(p.preferred_name) || ' (' || p.full_name || ')'
              end,
            'kind', lr.kind,
            'end_date', lr.end_date
          ) as row
          from public.leave_requests lr
          join public.profiles p on p.id = lr.requester_id
          where lr.org_id = v_org
            and lr.status = 'approved'
            and lr.start_date <= v_today
            and lr.end_date >= v_today
          order by p.full_name
        ) s
      ), '[]'::jsonb),
    'bradford_alerts',
      coalesce((
        select jsonb_agg(row) from (
          select jsonb_build_object(
            'user_id', p.id,
            'full_name', p.full_name,
            'preferred_name', p.preferred_name,
            'display_name',
              case
                when nullif(trim(coalesce(p.preferred_name, '')), '') is null then p.full_name
                when lower(trim(p.preferred_name)) = lower(trim(p.full_name)) then p.full_name
                else trim(p.preferred_name) || ' (' || p.full_name || ')'
              end,
            'spell_count', bf.spell_count,
            'total_days', bf.total_days,
            'bradford_score', bf.bradford_score
          ) as row
          from public.profiles p
          cross join lateral (
            select
              coalesce(bf_data.spell_count, 0) as spell_count,
              coalesce(bf_data.total_days, 0) as total_days,
              coalesce(bf_data.bradford_score, 0) as bradford_score
            from (
              select
                count(spell) as spell_count,
                sum(days) as total_days,
                (count(spell) * count(spell) * sum(days))::int as bradford_score
              from (
                select
                  min(sa.start_date) as spell,
                  sum(
                    (least(sa.end_date, v_today) - greatest(sa.start_date, v_today - (
                      select coalesce(bradford_window_days, 365)
                      from public.org_leave_settings ols where ols.org_id = v_org
                    )))::int + 1
                  ) as days
                from public.sickness_absences sa
                where sa.user_id = p.id
                  and sa.org_id = v_org
                  and sa.start_date >= (v_today - (
                    select coalesce(bradford_window_days, 365)
                      from public.org_leave_settings ols where ols.org_id = v_org
                  ))
                group by
                  (select count(*) from public.sickness_absences sa2
                   where sa2.user_id = p.id and sa2.org_id = v_org
                     and sa2.end_date < sa.start_date
                     and sa2.end_date >= sa.start_date - 1)
              ) spell_data
            ) bf_data
          ) bf
          where p.org_id = v_org and p.status = 'active' and bf.bradford_score >= 200
          order by bf.bradford_score desc
          limit 10
        ) s
      ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
