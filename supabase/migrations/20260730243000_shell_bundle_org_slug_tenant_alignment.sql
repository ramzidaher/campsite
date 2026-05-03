-- Expose organisation slug in shell bundles so the web app can align the tenant
-- subdomain (x-campsite-org-slug) with profiles.org_id without an extra round trip.

create or replace function public.main_shell_layout_bundle()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_org_id        uuid;
  v_role          text;
  v_email         text;
  v_cached        public.user_badge_counters%rowtype;
  v_have_counters boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('authenticated', false, 'has_profile', false);
  end if;

  select p.org_id, p.role
  into   v_org_id, v_role
  from   public.profiles p
  where  p.id = v_uid;

  select au.email into v_email
  from   auth.users au
  where  au.id = v_uid;

  if v_org_id is null then
    return jsonb_build_object(
      'authenticated', true,
      'has_profile',   (v_role is not null),
      'email',         v_email
    );
  end if;

  select * into v_cached
  from   public.user_badge_counters ubc
  where  ubc.user_id = v_uid;

  v_have_counters := found;

  if not v_have_counters then
    perform public.enqueue_badge_counter_recalc_for_user(v_uid, 'missing_bundle_read');
  end if;

  return (
    select jsonb_build_object(
      'authenticated',        true,
      'has_profile',          true,
      'email',                v_email,

      'profile_role',         p.role,
      'profile_full_name',    p.full_name,
      'profile_avatar_url',   p.avatar_url,
      'profile_status',       p.status,
      'org_id',               p.org_id::text,

      'org_name',             coalesce(o.name, 'Organisation'),
      'org_logo_url',         o.logo_url,
      'org_slug',             o.slug,

      'dept_name', (
        select d.name
        from   public.user_departments ud
        join   public.departments d on d.id = ud.dept_id
        where  ud.user_id = v_uid
        limit  1
      ),

      'permission_keys', public._safe_my_permission_keys_json(v_org_id, 1200),

      'timesheet_clock_enabled', coalesce((
        select e.timesheet_clock_enabled
        from   public.employee_hr_records e
        where  e.org_id = p.org_id
          and  e.user_id = v_uid
        limit  1
      ), false),

      'broadcast_unread',              coalesce(v_cached.broadcast_unread, 0),
      'broadcast_pending_approvals',   coalesce(v_cached.broadcast_pending_approvals, 0),
      'recruitment_notifications',     coalesce(v_cached.recruitment_notifications, 0),
      'application_notifications',     coalesce(v_cached.application_notifications, 0),
      'leave_notifications',           coalesce(v_cached.leave_notifications, 0),
      'hr_metric_notifications',       coalesce(v_cached.hr_metric_notifications, 0),
      'calendar_event_notifications',  coalesce(v_cached.calendar_event_notifications, 0),
      'pending_approvals',             coalesce(v_cached.pending_approvals, 0),
      'leave_pending_approval',        coalesce(v_cached.leave_pending_approval, 0),
      'recruitment_pending_review',    coalesce(v_cached.recruitment_pending_review, 0),
      'performance_pending',           coalesce(v_cached.performance_pending, 0),
      'onboarding_active',             coalesce(v_cached.onboarding_active, 0),
      'rota_pending_final',            coalesce(v_cached.rota_pending_final, 0),
      'rota_pending_peer',             coalesce(v_cached.rota_pending_peer, 0)
    )
    from   public.profiles p
    left join public.organisations o on o.id = p.org_id
    where  p.id = v_uid
  );
end;
$$;

revoke all    on function public.main_shell_layout_bundle() from public;
grant execute on function public.main_shell_layout_bundle() to authenticated;

create or replace function public.main_shell_layout_structural()
returns jsonb
language plpgsql
stable
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
  v_accent_preset text;
  v_color_scheme text;
  v_dnd_enabled boolean;
  v_dnd_start time;
  v_dnd_end time;
  v_org_name text;
  v_org_slug text;
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
    p.accent_preset,
    p.color_scheme,
    p.dnd_enabled,
    p.dnd_start,
    p.dnd_end,
    o.name,
    o.slug,
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
    v_accent_preset,
    v_color_scheme,
    v_dnd_enabled,
    v_dnd_start,
    v_dnd_end,
    v_org_name,
    v_org_slug,
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
    'org_slug', v_org_slug,
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
    'timesheet_clock_enabled', coalesce((
      select e.timesheet_clock_enabled
      from   public.employee_hr_records e
      where  e.org_id = v_org_id
        and  e.user_id = v_uid
      limit  1
    ), false),
    'celebration_mode', v_celebration_mode,
    'celebration_auto_enabled', v_celebration_auto,
    'ui_mode', v_ui_mode,
    'profile_accent_preset', coalesce(nullif(trim(v_accent_preset), ''), 'midnight'),
    'profile_color_scheme', coalesce(nullif(trim(v_color_scheme), ''), 'system'),
    'profile_dnd_enabled', coalesce(v_dnd_enabled, false),
    'profile_dnd_start', case when v_dnd_start is null then null else to_char(v_dnd_start, 'HH24:MI') end,
    'profile_dnd_end', case when v_dnd_end is null then null else to_char(v_dnd_end, 'HH24:MI') end,
    'org_celebration_mode_overrides', public._safe_org_celebration_modes_json(v_org_id, 400)
  );
end;
$$;

revoke all   on function public.main_shell_layout_structural() from public;
grant execute on function public.main_shell_layout_structural() to authenticated;
