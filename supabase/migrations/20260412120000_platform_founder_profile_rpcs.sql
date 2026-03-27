-- Platform founders: list profiles across tenants (security definer + is_platform_admin).

create or replace function public.platform_org_profiles_list(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from public.organisations o where o.id = p_org_id) then
    return '[]'::jsonb;
  end if;
  return coalesce(
    (
      select jsonb_agg(row_data order by sort_created desc)
      from (
        select
          p.created_at as sort_created,
          jsonb_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'email', p.email,
            'role', p.role,
            'status', p.status,
            'created_at', p.created_at
          ) as row_data
        from public.profiles p
        where p.org_id = p_org_id
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.platform_org_profiles_list(uuid) from public;
grant execute on function public.platform_org_profiles_list(uuid) to authenticated;

create or replace function public.platform_profiles_list_all()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not allowed';
  end if;
  return coalesce(
    (
      select jsonb_agg(row_data order by sort_created desc)
      from (
        select
          p.created_at as sort_created,
          jsonb_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'email', p.email,
            'role', p.role,
            'status', p.status,
            'created_at', p.created_at,
            'org_id', p.org_id,
            'org_name', o.name,
            'org_slug', o.slug
          ) as row_data
        from (
          select p.*
          from public.profiles p
          where p.org_id is not null
          order by p.created_at desc
          limit 2000
        ) p
        join public.organisations o on o.id = p.org_id
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.platform_profiles_list_all() from public;
grant execute on function public.platform_profiles_list_all() to authenticated;
