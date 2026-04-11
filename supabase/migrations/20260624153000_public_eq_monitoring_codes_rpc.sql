-- Anonymous careers site: load equality monitoring options for optional apply step.

create or replace function public.public_org_eq_monitoring_codes(p_org_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(s.eq_category_codes, '[]'::jsonb)
  from public.organisations o
  left join public.org_hr_metric_settings s on s.org_id = o.id
  where o.slug = nullif(trim(p_org_slug), '')
    and o.is_active = true
  limit 1;
$$;

revoke all on function public.public_org_eq_monitoring_codes(text) from public;
grant execute on function public.public_org_eq_monitoring_codes(text) to anon, authenticated;
