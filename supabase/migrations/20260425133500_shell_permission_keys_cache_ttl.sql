-- Nano-safe optimization:
-- Add a short-lived cache for shell permission_keys hydration to reduce
-- repeated get_my_permissions() work on shell cache misses.

create table if not exists public.user_shell_permission_keys_cache (
  user_id uuid not null,
  org_id uuid not null,
  permission_keys jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, org_id)
);

create index if not exists user_shell_permission_keys_cache_expires_idx
  on public.user_shell_permission_keys_cache (expires_at);

alter table public.user_shell_permission_keys_cache enable row level security;

revoke all on table public.user_shell_permission_keys_cache from public, anon, authenticated;
grant all on table public.user_shell_permission_keys_cache to service_role;

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
  v_ttl interval := interval '45 seconds';
begin
  if p_org_id is null or v_uid is null then
    return '[]'::jsonb;
  end if;

  select c.permission_keys
    into v_cached
  from public.user_shell_permission_keys_cache c
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

  insert into public.user_shell_permission_keys_cache as c (
    user_id,
    org_id,
    permission_keys,
    computed_at,
    expires_at
  )
  values (
    v_uid,
    p_org_id,
    coalesce(v_keys, '[]'::jsonb),
    now(),
    now() + v_ttl
  )
  on conflict (user_id, org_id) do update
    set permission_keys = excluded.permission_keys,
        computed_at = excluded.computed_at,
        expires_at = excluded.expires_at;

  return coalesce(v_keys, '[]'::jsonb);
end;
$$;

grant execute on function public._safe_my_permission_keys_json(uuid, integer) to authenticated;
