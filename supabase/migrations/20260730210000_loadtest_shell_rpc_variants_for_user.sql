-- Load-test-only shell RPC variants that accept explicit user context.
-- These are used by /api/loadtest/shell-bundle-internal to avoid relying on auth.uid().

create or replace function public.main_shell_layout_structural_for_user(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := p_user_id;
  v_org_id uuid;
  v_role   text;
  v_email  text;
  v_full_name text;
  v_avatar_url text;
  v_status text;
  v_reauth timestamptz;
  v_celebration_mode text;
  v_celebration_auto boolean;
  v_ui_mode text;
  v_org_name text;
  v_org_logo_url text;
  v_org_is_locked boolean;
  v_org_maintenance boolean;
  v_org_sub_status text;
  v_org_trial_ends timestamptz;
  v_org_force_logout timestamptz;
  v_org_brand_preset text;
  v_org_brand_tokens jsonb;
  v_org_brand_policy text;
  v_is_platform boolean;
begin
  if v_uid is null then
    return jsonb_build_object('authenticated', false, 'has_profile', false);
  end if;

  select
    p.org_id,
    p.role,
    au.email,
    p.full_name,
    p.avatar_url,
    p.status,
    p.reauth_required_at,
    p.celebration_mode,
    p.celebration_auto_enabled,
    p.ui_mode,
    o.name,
    o.logo_url,
    o.is_locked,
    o.maintenance_mode,
    o.subscription_status,
    o.subscription_trial_ends_at,
    o.force_logout_after,
    o.brand_preset_key,
    o.brand_tokens,
    o.brand_policy
  into
    v_org_id,
    v_role,
    v_email,
    v_full_name,
    v_avatar_url,
    v_status,
    v_reauth,
    v_celebration_mode,
    v_celebration_auto,
    v_ui_mode,
    v_org_name,
    v_org_logo_url,
    v_org_is_locked,
    v_org_maintenance,
    v_org_sub_status,
    v_org_trial_ends,
    v_org_force_logout,
    v_org_brand_preset,
    v_org_brand_tokens,
    v_org_brand_policy
  from public.profiles p
  left join auth.users au on au.id = p.id
  left join public.organisations o on o.id = p.org_id
  where p.id = v_uid;

  if not found then
    select au.email into v_email
    from auth.users au
    where au.id = v_uid;

    return jsonb_build_object(
      'authenticated', true,
      'has_profile', false,
      'email', v_email,
      'is_platform_operator', false
    );
  end if;

  -- For load-test diagnostics we don't infer platform founder status from request JWT context.
  v_is_platform := false;

  if v_org_id is null then
    return jsonb_build_object(
      'authenticated', true,
      'has_profile', (v_role is not null),
      'email', v_email,
      'is_platform_operator', v_is_platform
    );
  end if;

  return jsonb_build_object(
    'authenticated', true,
    'has_profile', true,
    'email', v_email,
    'is_platform_operator', v_is_platform,
    'profile_role', v_role,
    'profile_full_name', v_full_name,
    'profile_avatar_url', v_avatar_url,
    'profile_status', v_status,
    'org_id', v_org_id::text,
    'profile_reauth_required_at', v_reauth,
    'org_name', coalesce(v_org_name, 'Organisation'),
    'org_logo_url', v_org_logo_url,
    'org_is_locked', coalesce(v_org_is_locked, false),
    'org_maintenance_mode', coalesce(v_org_maintenance, false),
    'org_subscription_status', v_org_sub_status,
    'org_subscription_trial_ends_at', v_org_trial_ends,
    'org_force_logout_after', v_org_force_logout,
    'org_brand_preset_key', v_org_brand_preset,
    'org_brand_tokens', coalesce(v_org_brand_tokens, '{}'::jsonb),
    'org_brand_policy', coalesce(v_org_brand_policy, 'brand_base_with_celebration_accents'),
    'dept_name', public._safe_dept_name_text(v_uid, 400),
    'permission_keys', public._safe_my_permission_keys_json(v_org_id, 1200),
    'celebration_mode', v_celebration_mode,
    'celebration_auto_enabled', v_celebration_auto,
    'ui_mode', v_ui_mode,
    'org_celebration_mode_overrides', public._safe_org_celebration_modes_json(v_org_id, 400)
  );
end;
$$;

revoke all on function public.main_shell_layout_structural_for_user(uuid) from public, anon, authenticated;
grant execute on function public.main_shell_layout_structural_for_user(uuid) to service_role;

create or replace function public.main_shell_badge_counts_bundle_for_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid                  uuid := p_user_id;
  v_org_id               uuid;
  v_cached               public.user_badge_counters%rowtype;
  v_result               jsonb := '{}'::jsonb;
  v_broadcast_enabled    boolean;
  v_approvals_enabled    boolean;
  v_scheduling_enabled   boolean;
  v_have_counters        boolean := false;
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select p.org_id into v_org_id
  from public.profiles p
  where p.id = v_uid;

  if v_org_id is null then
    return '{}'::jsonb;
  end if;

  select * into v_cached
  from public.user_badge_counters ubc
  where ubc.user_id = v_uid;

  v_have_counters := found;

  if not v_have_counters then
    perform public.enqueue_badge_counter_recalc_for_user(v_uid, 'missing_shell_read');
    return '{}'::jsonb;
  end if;

  v_result := public._badge_counts_json_from_row(v_cached);

  select
    coalesce(f.broadcast_enabled, true),
    coalesce(f.approvals_enabled, true),
    coalesce(f.scheduling_enabled, true)
    into v_broadcast_enabled, v_approvals_enabled, v_scheduling_enabled
  from public.shell_counter_rollout_flags f
  where f.org_id = v_org_id;

  if not found then
    v_broadcast_enabled  := true;
    v_approvals_enabled  := true;
    v_scheduling_enabled := true;
  end if;

  if not v_broadcast_enabled then
    v_result := jsonb_set(v_result, '{broadcast_unread}',
      coalesce(v_result -> 'broadcast_unread', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{broadcast_pending_approvals}',
      coalesce(v_result -> 'broadcast_pending_approvals', '0'::jsonb), true);
  end if;

  if not v_approvals_enabled then
    v_result := jsonb_set(v_result, '{pending_approvals}',
      coalesce(v_result -> 'pending_approvals', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{leave_pending_approval}',
      coalesce(v_result -> 'leave_pending_approval', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{recruitment_pending_review}',
      coalesce(v_result -> 'recruitment_pending_review', '0'::jsonb), true);
  end if;

  if not v_scheduling_enabled then
    v_result := jsonb_set(v_result, '{rota_pending_final}',
      coalesce(v_result -> 'rota_pending_final', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{rota_pending_peer}',
      coalesce(v_result -> 'rota_pending_peer', '0'::jsonb), true);
  end if;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.main_shell_badge_counts_bundle_for_user(uuid) from public, anon, authenticated;
grant execute on function public.main_shell_badge_counts_bundle_for_user(uuid) to service_role;

