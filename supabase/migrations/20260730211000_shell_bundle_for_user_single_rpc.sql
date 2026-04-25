-- Load-test helper: single merged shell RPC by explicit user id.
-- Mirrors main_shell_layout_bundle(), but for service-role internal load tests.

create or replace function public.main_shell_layout_bundle_for_user(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce(public.main_shell_layout_structural_for_user(p_user_id), '{}'::jsonb)
      || coalesce(public.main_shell_badge_counts_bundle_for_user(p_user_id), '{}'::jsonb);
end;
$$;

revoke all on function public.main_shell_layout_bundle_for_user(uuid) from public, anon, authenticated;
grant execute on function public.main_shell_layout_bundle_for_user(uuid) to service_role;
