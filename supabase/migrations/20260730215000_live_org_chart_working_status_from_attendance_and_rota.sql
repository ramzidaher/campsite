-- Refine live org chart "currently working" signal:
-- - true when user is currently clocked in from attendance events
-- - OR user has an active rota shift window

drop function if exists public.org_chart_live_nodes(interval);

create or replace function public.org_chart_live_nodes(p_recent_window interval default interval '15 minutes')
returns table (
  user_id uuid,
  full_name text,
  preferred_name text,
  display_name text,
  email text,
  role text,
  reports_to_user_id uuid,
  reports_to_name text,
  department_names text[],
  job_title text,
  member_status text,
  last_seen_at timestamptz,
  is_recently_seen boolean,
  is_on_shift_now boolean,
  has_pending_approvals boolean,
  live_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_can_view_all boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id
    into v_org
  from public.profiles p
  where p.id = v_uid
    and p.status = 'active';

  if v_org is null then
    raise exception 'not authenticated';
  end if;

  v_can_view_all :=
    public.has_permission(v_uid, v_org, 'leave.approve_direct_reports', '{}'::jsonb)
    or public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb)
    or public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb)
    or public.has_permission(v_uid, v_org, 'reports.view', '{}'::jsonb);

  if not v_can_view_all then
    raise exception 'not allowed';
  end if;

  return query
  with working_now as (
    select
      p.id as user_id,
      coalesce((
        select ae.direction = 'in'
        from public.attendance_events ae
        where ae.org_id = v_org
          and ae.user_id = p.id
        order by ae.clocked_at desc
        limit 1
      ), false) as clocked_in,
      exists (
        select 1
        from public.rota_shifts rs
        where rs.org_id = v_org
          and rs.user_id = p.id
          and rs.start_time <= now()
          and rs.end_time > now()
      ) as has_active_shift
    from public.profiles p
    where p.org_id = v_org
      and p.status in ('active', 'pending')
  )
  select
    p.id as user_id,
    p.full_name::text,
    p.preferred_name::text,
    case
      when nullif(trim(coalesce(p.preferred_name, '')), '') is null then p.full_name::text
      when lower(trim(p.preferred_name)) = lower(trim(p.full_name)) then p.full_name::text
      else trim(p.preferred_name) || ' (' || p.full_name || ')'
    end as display_name,
    p.email::text,
    p.role::text,
    p.reports_to_user_id,
    case
      when nullif(trim(coalesce(m.preferred_name, '')), '') is null then m.full_name::text
      when lower(trim(m.preferred_name)) = lower(trim(m.full_name)) then m.full_name::text
      else trim(m.preferred_name) || ' (' || m.full_name || ')'
    end as reports_to_name,
    coalesce(array_agg(d.name order by d.name) filter (where d.name is not null), '{}'::text[]) as department_names,
    r.job_title::text,
    p.status::text as member_status,
    p.last_seen_at,
    (p.status = 'active' and p.last_seen_at is not null and p.last_seen_at >= (now() - p_recent_window)) as is_recently_seen,
    (w.clocked_in or w.has_active_shift) as is_on_shift_now,
    (
      (
        public.has_permission(p.id, v_org, 'approvals.members.review', '{}'::jsonb)
        and exists (
          select 1
          from public.profiles pt
          where pt.org_id = v_org
            and pt.status = 'pending'
            and public.can_approve_profile(p.id, pt.id)
        )
      )
      or (
        public.has_permission(p.id, v_org, 'leave.manage_org', '{}'::jsonb)
        and exists (
          select 1
          from public.leave_requests lr
          where lr.org_id = v_org
            and lr.status in ('pending', 'pending_cancel', 'pending_edit')
        )
      )
      or (
        public.has_permission(p.id, v_org, 'leave.approve_direct_reports', '{}'::jsonb)
        and exists (
          select 1
          from public.leave_requests lr
          join public.profiles rp on rp.id = lr.requester_id
          where lr.org_id = v_org
            and lr.status in ('pending', 'pending_cancel', 'pending_edit')
            and rp.reports_to_user_id = p.id
        )
      )
    ) as has_pending_approvals,
    case
      when (w.clocked_in or w.has_active_shift) then 'on_shift'
      when (
        (
          public.has_permission(p.id, v_org, 'approvals.members.review', '{}'::jsonb)
          and exists (
            select 1
            from public.profiles pt
            where pt.org_id = v_org
              and pt.status = 'pending'
              and public.can_approve_profile(p.id, pt.id)
          )
        )
        or (
          public.has_permission(p.id, v_org, 'leave.manage_org', '{}'::jsonb)
          and exists (
            select 1
            from public.leave_requests lr
            where lr.org_id = v_org
              and lr.status in ('pending', 'pending_cancel', 'pending_edit')
          )
        )
        or (
          public.has_permission(p.id, v_org, 'leave.approve_direct_reports', '{}'::jsonb)
          and exists (
            select 1
            from public.leave_requests lr
            join public.profiles rp on rp.id = lr.requester_id
            where lr.org_id = v_org
              and lr.status in ('pending', 'pending_cancel', 'pending_edit')
              and rp.reports_to_user_id = p.id
          )
        )
      ) then 'pending_approvals'
      when p.status = 'active' and p.last_seen_at is not null and p.last_seen_at >= (now() - p_recent_window) then 'active'
      else 'offline'
    end as live_status
  from public.profiles p
  join working_now w on w.user_id = p.id
  left join public.profiles m on m.id = p.reports_to_user_id
  left join public.user_departments ud on ud.user_id = p.id
  left join public.departments d on d.id = ud.dept_id and not d.is_archived
  left join public.employee_hr_records r on r.user_id = p.id and r.org_id = v_org
  where p.org_id = v_org
    and p.status in ('active', 'pending')
  group by
    p.id, p.full_name, p.preferred_name, p.email, p.role, p.reports_to_user_id,
    m.full_name, m.preferred_name, r.job_title, p.status, p.last_seen_at, w.clocked_in, w.has_active_shift
  order by display_name;
end;
$$;

grant execute on function public.org_chart_live_nodes(interval) to authenticated;
