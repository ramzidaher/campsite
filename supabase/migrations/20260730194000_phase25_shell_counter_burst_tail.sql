-- Phase 2.5 burst-tail stabilization:
-- - Stale read-model rows: enqueue background recompute instead of synchronous refresh on shell reads.
-- - refresh_user_badge_counters: pg_try_advisory_xact_lock per user so concurrent callers return cache or enqueue.
-- - pg_cron (when extension present): minute scheduler drains badge_counter_recalc_queue in batches.
-- Repo: main_shell_layout_bundle remains thin (structural || badges) after 20260720120000_shell_structural_parallel.sql.

create or replace function public.refresh_user_badge_counters(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid                  uuid := p_user_id;
  v_org_id               uuid;
  v_role                 text;
  v_status               text;
  v_can_recruitment      boolean := false;
  v_can_rota_final       boolean := false;
  v_can_leave_manage_org boolean := false;
  v_can_leave_reports    boolean := false;
  v_can_review_members   boolean := false;
  v_pending_profiles     integer := 0;
  v_pending_rota_nav     integer := 0;
  v_pending_leave        integer := 0;
  v_pending_toil         integer := 0;
  v_broadcast_unread     integer := 0;
  v_broadcast_pending    integer := 0;
  v_recruitment_notif    integer := 0;
  v_application_notif    integer := 0;
  v_leave_notif          integer := 0;
  v_hr_metric_notif      integer := 0;
  v_calendar_notif       integer := 0;
  v_recruitment_pending  integer := 0;
  v_performance_pending  integer := 0;
  v_onboarding_active    integer := 0;
  v_rota_pending_final   integer := 0;
  v_rota_pending_peer    integer := 0;
  v_result               jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select p.org_id, p.role, p.status
    into v_org_id, v_role, v_status
  from public.profiles p
  where p.id = v_uid;

  if v_org_id is null then
    return '{}'::jsonb;
  end if;

  -- Phase 2.5: at most one concurrent full recompute per user (transaction-scoped lock).
  if not pg_try_advisory_xact_lock(44201, hashtext(v_uid::text)) then
    select public._badge_counts_json_from_row(ubc)
      into v_result
    from public.user_badge_counters ubc
    where ubc.user_id = v_uid;
    if found then
      return coalesce(v_result, '{}'::jsonb);
    end if;
    perform public.enqueue_badge_counter_recalc_for_user(v_uid, 'refresh_contended');
    return '{}'::jsonb;
  end if;

  v_can_recruitment :=
    public.has_permission(v_uid, v_org_id, 'recruitment.approve_request', '{}'::jsonb)
    or public.has_permission(v_uid, v_org_id, 'recruitment.manage', '{}'::jsonb);

  v_can_rota_final :=
    public.has_permission(v_uid, v_org_id, 'rota.final_approve', '{}'::jsonb);

  v_can_leave_manage_org :=
    public.has_permission(v_uid, v_org_id, 'leave.manage_org', '{}'::jsonb);

  v_can_leave_reports :=
    public.has_permission(v_uid, v_org_id, 'leave.approve_direct_reports', '{}'::jsonb);

  v_can_review_members :=
    public.has_permission(v_uid, v_org_id, 'approvals.members.review', '{}'::jsonb);

  if v_status = 'active' and v_can_review_members then
    select count(*)::int
      into v_pending_profiles
    from public.profiles pt
    where pt.org_id = v_org_id
      and pt.status = 'pending';
  end if;

  select count(*)::int
    into v_pending_rota_nav
  from public.rota_change_requests r
  where r.org_id = v_org_id
    and r.status = 'pending_final'
    and v_status = 'active'
    and v_role in ('manager', 'duty_manager', 'org_admin', 'super_admin');

  if v_can_leave_manage_org then
    select count(*)::int
      into v_pending_leave
    from public.leave_requests r
    where r.org_id = v_org_id
      and r.status in ('pending', 'pending_cancel', 'pending_edit');

    select count(*)::int
      into v_pending_toil
    from public.toil_credit_requests t
    where t.org_id = v_org_id
      and t.status = 'pending';
  elsif v_can_leave_reports then
    select count(*)::int
      into v_pending_leave
    from public.leave_requests r
    join public.profiles s on s.id = r.requester_id
    where r.org_id = v_org_id
      and r.status in ('pending', 'pending_cancel', 'pending_edit')
      and s.reports_to_user_id = v_uid;

    select count(*)::int
      into v_pending_toil
    from public.toil_credit_requests t
    join public.profiles s on s.id = t.requester_id
    where t.org_id = v_org_id
      and t.status = 'pending'
      and s.reports_to_user_id = v_uid;
  end if;

  select count(*)::integer
    into v_broadcast_unread
  from public.broadcasts b
  where b.status = 'sent'
    and b.org_id = v_org_id
    and (v_status = 'active' or b.created_by = v_uid)
    and (
      b.team_id is null
      or exists (
        select 1
        from public.department_team_members udt
        where udt.user_id = v_uid
          and udt.team_id = b.team_id
      )
    )
    and (
      coalesce(b.is_mandatory, false)
      or coalesce(b.is_org_wide, false)
      or b.created_by = v_uid
      or v_role in ('org_admin', 'super_admin')
      or (
        b.channel_id is not null
        and exists (
          select 1
          from public.user_subscriptions us
          where us.user_id = v_uid
            and us.channel_id = b.channel_id
            and us.subscribed = true
        )
      )
      or exists (
        select 1
        from public.broadcast_collab_departments bcd
        join public.broadcast_channels c
          on c.dept_id = bcd.dept_id
        join public.user_subscriptions us
          on us.channel_id = c.id
        where bcd.broadcast_id = b.id
          and us.user_id = v_uid
          and us.subscribed = true
      )
    )
    and not exists (
      select 1
      from public.broadcast_reads r
      where r.broadcast_id = b.id
        and r.user_id = v_uid
    );

  v_broadcast_pending := case
    when v_role = 'manager' then (
      select count(*)::integer
      from public.broadcasts b
      join public.dept_managers dm
        on dm.dept_id = b.dept_id
       and dm.user_id = v_uid
      where b.status = 'pending_approval'
        and b.org_id = v_org_id
    )
    when v_role in ('org_admin', 'super_admin') then (
      select count(*)::integer
      from public.broadcasts b
      where b.status = 'pending_approval'
        and b.org_id = v_org_id
    )
    else 0
  end;

  select count(*)::integer
    into v_recruitment_notif
  from public.recruitment_notifications
  where recipient_id = v_uid
    and read_at is null;

  select count(*)::integer
    into v_application_notif
  from public.application_notifications
  where recipient_id = v_uid
    and read_at is null;

  select count(*)::integer
    into v_leave_notif
  from public.leave_notifications
  where recipient_id = v_uid
    and read_at is null;

  select count(*)::integer
    into v_hr_metric_notif
  from public.hr_metric_notifications
  where recipient_id = v_uid
    and read_at is null;

  select count(*)::integer
    into v_calendar_notif
  from public.calendar_event_notifications
  where recipient_id = v_uid
    and read_at is null;

  if v_can_recruitment then
    select count(*)::integer
      into v_recruitment_pending
    from public.recruitment_requests r
    where r.org_id = v_org_id
      and r.archived_at is null
      and r.status = 'pending_review';
  end if;

  select count(*)::integer
    into v_performance_pending
  from public.performance_reviews pr
  where pr.reviewer_id = v_uid
    and pr.status = 'self_submitted';

  select count(*)::integer
    into v_onboarding_active
  from public.onboarding_runs r
  where r.user_id = v_uid
    and r.status = 'active';

  if v_can_rota_final then
    select count(*)::integer
      into v_rota_pending_final
    from public.rota_change_requests rcr
    where rcr.org_id = v_org_id
      and rcr.status = 'pending_final';
  end if;

  select count(*)::integer
    into v_rota_pending_peer
  from public.rota_change_requests rcr
  where rcr.org_id = v_org_id
    and rcr.counterparty_user_id = v_uid
    and rcr.status = 'pending_peer';

  insert into public.user_badge_counters (
    user_id,
    org_id,
    broadcast_unread,
    broadcast_pending_approvals,
    recruitment_notifications,
    application_notifications,
    leave_notifications,
    hr_metric_notifications,
    calendar_event_notifications,
    pending_approvals,
    leave_pending_approval,
    recruitment_pending_review,
    performance_pending,
    onboarding_active,
    rota_pending_final,
    rota_pending_peer,
    computed_at,
    version
  )
  values (
    v_uid,
    v_org_id,
    coalesce(v_broadcast_unread, 0),
    coalesce(v_broadcast_pending, 0),
    coalesce(v_recruitment_notif, 0),
    coalesce(v_application_notif, 0),
    coalesce(v_leave_notif, 0),
    coalesce(v_hr_metric_notif, 0),
    coalesce(v_calendar_notif, 0),
    coalesce(v_pending_profiles, 0) + coalesce(v_pending_rota_nav, 0),
    coalesce(v_pending_leave, 0) + coalesce(v_pending_toil, 0),
    coalesce(v_recruitment_pending, 0),
    coalesce(v_performance_pending, 0),
    coalesce(v_onboarding_active, 0),
    coalesce(v_rota_pending_final, 0),
    coalesce(v_rota_pending_peer, 0),
    now(),
    1
  )
  on conflict (user_id) do update
  set org_id = excluded.org_id,
      broadcast_unread = excluded.broadcast_unread,
      broadcast_pending_approvals = excluded.broadcast_pending_approvals,
      recruitment_notifications = excluded.recruitment_notifications,
      application_notifications = excluded.application_notifications,
      leave_notifications = excluded.leave_notifications,
      hr_metric_notifications = excluded.hr_metric_notifications,
      calendar_event_notifications = excluded.calendar_event_notifications,
      pending_approvals = excluded.pending_approvals,
      leave_pending_approval = excluded.leave_pending_approval,
      recruitment_pending_review = excluded.recruitment_pending_review,
      performance_pending = excluded.performance_pending,
      onboarding_active = excluded.onboarding_active,
      rota_pending_final = excluded.rota_pending_final,
      rota_pending_peer = excluded.rota_pending_peer,
      computed_at = now(),
      version = public.user_badge_counters.version + 1;

  delete from public.badge_counter_recalc_queue
  where user_id = v_uid;

  select public._badge_counts_json_from_row(ubc)
    into v_result
  from public.user_badge_counters ubc
  where ubc.user_id = v_uid;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;


create or replace function public.main_shell_badge_counts_bundle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_cached public.user_badge_counters%rowtype;
  v_live jsonb := '{}'::jsonb;
  v_result jsonb := '{}'::jsonb;
  v_broadcast_enabled boolean := true;
  v_approvals_enabled boolean := true;
  v_scheduling_enabled boolean := true;
  v_need_live_overlay boolean := false;
  v_have_counters boolean := false;
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select p.org_id
    into v_org_id
  from public.profiles p
  where p.id = v_uid;

  if v_org_id is null then
    return '{}'::jsonb;
  end if;

  select *
    into v_cached
  from public.user_badge_counters ubc
  where ubc.user_id = v_uid;

  v_have_counters := found;

  if not v_have_counters then
    perform public.refresh_user_badge_counters(v_uid);
    select *
      into v_cached
    from public.user_badge_counters ubc
    where ubc.user_id = v_uid;
    v_have_counters := found;
  elsif v_cached.computed_at < (now() - interval '60 seconds') then
    perform public.enqueue_badge_counter_recalc_for_user(v_uid, 'stale_shell_read');
  end if;

  if v_have_counters then
    v_result := public._badge_counts_json_from_row(v_cached);
  end if;

  select
    coalesce(f.broadcast_enabled, true),
    coalesce(f.approvals_enabled, true),
    coalesce(f.scheduling_enabled, true)
    into v_broadcast_enabled, v_approvals_enabled, v_scheduling_enabled
  from public.shell_counter_rollout_flags f
  where f.org_id = v_org_id;

  if not found then
    v_broadcast_enabled := true;
    v_approvals_enabled := true;
    v_scheduling_enabled := true;
  end if;

  v_need_live_overlay := not (v_broadcast_enabled and v_approvals_enabled and v_scheduling_enabled);

  if v_need_live_overlay then
    v_live := public.refresh_user_badge_counters(v_uid);
  end if;

  if not v_broadcast_enabled then
    v_result := jsonb_set(v_result, '{broadcast_unread}', coalesce(v_live -> 'broadcast_unread', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{broadcast_pending_approvals}', coalesce(v_live -> 'broadcast_pending_approvals', '0'::jsonb), true);
  end if;

  if not v_approvals_enabled then
    v_result := jsonb_set(v_result, '{pending_approvals}', coalesce(v_live -> 'pending_approvals', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{leave_pending_approval}', coalesce(v_live -> 'leave_pending_approval', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{recruitment_pending_review}', coalesce(v_live -> 'recruitment_pending_review', '0'::jsonb), true);
  end if;

  if not v_scheduling_enabled then
    v_result := jsonb_set(v_result, '{rota_pending_final}', coalesce(v_live -> 'rota_pending_final', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{rota_pending_peer}', coalesce(v_live -> 'rota_pending_peer', '0'::jsonb), true);
  end if;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.main_shell_scheduling_bundle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_cached public.user_badge_counters%rowtype;
  v_have_counters boolean := false;
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select p.org_id
    into v_org_id
  from public.profiles p
  where p.id = v_uid;

  if v_org_id is null then
    return '{}'::jsonb;
  end if;

  select *
    into v_cached
  from public.user_badge_counters ubc
  where ubc.user_id = v_uid;

  v_have_counters := found;

  if not v_have_counters then
    perform public.refresh_user_badge_counters(v_uid);
    select *
      into v_cached
    from public.user_badge_counters ubc
    where ubc.user_id = v_uid;
    v_have_counters := found;
  elsif v_cached.computed_at < (now() - interval '60 seconds') then
    perform public.enqueue_badge_counter_recalc_for_user(v_uid, 'stale_scheduling_shell_read');
  end if;

  if not v_have_counters then
    return jsonb_build_object(
      'rota_pending_final', 0,
      'rota_pending_peer', 0,
      'pending_approvals', 0
    );
  end if;

  return jsonb_build_object(
    'rota_pending_final', coalesce(v_cached.rota_pending_final, 0),
    'rota_pending_peer', coalesce(v_cached.rota_pending_peer, 0),
    'pending_approvals', coalesce(v_cached.pending_approvals, 0)
  );
end;
$$;


do $cron$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid
      into v_job_id
    from cron.job
    where jobname = 'process-badge-counter-recalc-queue'
    limit 1;

    if v_job_id is null then
      perform cron.schedule(
        'process-badge-counter-recalc-queue',
        '* * * * *',
        $job$select public.process_badge_counter_recalc_queue(500);$job$
      );
    end if;
  end if;
end
$cron$;
