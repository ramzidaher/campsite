-- Hotfix for timeout spikes observed in live logs:
-- 1) add composite index for rota_shifts user/time window lookups
-- 2) reduce repeated permission recomputation by extending cache TTL

create index if not exists rota_shifts_user_start_time_idx
  on public.rota_shifts (user_id, start_time);

create or replace function public.refresh_user_permission_keys_cache(
  p_user_id uuid,
  p_org_id uuid default null,
  p_ttl_seconds integer default 900
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org_id uuid := p_org_id;
  v_ttl_seconds integer := greatest(300, least(coalesce(p_ttl_seconds, 900), 3600));
  v_keys jsonb := '[]'::jsonb;
begin
  if p_user_id is null then
    return;
  end if;

  if v_org_id is null then
    select p.org_id into v_org_id
    from public.profiles p
    where p.id = p_user_id;
  end if;

  if v_org_id is null then
    return;
  end if;

  select coalesce(jsonb_agg(t.permission_key), '[]'::jsonb)
    into v_keys
  from public.get_permissions_for_user(p_user_id, v_org_id) t;

  insert into public.user_permission_keys_cache as c (
    user_id,
    org_id,
    permission_keys,
    refreshed_at,
    expires_at
  )
  values (
    p_user_id,
    v_org_id,
    coalesce(v_keys, '[]'::jsonb),
    now(),
    now() + make_interval(secs => v_ttl_seconds)
  )
  on conflict (user_id, org_id) do update
    set permission_keys = excluded.permission_keys,
        refreshed_at = excluded.refreshed_at,
        expires_at = excluded.expires_at;
end;
$$;

grant execute on function public.refresh_user_permission_keys_cache(uuid, uuid, integer) to service_role;

create or replace function public.refresh_org_permission_keys_cache(
  p_org_id uuid,
  p_limit integer default 1000
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
begin
  if p_org_id is null then
    return 0;
  end if;

  for r in
    select m.user_id
    from public.user_org_memberships m
    where m.org_id = p_org_id
      and m.status = 'active'
    order by m.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 1000), 5000))
  loop
    perform public.refresh_user_permission_keys_cache(r.user_id, p_org_id, 900);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.refresh_org_permission_keys_cache(uuid, integer) to service_role;

create or replace function public._touch_permission_keys_cache_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'user_org_role_assignments' then
    if tg_op in ('INSERT', 'UPDATE') then
      perform public.refresh_user_permission_keys_cache(new.user_id, new.org_id, 900);
    elsif tg_op = 'DELETE' then
      perform public.refresh_user_permission_keys_cache(old.user_id, old.org_id, 900);
    end if;
  elsif tg_table_name = 'user_permission_overrides' then
    if tg_op in ('INSERT', 'UPDATE') then
      perform public.refresh_user_permission_keys_cache(new.user_id, new.org_id, 900);
    elsif tg_op = 'DELETE' then
      perform public.refresh_user_permission_keys_cache(old.user_id, old.org_id, 900);
    end if;
  elsif tg_table_name = 'user_org_memberships' then
    if tg_op in ('INSERT', 'UPDATE') then
      perform public.refresh_user_permission_keys_cache(new.user_id, new.org_id, 900);
    elsif tg_op = 'DELETE' then
      delete from public.user_permission_keys_cache
      where user_id = old.user_id
        and org_id = old.org_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;
