-- Lightweight badge-counts-only companion to main_shell_layout_bundle.
--
-- Called by the client-side useShellBadgeCounts React-Query hook, which polls
-- every 60 s and refetches on window focus. This replaces the previous
-- router.refresh() every 3 s (= full server re-render + full layout RPC),
-- which at 300 users/org × 100 orgs would generate ~10 000 DB calls/second.
--
-- What this does NOT return (those are structural, fetched once per navigation):
--   profile, org info, department, permission_keys

create or replace function public.main_shell_badge_counts_bundle()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_org_id uuid;
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select p.org_id into v_org_id
  from   public.profiles p
  where  p.id = v_uid;

  if v_org_id is null then
    return '{}'::jsonb;
  end if;

  return (
    select jsonb_build_object(
      -- ── Broadcast ──────────────────────────────────────────────────────
      'broadcast_unread', (
        select count(*)::integer
        from   public.broadcasts b
        where  b.status = 'sent'
          and  public.broadcast_visible_to_reader(b)
          and  not exists (
                 select 1 from public.broadcast_reads r
                 where  r.broadcast_id = b.id and r.user_id = v_uid
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

      -- ── Notification unreads ───────────────────────────────────────────
      'recruitment_notifications', (
        select count(*)::integer from public.recruitment_notifications
        where  recipient_id = v_uid and read_at is null
      ),
      'application_notifications', (
        select count(*)::integer from public.application_notifications
        where  recipient_id = v_uid and read_at is null
      ),
      'leave_notifications', (
        select count(*)::integer from public.leave_notifications
        where  recipient_id = v_uid and read_at is null
      ),
      'hr_metric_notifications', (
        select count(*)::integer from public.hr_metric_notifications
        where  recipient_id = v_uid and read_at is null
      ),

      -- ── Action-required counts (each has its own internal permission gate) ──
      'pending_approvals',          public.pending_approvals_nav_count(),
      'leave_pending_approval',     public.leave_pending_approval_count_for_me(),
      'recruitment_pending_review', public.recruitment_requests_pending_review_count(),

      -- ── Other nav badges ───────────────────────────────────────────────
      'performance_pending', (
        select count(*)::integer
        from   public.performance_reviews pr
        where  pr.reviewer_id = v_uid
          and  pr.status = 'self_submitted'
      ),
      'onboarding_active', (
        select count(*)::integer
        from   public.onboarding_runs r
        where  r.user_id = v_uid and r.status = 'active'
      ),
      'rota_pending_final', case
        when public.has_permission(v_uid, v_org_id, 'rota.final_approve', '{}'::jsonb) then (
          select count(*)::integer
          from   public.rota_change_requests rcr
          where  rcr.org_id = v_org_id and rcr.status = 'pending_final'
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
    where  p.id = v_uid
  );
end;
$$;

revoke all   on function public.main_shell_badge_counts_bundle() from public;
grant execute on function public.main_shell_badge_counts_bundle() to authenticated;
