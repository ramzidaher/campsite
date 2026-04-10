-- Phase 0/1 polish: org-level job board summary + distinct department names for filter tabs.

create or replace function public.public_job_listings_org_summary(p_org_slug text)
returns table (
  live_job_count bigint,
  department_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::bigint as live_job_count,
    count(distinct jl.department_id)::bigint as department_count
  from public.job_listings jl
  join public.organisations o
    on o.id = jl.org_id
    and o.is_active = true
    and o.slug = nullif(trim(p_org_slug), '')
  where jl.status = 'live';
$$;

grant execute on function public.public_job_listings_org_summary(text) to anon, authenticated;

create or replace function public.public_job_listing_department_names(p_org_slug text)
returns table (department_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct d.name::text as department_name
  from public.job_listings jl
  join public.organisations o
    on o.id = jl.org_id
    and o.is_active = true
    and o.slug = nullif(trim(p_org_slug), '')
  join public.departments d
    on d.id = jl.department_id
    and d.org_id = jl.org_id
  where jl.status = 'live'
  order by 1;
$$;

grant execute on function public.public_job_listing_department_names(text) to anon, authenticated;
