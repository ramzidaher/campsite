-- Read-only permission cache for shell path.
-- Shell RPCs may read this cache, but must never write in-request.

create table if not exists public.user_permission_keys_cache (
  user_id uuid not null,
  org_id uuid not null,
  permission_keys jsonb not null default '[]'::jsonb,
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, org_id)
);

create index if not exists user_permission_keys_cache_expires_idx
  on public.user_permission_keys_cache (expires_at);

alter table public.user_permission_keys_cache enable row level security;
revoke all on table public.user_permission_keys_cache from public, anon, authenticated;
grant all on table public.user_permission_keys_cache to service_role;

create or replace function public.get_permissions_for_user(
  p_user_id uuid,
  p_org_id uuid
)
returns table(permission_key text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := p_user_id;
  v_org uuid := p_org_id;
  v_founder boolean := false;
  v_member_active boolean := false;
  v_replace_mode boolean := false;
begin
  if v_uid is null or v_org is null then
    return;
  end if;

  select public.is_platform_founder(v_uid) into v_founder;
  if v_founder then
    return query
    select pc.key
    from public.permission_catalog pc;
    return;
  end if;

  select exists (
    select 1
    from public.user_org_memberships m
    where m.user_id = v_uid
      and m.org_id = v_org
      and m.status = 'active'
  ) into v_member_active;

  if not v_member_active then
    return;
  end if;

  select exists (
    select 1
    from public.user_permission_overrides o
    where o.user_id = v_uid
      and o.org_id = v_org
      and o.mode = 'replace'
  ) into v_replace_mode;

  return query
  with latest_policy as (
    select distinct on (opp.permission_key)
      opp.permission_key,
      coalesce((opp.rule ->> 'requires_approval')::boolean, false) as requires_approval
    from public.org_permission_policies opp
    where opp.org_id = v_org
      and opp.is_active = true
    order by opp.permission_key, opp.created_at desc
  ),
  subtractive as (
    select o.permission_key
    from public.user_permission_overrides o
    where o.user_id = v_uid
      and o.org_id = v_org
      and o.mode = 'subtractive'
  ),
  additive_or_replace as (
    select o.permission_key
    from public.user_permission_overrides o
    where o.user_id = v_uid
      and o.org_id = v_org
      and o.mode in ('additive', 'replace')
  ),
  role_grants as (
    select rp.permission_key
    from public.user_org_role_assignments a
    join public.org_roles r on r.id = a.role_id
    join public.org_role_permissions rp on rp.role_id = r.id
    where a.user_id = v_uid
      and a.org_id = v_org
      and r.org_id = v_org
      and r.is_archived = false
  ),
  granted_raw as (
    select ar.permission_key
    from additive_or_replace ar
    where v_replace_mode
    union
    select rg.permission_key
    from role_grants rg
    where not v_replace_mode
    union
    select ar.permission_key
    from additive_or_replace ar
    where not v_replace_mode
  )
  select pc.key
  from granted_raw g
  join public.permission_catalog pc on pc.key = g.permission_key
  left join subtractive s on s.permission_key = g.permission_key
  left join latest_policy lp on lp.permission_key = g.permission_key
  where s.permission_key is null
    and coalesce(pc.is_founder_only, false) = false
    and coalesce(lp.requires_approval, false) = false
  group by pc.key;
end;
$$;

grant execute on function public.get_permissions_for_user(uuid, uuid) to service_role;

create or replace function public.refresh_user_permission_keys_cache(
  p_user_id uuid,
  p_org_id uuid default null,
  p_ttl_seconds integer default 60
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org_id uuid := p_org_id;
  v_ttl_seconds integer := greatest(30, least(coalesce(p_ttl_seconds, 60), 3600));
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
    perform public.refresh_user_permission_keys_cache(r.user_id, p_org_id, 60);
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
      perform public.refresh_user_permission_keys_cache(new.user_id, new.org_id, 60);
    elsif tg_op = 'DELETE' then
      perform public.refresh_user_permission_keys_cache(old.user_id, old.org_id, 60);
    end if;
  elsif tg_table_name = 'user_permission_overrides' then
    if tg_op in ('INSERT', 'UPDATE') then
      perform public.refresh_user_permission_keys_cache(new.user_id, new.org_id, 60);
    elsif tg_op = 'DELETE' then
      perform public.refresh_user_permission_keys_cache(old.user_id, old.org_id, 60);
    end if;
  elsif tg_table_name = 'user_org_memberships' then
    if tg_op in ('INSERT', 'UPDATE') then
      perform public.refresh_user_permission_keys_cache(new.user_id, new.org_id, 60);
    elsif tg_op = 'DELETE' then
      delete from public.user_permission_keys_cache
      where user_id = old.user_id
        and org_id = old.org_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_touch_permission_cache_user_org_role_assignments on public.user_org_role_assignments;
create trigger trg_touch_permission_cache_user_org_role_assignments
after insert or update or delete on public.user_org_role_assignments
for each row execute function public._touch_permission_keys_cache_refresh();

drop trigger if exists trg_touch_permission_cache_user_permission_overrides on public.user_permission_overrides;
create trigger trg_touch_permission_cache_user_permission_overrides
after insert or update or delete on public.user_permission_overrides
for each row execute function public._touch_permission_keys_cache_refresh();

drop trigger if exists trg_touch_permission_cache_user_org_memberships on public.user_org_memberships;
create trigger trg_touch_permission_cache_user_org_memberships
after insert or update or delete on public.user_org_memberships
for each row execute function public._touch_permission_keys_cache_refresh();

create or replace function public._safe_my_permission_keys_json(
  p_org_id uuid,
  p_timeout_ms integer default 1200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prev_timeout text;
  v_keys jsonb := '[]'::jsonb;
  v_cached jsonb;
  v_timeout_ms integer := greatest(200, least(coalesce(p_timeout_ms, 1200), 5000));
begin
  if p_org_id is null or v_uid is null then
    return '[]'::jsonb;
  end if;

  select c.permission_keys
    into v_cached
  from public.user_permission_keys_cache c
  where c.user_id = v_uid
    and c.org_id = p_org_id
    and c.expires_at > now();

  if found then
    return coalesce(v_cached, '[]'::jsonb);
  end if;

  v_prev_timeout := current_setting('statement_timeout', true);
  perform set_config('statement_timeout', v_timeout_ms::text || 'ms', true);

  begin
    select coalesce(jsonb_agg(gmp.permission_key), '[]'::jsonb)
      into v_keys
    from public.get_my_permissions(p_org_id) gmp;
  exception
    when query_canceled then
      v_keys := '[]'::jsonb;
    when others then
      v_keys := '[]'::jsonb;
  end;

  if coalesce(v_prev_timeout, '') = '' then
    perform set_config('statement_timeout', '0', true);
  else
    perform set_config('statement_timeout', v_prev_timeout, true);
  end if;

  return coalesce(v_keys, '[]'::jsonb);
end;
$$;

grant execute on function public._safe_my_permission_keys_json(uuid, integer) to authenticated;
