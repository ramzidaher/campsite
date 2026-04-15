-- Hot-path optimization for shell badge counts under concurrent load.
-- Removes row-by-row permission checks from pending approvals and inlines
-- org-scoped counts in the badge bundle.

create or replace function public.pending_approvals_nav_count()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_status text;
  v_can_review_members boolean := false;
  v_profiles_pending int := 0;
  v_rota_pending_final int := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  select p.org_id, p.status
    into v_org, v_status
  from public.profiles p
  where p.id = v_uid;

  if v_org is null or v_status <> 'active' then
    return 0;
  end if;

  -- Resolve once instead of calling has_permission() per pending profile row.
  v_can_review_members := public.has_permission(v_uid, v_org, 'approvals.members.review', '{}'::jsonb);

  if v_can_review_members then
    select count(*)::int
      into v_profiles_pending
    from public.profiles pt
    where pt.org_id = v_org
      and pt.status = 'pending';
  end if;

  select count(*)::int
    into v_rota_pending_final
  from public.rota_change_requests r
  join public.profiles me on me.id = v_uid
  where r.org_id = me.org_id
    and r.status = 'pending_final'
    and me.status = 'active'
    and me.role in ('manager', 'duty_manager', 'org_admin', 'super_admin');

  return coalesce(v_profiles_pending, 0) + coalesce(v_rota_pending_final, 0);
end;
$$;

create or replace function public.main_shell_badge_counts_bundle()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid                  uuid := auth.uid();
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

  -- Resolve expensive permission checks once per call.
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

  return jsonb_build_object(
    'broadcast_unread', (
      select count(*)::integer
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
        )
    ),
    'broadcast_pending_approvals', case
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
    end,

    'recruitment_notifications', (
      select count(*)::integer
      from public.recruitment_notifications
      where recipient_id = v_uid
        and read_at is null
    ),
    'application_notifications', (
      select count(*)::integer
      from public.application_notifications
      where recipient_id = v_uid
        and read_at is null
    ),
    'leave_notifications', (
      select count(*)::integer
      from public.leave_notifications
      where recipient_id = v_uid
        and read_at is null
    ),
    'hr_metric_notifications', (
      select count(*)::integer
      from public.hr_metric_notifications
      where recipient_id = v_uid
        and read_at is null
    ),
    'calendar_event_notifications', (
      select count(*)::integer
      from public.calendar_event_notifications
      where recipient_id = v_uid
        and read_at is null
    ),

    'pending_approvals', coalesce(v_pending_profiles, 0) + coalesce(v_pending_rota_nav, 0),
    'leave_pending_approval', coalesce(v_pending_leave, 0) + coalesce(v_pending_toil, 0),
    'recruitment_pending_review', case
      when v_can_recruitment then (
        select count(*)::integer
        from public.recruitment_requests r
        where r.org_id = v_org_id
          and r.archived_at is null
          and r.status = 'pending_review'
      )
      else 0
    end,

    'performance_pending', (
      select count(*)::integer
      from public.performance_reviews pr
      where pr.reviewer_id = v_uid
        and pr.status = 'self_submitted'
    ),
    'onboarding_active', (
      select count(*)::integer
      from public.onboarding_runs r
      where r.user_id = v_uid
        and r.status = 'active'
    ),
    'rota_pending_final', case
      when v_can_rota_final then (
        select count(*)::integer
        from public.rota_change_requests rcr
        where rcr.org_id = v_org_id
          and rcr.status = 'pending_final'
      )
      else 0
    end,
    'rota_pending_peer', (
      select count(*)::integer
      from public.rota_change_requests rcr
      where rcr.org_id = v_org_id
        and rcr.counterparty_user_id = v_uid
        and rcr.status = 'pending_peer'
    )
  );
end;
$$;

grant execute on function public.pending_approvals_nav_count() to authenticated;
grant execute on function public.main_shell_badge_counts_bundle() to authenticated;
