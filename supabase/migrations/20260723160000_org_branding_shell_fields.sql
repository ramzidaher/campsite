-- Org-level white-label branding settings for shell-first rollout.

alter table public.organisations
  add column if not exists brand_preset_key text,
  add column if not exists brand_tokens jsonb not null default '{}'::jsonb,
  add column if not exists brand_policy text not null default 'brand_base_with_celebration_accents',
  add column if not exists brand_updated_at timestamptz,
  add column if not exists brand_updated_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organisations_brand_policy_check'
  ) then
    alter table public.organisations
      add constraint organisations_brand_policy_check
      check (
        brand_policy in (
          'celebration_overrides_brand',
          'brand_base_with_celebration_accents',
          'brand_overrides_celebration'
        )
      );
  end if;
end $$;

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
      'email',         v_email,
      'is_platform_operator', public.is_platform_admin()
    );
  end if;

  return (
    select jsonb_build_object(
      'authenticated',        true,
      'has_profile',          true,
      'email',                v_email,

      'is_platform_operator', public.is_platform_admin(),

      'profile_role',         p.role,
      'profile_full_name',    p.full_name,
      'profile_avatar_url',   p.avatar_url,
      'profile_status',       p.status,
      'org_id',               p.org_id::text,

      'profile_reauth_required_at', p.reauth_required_at,

      'org_name',             coalesce(o.name, 'Organisation'),
      'org_logo_url',         o.logo_url,
      'org_is_locked',        coalesce(o.is_locked, false),
      'org_maintenance_mode', coalesce(o.maintenance_mode, false),
      'org_subscription_status', o.subscription_status,
      'org_subscription_trial_ends_at', o.subscription_trial_ends_at,
      'org_force_logout_after', o.force_logout_after,
      'org_brand_preset_key', o.brand_preset_key,
      'org_brand_tokens', coalesce(o.brand_tokens, '{}'::jsonb),
      'org_brand_policy', coalesce(o.brand_policy, 'brand_base_with_celebration_accents'),

      'dept_name', (
        select d.name
        from   public.user_departments ud
        join   public.departments d on d.id = ud.dept_id
        where  ud.user_id = v_uid
        limit  1
      ),

      'permission_keys', (
        select coalesce(jsonb_agg(gmp.permission_key), '[]'::jsonb)
        from   public.get_my_permissions(v_org_id) gmp
      ),

      'celebration_mode', p.celebration_mode,
      'celebration_auto_enabled', p.celebration_auto_enabled
    )
    from   public.profiles p
    left join public.organisations o on o.id = p.org_id
    where  p.id = v_uid
  );
end;
$$;

revoke all on function public.main_shell_layout_structural() from public;
grant execute on function public.main_shell_layout_structural() to authenticated;

