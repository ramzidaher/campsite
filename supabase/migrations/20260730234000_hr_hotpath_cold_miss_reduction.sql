-- Reduce cold-miss work for HR org chart and all-org hiring inboxes.

create or replace function public.org_chart_directory_core_list()
returns table (
  user_id uuid,
  full_name text,
  preferred_name text,
  display_name text,
  email text,
  role text,
  reports_to_user_id uuid,
  reports_to_name text,
  department_names text[],
  job_title text,
  work_location text
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
    p.role::text,
    p.reports_to_user_id,
    coalesce(nullif(trim(m.preferred_name), ''), m.full_name)::text as reports_to_name,
    coalesce(array_agg(d.name order by d.name) filter (where d.name is not null), '{}'::text[]) as department_names,
    r.job_title::text,
    r.work_location::text
  from public.profiles p
  left join public.profiles m on m.id = p.reports_to_user_id
  left join public.user_departments ud on ud.user_id = p.id
  left join public.departments d on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r on r.user_id = p.id and r.org_id = v_org
  where p.org_id = v_org
    and p.status = 'active'
  group by
    p.id, p.full_name, p.preferred_name, p.email, p.role,
    p.reports_to_user_id, m.preferred_name, m.full_name,
    r.job_title, r.work_location
  order by coalesce(nullif(trim(p.preferred_name), ''), p.full_name);
end;
$$;

revoke all on function public.org_chart_directory_core_list() from public;
grant execute on function public.org_chart_directory_core_list() to authenticated;

create index if not exists job_applications_org_submitted_at_desc_idx
  on public.job_applications (org_id, submitted_at desc);

create index if not exists job_listings_org_title_idx
  on public.job_listings (org_id, title);

create index if not exists departments_org_name_idx
  on public.departments (org_id, name);
