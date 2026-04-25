-- Fix regression: main_shell_layout_structural writes to enqueue queue, so it
-- must be VOLATILE (STABLE disallows writes and causes RPC 500s).

create or replace function public.main_shell_layout_structural()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
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
  v_aux public.user_shell_structural_aux%rowtype;
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
      'is_platform_operator', public.is_platform_admin()
    );
  end if;

  v_is_platform := public.is_platform_admin();

  if v_org_id is null then
    return jsonb_build_object(
      'authenticated', true,
      'has_profile', (v_role is not null),
      'email', v_email,
      'is_platform_operator', v_is_platform
    );
  end if;

  select *
    into v_aux
  from public.user_shell_structural_aux a
  where a.user_id = v_uid;

  if not found then
    perform public.enqueue_shell_structural_aux_recalc_for_user(v_uid, 'missing_structural_aux');
    v_aux.dept_name := null;
    v_aux.permission_keys := '[]'::jsonb;
    v_aux.org_celebration_mode_overrides := '[]'::jsonb;
  elsif v_aux.computed_at < (now() - interval '180 seconds') then
    perform public.enqueue_shell_structural_aux_recalc_for_user(v_uid, 'stale_structural_aux');
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
    'dept_name', v_aux.dept_name,
    'permission_keys', coalesce(v_aux.permission_keys, '[]'::jsonb),
    'celebration_mode', v_celebration_mode,
    'celebration_auto_enabled', v_celebration_auto,
    'ui_mode', v_ui_mode,
    'org_celebration_mode_overrides', coalesce(v_aux.org_celebration_mode_overrides, '[]'::jsonb)
  );
end;
$$;
