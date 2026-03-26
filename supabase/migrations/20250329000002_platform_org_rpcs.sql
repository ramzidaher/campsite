-- Platform admin: org list with aggregates (avoids broad profiles SELECT for CGS).

create or replace function public.platform_organisations_list()
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
          o.created_at as sort_created,
          jsonb_build_object(
            'id', o.id,
            'name', o.name,
            'slug', o.slug,
            'is_active', o.is_active,
            'created_at', o.created_at,
            'logo_url', o.logo_url,
            'user_count', (select count(*)::int from public.profiles p where p.org_id = o.id),
            'broadcast_count', (select count(*)::int from public.broadcasts b where b.org_id = o.id)
          ) as row_data
        from public.organisations o
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.platform_organisations_list() from public;
grant execute on function public.platform_organisations_list() to authenticated;

create or replace function public.platform_org_metrics(p_org_id uuid)
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
    return null;
  end if;
  return jsonb_build_object(
    'user_count', (select count(*)::int from public.profiles p where p.org_id = p_org_id),
    'broadcast_count', (select count(*)::int from public.broadcasts b where b.org_id = p_org_id),
    'storage_bytes', 0
  );
end;
$$;

revoke all on function public.platform_org_metrics(uuid) from public;
grant execute on function public.platform_org_metrics(uuid) to authenticated;
