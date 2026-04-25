-- Revert cache-write path inside _safe_my_permission_keys_json.
-- main_shell_layout_bundle executes in a read-only transaction context and
-- cannot perform INSERT/UPDATE side effects.

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
  v_prev_timeout text;
  v_keys jsonb := '[]'::jsonb;
  v_timeout_ms integer := greatest(200, least(coalesce(p_timeout_ms, 1200), 5000));
begin
  if p_org_id is null then
    return '[]'::jsonb;
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
