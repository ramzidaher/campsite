-- Timesheet submit manager alerts + manager approval permission backfill.

-- ---------------------------------------------------------------------------
-- Ensure manager roles can review direct-report timesheets.
-- ---------------------------------------------------------------------------

insert into public.org_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.org_roles r
join (
  values
    ('leave.approve_direct_reports'),
    ('leave.view_direct_reports')
) as p(permission_key) on true
where r.key = 'manager'
  and r.is_archived = false
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Extend HR metric notifications enum-like check with timesheet event.
-- ---------------------------------------------------------------------------

alter table public.hr_metric_notifications
  drop constraint if exists hr_metric_notifications_metric_kind_check;

alter table public.hr_metric_notifications
  add constraint hr_metric_notifications_metric_kind_check
  check (
    metric_kind in (
      'bradford_threshold',
      'working_hours_excess',
      'diversity_quota',
      'probation_review_due',
      'missing_hr_record',
      'review_cycle_manager_overdue',
      'timesheet_submitted'
    )
  );

-- ---------------------------------------------------------------------------
-- Helper: notify manager(s) when a week is submitted.
-- ---------------------------------------------------------------------------

create or replace function public.timesheet_notify_submit(
  p_org_id uuid,
  p_user_id uuid,
  p_week_start date,
  p_week_end date,
  p_reported_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submitter_name text;
  v_submitter_manager_id uuid;
  v_week_label text;
  v_body text;
begin
  select
    coalesce(nullif(trim(p.full_name), ''), 'A team member'),
    p.reports_to_user_id
  into v_submitter_name, v_submitter_manager_id
  from public.profiles p
  where p.id = p_user_id
    and p.org_id = p_org_id;

  if v_submitter_name is null then
    return;
  end if;

  v_week_label := p_week_start::text || ' - ' || p_week_end::text;
  v_body := format(
    '%s submitted %s (%s minutes) for approval.',
    v_submitter_name,
    v_week_label,
    greatest(coalesce(p_reported_minutes, 0), 0)::text
  );

  insert into public.hr_metric_notifications (
    org_id,
    recipient_id,
    metric_kind,
    severity,
    title,
    body,
    payload,
    subject_user_id,
    dedupe_key
  )
  select
    p_org_id,
    recipients.recipient_id,
    'timesheet_submitted',
    'info',
    'Timesheet awaiting approval',
    v_body,
    jsonb_build_object(
      'week_start_date', p_week_start,
      'week_end_date', p_week_end,
      'reported_total_minutes', p_reported_minutes
    ),
    p_user_id,
    'timesheet_submit:' || p_org_id::text || ':' || p_user_id::text || ':' || p_week_start::text
  from (
    select distinct recipient_id
    from (
      select v_submitter_manager_id as recipient_id
      union all
      select ua.user_id as recipient_id
      from public.user_org_role_assignments ua
      join public.org_role_permissions orp on orp.role_id = ua.role_id
      join public.profiles pr on pr.id = ua.user_id
      where ua.org_id = p_org_id
        and pr.org_id = p_org_id
        and pr.status = 'active'
        and orp.permission_key = 'leave.manage_org'
    ) x
    where recipient_id is not null
      and recipient_id <> p_user_id
  ) recipients
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

revoke all on function public.timesheet_notify_submit(uuid, uuid, date, date, integer) from public;

-- ---------------------------------------------------------------------------
-- Submit RPC: emit manager notification after successful submit/update.
-- ---------------------------------------------------------------------------

create or replace function public.weekly_timesheet_submit(p_week_start date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  we date;
  mins int;
  tid uuid;
  vst text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'no active org';
  end if;

  select week_end into we from public.attendance_week_bounds(p_week_start);

  if not exists (
    select 1 from public.employee_hr_records e
    where e.org_id = v_org and e.user_id = v_uid and e.timesheet_clock_enabled = true
  ) then
    raise exception 'clock not enabled';
  end if;

  mins := public.attendance_week_total_minutes(v_org, v_uid, p_week_start, we);

  select id, status into tid, vst
  from public.weekly_timesheets
  where org_id = v_org and user_id = v_uid and week_start_date = p_week_start
  for update;

  if tid is null then
    insert into public.weekly_timesheets (
      org_id, user_id, week_start_date, week_end_date, status,
      reported_total_minutes, submitted_at, submitted_by
    )
    values (
      v_org, v_uid, p_week_start, we, 'submitted',
      mins, now(), v_uid
    );
  elsif vst in ('draft', 'submitted', 'rejected') then
    update public.weekly_timesheets
    set status = 'submitted',
        reported_total_minutes = mins,
        submitted_at = now(),
        submitted_by = v_uid,
        updated_at = now()
    where id = tid;
  else
    raise exception 'timesheet not submittable';
  end if;

  perform public.timesheet_notify_submit(v_org, v_uid, p_week_start, we, mins);
end;
$$;

revoke all on function public.weekly_timesheet_submit(date) from public;
grant execute on function public.weekly_timesheet_submit(date) to authenticated;
