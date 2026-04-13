-- Tenant governance: profile re-auth after org force-logout, extend main_shell_layout_bundle,
-- and propagate force-logout to member profiles (excluding platform_admins).

alter table public.profiles
  add column if not exists reauth_required_at timestamptz;

comment on column public.profiles.reauth_required_at is
  'When set, client must sign out so the user re-authenticates (org force-logout). Cleared after fresh sign-in.';

create or replace function public.profile_clear_reauth_required()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.profiles
  set reauth_required_at = null
  where id = auth.uid();
end;
$$;

revoke all on function public.profile_clear_reauth_required() from public;
grant execute on function public.profile_clear_reauth_required() to authenticated;

-- Extend governance RPC: set reauth_required_at on all org members when founder forces logout (not platform admins).
create or replace function public.platform_update_org_governance(
  p_org_id uuid,
  p_plan_tier text,
  p_subscription_status text,
  p_is_locked boolean,
  p_maintenance_mode boolean,
  p_force_logout boolean default false,
  p_trial_ends_at timestamptz default null,
  p_clear_trial boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_o public.organisations%rowtype;
  v_new_status text;
begin
  if not public.platform_is_founder(auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into strict v_o from public.organisations where id = p_org_id;

  select jsonb_build_object(
    'plan_tier', v_o.plan_tier,
    'subscription_status', v_o.subscription_status,
    'is_locked', v_o.is_locked,
    'maintenance_mode', v_o.maintenance_mode,
    'force_logout_after', v_o.force_logout_after,
    'subscription_trial_started_at', v_o.subscription_trial_started_at,
    'subscription_trial_ends_at', v_o.subscription_trial_ends_at
  )
  into v_before;

  v_new_status := case
    when p_subscription_status in ('trial', 'active', 'limited', 'suspended') then p_subscription_status
    else v_o.subscription_status
  end;

  update public.organisations o
  set
    plan_tier = coalesce(nullif(trim(coalesce(p_plan_tier, '')), ''), o.plan_tier),
    subscription_status = v_new_status,
    is_locked = coalesce(p_is_locked, o.is_locked),
    maintenance_mode = coalesce(p_maintenance_mode, o.maintenance_mode),
    force_logout_after = case when coalesce(p_force_logout, false) then now() else o.force_logout_after end,
    subscription_trial_started_at = case
      when p_clear_trial then null
      when p_trial_ends_at is not null then coalesce(v_o.subscription_trial_started_at, now())
      when v_new_status = 'trial' and v_o.subscription_trial_started_at is null then now()
      else v_o.subscription_trial_started_at
    end,
    subscription_trial_ends_at = case
      when p_clear_trial then null
      when p_trial_ends_at is not null then p_trial_ends_at
      when v_new_status = 'trial' and v_o.subscription_trial_ends_at is null and p_trial_ends_at is null
        then now() + interval '14 days'
      else v_o.subscription_trial_ends_at
    end
  where o.id = p_org_id;

  if coalesce(p_force_logout, false) then
    update public.profiles pr
    set reauth_required_at = now()
    where pr.org_id = p_org_id
      and not exists (select 1 from public.platform_admins pa where pa.user_id = pr.id);
  end if;

  insert into public.platform_audit_events (
    actor_user_id, org_id, event_type, entity_type, entity_id, before_state, after_state, metadata
  )
  select
    auth.uid(),
    o.id,
    'org.governance_updated',
    'organisation',
    o.id::text,
    coalesce(v_before, '{}'::jsonb),
    jsonb_build_object(
      'plan_tier', o.plan_tier,
      'subscription_status', o.subscription_status,
      'is_locked', o.is_locked,
      'maintenance_mode', o.maintenance_mode,
      'force_logout_after', o.force_logout_after,
      'subscription_trial_started_at', o.subscription_trial_started_at,
      'subscription_trial_ends_at', o.subscription_trial_ends_at
    ),
    jsonb_build_object(
      'force_logout_triggered', coalesce(p_force_logout, false),
      'trial_cleared', coalesce(p_clear_trial, false)
    )
  from public.organisations o
  where o.id = p_org_id;
end;
$$;

revoke all on function public.platform_update_org_governance(uuid, text, text, boolean, boolean, boolean, timestamptz, boolean) from public;
grant execute on function public.platform_update_org_governance(uuid, text, text, boolean, boolean, boolean, timestamptz, boolean) to authenticated, service_role;

-- Shell bundle: governance fields + platform operator flag + re-auth marker for clients.
create or replace function public.main_shell_layout_bundle()
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

      'broadcast_unread', (
        select count(*)::integer
        from   public.broadcasts b
        where  b.status = 'sent'
          and  public.broadcast_visible_to_reader(b)
          and  not exists (
                 select 1
                 from   public.broadcast_reads r
                 where  r.broadcast_id = b.id
                   and  r.user_id = v_uid
               )
      ),

      'broadcast_pending_approvals', case
        when p.role = 'manager' then (
          select count(*)::integer
          from   public.broadcasts b
          join   public.dept_managers dm on dm.dept_id = b.dept_id
                                        and dm.user_id = v_uid
          where  b.status = 'pending_approval'
            and  b.org_id = v_org_id
        )
        when p.role in ('org_admin', 'super_admin') then (
          select count(*)::integer
          from   public.broadcasts b
          where  b.status = 'pending_approval'
            and  b.org_id = v_org_id
        )
        else 0
      end,

      'recruitment_notifications', (
        select count(*)::integer
        from   public.recruitment_notifications
        where  recipient_id = v_uid and read_at is null
      ),
      'application_notifications', (
        select count(*)::integer
        from   public.application_notifications
        where  recipient_id = v_uid and read_at is null
      ),
      'leave_notifications', (
        select count(*)::integer
        from   public.leave_notifications
        where  recipient_id = v_uid and read_at is null
      ),
      'hr_metric_notifications', (
        select count(*)::integer
        from   public.hr_metric_notifications
        where  recipient_id = v_uid and read_at is null
      ),

      'pending_approvals',        public.pending_approvals_nav_count(),
      'leave_pending_approval',   public.leave_pending_approval_count_for_me(),
      'recruitment_pending_review', public.recruitment_requests_pending_review_count(),

      'performance_pending', (
        select count(*)::integer
        from   public.performance_reviews pr
        where  pr.reviewer_id = v_uid
          and  pr.status = 'self_submitted'
      ),

      'onboarding_active', (
        select count(*)::integer
        from   public.onboarding_runs r
        where  r.user_id = v_uid
          and  r.status = 'active'
      ),

      'rota_pending_final', case
        when public.has_permission(v_uid, v_org_id, 'rota.final_approve', '{}'::jsonb) then (
          select count(*)::integer
          from   public.rota_change_requests rcr
          where  rcr.org_id = v_org_id
            and  rcr.status = 'pending_final'
        )
        else 0
      end,

      'rota_pending_peer', (
        select count(*)::integer
        from   public.rota_change_requests rcr
        where  rcr.org_id               = v_org_id
          and  rcr.counterparty_user_id = v_uid
          and  rcr.status               = 'pending_peer'
      )
    )
    from   public.profiles p
    left join public.organisations o on o.id = p.org_id
    where  p.id = v_uid
  );
end;
$$;

revoke all   on function public.main_shell_layout_bundle() from public;
grant execute on function public.main_shell_layout_bundle() to authenticated;
