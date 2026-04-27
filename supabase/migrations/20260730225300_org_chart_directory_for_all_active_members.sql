create or replace function public.org_chart_directory_list()
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
  weekly_hours numeric,
  positions_count integer,
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

  select p.org_id
  into v_org
  from public.profiles p
  where p.id = v_uid
    and p.status = 'active';

  if v_org is null then
    raise exception 'not authenticated';
  end if;

  return query
  select
    p.id as user_id,
    p.full_name::text,
    p.preferred_name::text,
    coalesce(nullif(trim(p.preferred_name), ''), p.full_name)::text as display_name,
    p.email::text,
    p.status::text,
    p.avatar_url::text,
    p.role::text,
    p.reports_to_user_id,
    coalesce(nullif(trim(m.preferred_name), ''), m.full_name)::text as reports_to_name,
    coalesce(array_agg(d.name order by d.name) filter (where d.name is not null), '{}'::text[]) as department_names,
    r.id as hr_record_id,
    r.job_title::text,
    r.grade_level::text,
    r.contract_type::text,
    r.salary_band::text,
    r.fte,
    r.work_location::text,
    r.employment_start_date,
    r.probation_end_date,
    r.notice_period_weeks,
    r.weekly_hours,
    r.positions_count,
    case when r.employment_start_date is not null then extract(year from age(current_date, r.employment_start_date))::integer else null end as length_of_service_years,
    case when r.employment_start_date is not null then extract(month from age(current_date, r.employment_start_date))::integer else null end as length_of_service_months
  from public.profiles p
  left join public.profiles m on m.id = p.reports_to_user_id
  left join public.user_departments ud on ud.user_id = p.id
  left join public.departments d on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r on r.user_id = p.id and r.org_id = v_org
  where p.org_id = v_org
    and p.status = 'active'
  group by
    p.id, p.full_name, p.preferred_name, p.email, p.status, p.avatar_url, p.role,
    p.reports_to_user_id, m.preferred_name, m.full_name,
    r.id, r.job_title, r.grade_level, r.contract_type, r.salary_band,
    r.fte, r.work_location, r.employment_start_date, r.probation_end_date,
    r.notice_period_weeks, r.weekly_hours, r.positions_count
  order by coalesce(nullif(trim(p.preferred_name), ''), p.full_name);
end;
$$;

revoke all on function public.org_chart_directory_list() from public;
grant execute on function public.org_chart_directory_list() to authenticated;
