-- Fix: main_shell_layout_bundle was recomputing all badge counts inline on every
-- request (broadcast_visible_to_reader per-row scan, has_permission joins, etc.)
-- and calling get_my_permissions() without any timeout protection.
--
-- Two changes:
--   1. permission_keys now uses _safe_my_permission_keys_json (1200ms fail-soft).
--      Previously a slow permission query would stall the whole RPC, hit the
--      app-level 1500ms timeout, and cache an empty bundle for 10s — making the
--      user look like a member with no modules.
--
--   2. All badge/count fields now read from user_badge_counters (a single PK
--      lookup) instead of recomputing inline. The broadcast_visible_to_reader
--      per-row function call and the unconditional has_permission rota check
--      were the main sources of tail latency on Nano.

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

  -- Single PK lookup replaces all the inline count subqueries.
  select * into v_cached
  from   public.user_badge_counters ubc
  where  ubc.user_id = v_uid;

  v_have_counters := found;

  if not v_have_counters then
    -- No row yet — kick off an async recalc and return zeros for now.
    perform public.enqueue_badge_counter_recalc_for_user(v_uid, 'missing_bundle_read');
  end if;

  return (
    select jsonb_build_object(
      'authenticated',        true,
      'has_profile',          true,
      'email',                v_email,

      -- ── Profile ────────────────────────────────────────────────────────────
      'profile_role',         p.role,
      'profile_full_name',    p.full_name,
      'profile_avatar_url',   p.avatar_url,
      'profile_status',       p.status,
      'org_id',               p.org_id::text,

      -- ── Organisation ───────────────────────────────────────────────────────
      'org_name',             coalesce(o.name, 'Organisation'),
      'org_logo_url',         o.logo_url,

      -- ── Department ─────────────────────────────────────────────────────────
      'dept_name', (
        select d.name
        from   public.user_departments ud
        join   public.departments d on d.id = ud.dept_id
        where  ud.user_id = v_uid
        limit  1
      ),

      -- ── Permissions (fail-soft: returns [] on timeout, never stalls RPC) ───
      'permission_keys', public._safe_my_permission_keys_json(v_org_id, 1200),

      -- ── Badge counts from cache (single row read, no inline recompute) ─────
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
