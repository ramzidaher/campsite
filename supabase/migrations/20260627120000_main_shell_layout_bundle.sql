-- Collapses the main app shell layout from 3 sequential DB round trips into 1.
--
-- Previously the layout made:
--   Round 1: profiles + main_shell_top_bar_counts_bundle
--   Round 2: organisations + user_departments + pending_approvals_nav_count
--            + countPendingBroadcastApprovalsForViewer + get_my_permissions
--   Round 3: leave_pending_approval_count_for_me + performance_reviews
--            + onboarding_runs + rota_change_requests + recruitment_requests_pending_review_count
--
-- Each round depends on results from the previous, so on Vercel → Frankfurt Supabase
-- (~150ms per round trip) this stacks to 450ms+ of pure network latency per page load.
-- This function executes all of that work in a single HTTP call to the DB.

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

  -- Resolve profile (org_id + role needed by sub-queries below)
  select p.org_id, p.role
  into   v_org_id, v_role
  from   public.profiles p
  where  p.id = v_uid;

  -- Email from auth schema (accessible in security-definer context)
  select au.email into v_email
  from   auth.users au
  where  au.id = v_uid;

  -- Authenticated but no completed profile / org assignment yet
  if v_org_id is null then
    return jsonb_build_object(
      'authenticated', true,
      'has_profile',   (v_role is not null),
      'email',         v_email
    );
  end if;

  -- Full bundle: profile + org + dept + permissions + all badge counts in one shot
  return (
    select jsonb_build_object(
      'authenticated',        true,
      'has_profile',          true,
      'email',                v_email,

      -- ── Profile ────────────────────────────────────────────────────────
      'profile_role',         p.role,
      'profile_full_name',    p.full_name,
      'profile_avatar_url',   p.avatar_url,
      'profile_status',       p.status,
      'org_id',               p.org_id::text,

      -- ── Organisation ───────────────────────────────────────────────────
      'org_name',             coalesce(o.name, 'Organisation'),
      'org_logo_url',         o.logo_url,

      -- ── Department (first membership) ──────────────────────────────────
      'dept_name', (
        select d.name
        from   public.user_departments ud
        join   public.departments d on d.id = ud.dept_id
        where  ud.user_id = v_uid
        limit  1
      ),

      -- ── Permissions ────────────────────────────────────────────────────
      'permission_keys', (
        select coalesce(jsonb_agg(gmp.permission_key), '[]'::jsonb)
        from   public.get_my_permissions(v_org_id) gmp
      ),

      -- ── Broadcast unread ───────────────────────────────────────────────
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

      -- ── Broadcast pending approvals ────────────────────────────────────
      -- Mirrors countPendingBroadcastApprovalsForViewer:
      --   org_admin / super_admin → org-wide; manager → their departments only.
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

      -- ── Notification unreads ───────────────────────────────────────────
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

      -- ── Action-required counts ─────────────────────────────────────────
      -- Each delegated function already has its own internal permission gate.
      'pending_approvals',        public.pending_approvals_nav_count(),
      'leave_pending_approval',   public.leave_pending_approval_count_for_me(),
      'recruitment_pending_review', public.recruitment_requests_pending_review_count(),

      -- Performance reviews awaiting this user's write-up
      'performance_pending', (
        select count(*)::integer
        from   public.performance_reviews pr
        where  pr.reviewer_id = v_uid
          and  pr.status = 'self_submitted'
      ),

      -- Active onboarding runs assigned to this user
      'onboarding_active', (
        select count(*)::integer
        from   public.onboarding_runs r
        where  r.user_id = v_uid
          and  r.status = 'active'
      ),

      -- Rota: final-approval gate checked inline to avoid unnecessary scan
      'rota_pending_final', case
        when public.has_permission(v_uid, v_org_id, 'rota.final_approve', '{}'::jsonb) then (
          select count(*)::integer
          from   public.rota_change_requests rcr
          where  rcr.org_id = v_org_id
            and  rcr.status = 'pending_final'
        )
        else 0
      end,

      -- Rota: peer-swap requests directed at this specific user (no permission gate needed)
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
