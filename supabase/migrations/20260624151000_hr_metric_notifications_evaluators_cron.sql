-- In-app HR metric notifications, evaluators, and optional pg_cron schedule.

-- ---------------------------------------------------------------------------
-- Notifications table
-- ---------------------------------------------------------------------------

create table if not exists public.hr_metric_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  metric_kind text not null
    check (metric_kind in (
      'bradford_threshold',
      'working_hours_excess',
      'diversity_quota',
      'probation_review_due',
      'missing_hr_record',
      'review_cycle_manager_overdue'
    )),
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  subject_user_id uuid references public.profiles (id) on delete set null,
  subject_job_listing_id uuid references public.job_listings (id) on delete set null,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, dedupe_key)
);

create index if not exists hr_metric_notifications_recipient_idx
  on public.hr_metric_notifications (recipient_id, read_at, created_at desc);

create index if not exists hr_metric_notifications_org_idx
  on public.hr_metric_notifications (org_id, created_at desc);

comment on table public.hr_metric_notifications is
  'Automated HR metric alerts (Bradford, hours, diversity, probation, etc.).';

alter table public.hr_metric_notifications enable row level security;

drop policy if exists hr_metric_notifications_select_own on public.hr_metric_notifications;
create policy hr_metric_notifications_select_own
  on public.hr_metric_notifications for select to authenticated
  using (recipient_id = auth.uid());

drop policy if exists hr_metric_notifications_service_all on public.hr_metric_notifications;
create policy hr_metric_notifications_service_all
  on public.hr_metric_notifications for all
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- RPCs: read / mark read / unread count
-- ---------------------------------------------------------------------------

create or replace function public.hr_metric_notification_mark_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.hr_metric_notifications
  set read_at = now()
  where id = p_notification_id
    and recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.hr_metric_notification_mark_read(uuid) from public;
grant execute on function public.hr_metric_notification_mark_read(uuid) to authenticated;

create or replace function public.hr_metric_notifications_mark_all_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.hr_metric_notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.hr_metric_notifications_mark_all_read() from public;
grant execute on function public.hr_metric_notifications_mark_all_read() to authenticated;

create or replace function public.hr_metric_notifications_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.hr_metric_notifications
  where recipient_id = auth.uid()
    and read_at is null;
$$;

revoke all on function public.hr_metric_notifications_unread_count() from public;
grant execute on function public.hr_metric_notifications_unread_count() to authenticated;

create or replace function public.hr_metric_notifications_for_me()
returns table (
  id uuid,
  metric_kind text,
  severity text,
  title text,
  body text,
  payload jsonb,
  subject_user_id uuid,
  subject_job_listing_id uuid,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.metric_kind,
    n.severity,
    n.title,
    n.body,
    n.payload,
    n.subject_user_id,
    n.subject_job_listing_id,
    n.read_at,
    n.created_at
  from public.hr_metric_notifications n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit 100;
$$;

revoke all on function public.hr_metric_notifications_for_me() from public;
grant execute on function public.hr_metric_notifications_for_me() to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers: HR viewers; metric_enabled; week key
-- ---------------------------------------------------------------------------

create or replace function public._hr_metric_hr_viewer_user_ids(p_org uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct ua.user_id
  from public.user_org_role_assignments ua
  join public.org_role_permissions orp on orp.role_id = ua.role_id
  join public.profiles p on p.id = ua.user_id and p.org_id = p_org and p.status = 'active'
  where ua.org_id = p_org
    and orp.permission_key = 'hr.view_records';
$$;

revoke all on function public._hr_metric_hr_viewer_user_ids(uuid) from public;
revoke all on function public._hr_metric_hr_viewer_user_ids(uuid) from anon, authenticated;

create or replace function public._hr_metric_json_enabled(p_metrics jsonb, p_key text)
returns boolean
language sql
immutable
as $$
  select case
    when p_metrics is null then true
    when p_metrics ? p_key then coalesce((p_metrics->>p_key)::boolean, true)
    else true
  end;
$$;

-- ---------------------------------------------------------------------------
-- Orchestrator: run all orgs (called by pg_cron as superuser)
-- ---------------------------------------------------------------------------

create or replace function public.hr_metrics_run_all_orgs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select id as org_id from public.organisations where is_active = true
  loop
    perform public.hr_metrics_run_org(r.org_id);
  end loop;
end;
$$;

revoke all on function public.hr_metrics_run_all_orgs() from public;
grant execute on function public.hr_metrics_run_all_orgs() to service_role;

-- Allow cron / postgres to invoke if needed
grant execute on function public.hr_metrics_run_all_orgs() to postgres;

create or replace function public.hr_metrics_run_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.org_hr_metric_settings%rowtype;
  v_week text := to_char(current_date, 'IYYY') || '-' || to_char(current_date, 'IW');
  v_threshold numeric;
  v_win int;
  v_min_s int;
  bf record;
  wk record;
  v_cap numeric;
  v_hours numeric;
  w_start timestamptz;
  w_end timestamptz;
  jl record;
  v_total int;
  v_matched int;
  v_share numeric;
  rv record;
  m record;
  emp record;
begin
  insert into public.org_hr_metric_settings (org_id)
  values (p_org_id)
  on conflict (org_id) do nothing;

  select * into s from public.org_hr_metric_settings where org_id = p_org_id;

  v_threshold := s.bradford_alert_threshold;
  v_win := s.diversity_evaluation_window_days;
  v_min_s := s.diversity_min_sample_size;

  w_start := date_trunc('week', timezone('utc', now()));
  w_end := w_start + interval '7 days';

  -- Bradford
  if public._hr_metric_json_enabled(s.metrics_enabled, 'bradford') then
    for bf in
      select p.id as uid, p.full_name as fn, bf2.bradford_score as score
      from public.profiles p
      cross join lateral public._bradford_factor_raw(p_org_id, p.id, current_date) bf2
      where p.org_id = p_org_id
        and p.status = 'active'
        and bf2.bradford_score >= v_threshold
    loop
      insert into public.hr_metric_notifications (
        org_id, recipient_id, metric_kind, severity, title, body, payload,
        subject_user_id, dedupe_key
      )
      select
        p_org_id,
        x.recipient_id,
        'bradford_threshold',
        'warning',
        'Bradford factor threshold',
        format('%s  Bradford score is %s (threshold %s).', bf.fn, round(bf.score)::text, round(v_threshold)::text),
        jsonb_build_object('bradford_score', bf.score, 'threshold', v_threshold),
        bf.uid,
        'bradford:' || p_org_id::text || ':' || bf.uid::text || ':' || v_week
      from (
        select distinct uid as recipient_id
        from (
          select reports_to_user_id as uid
          from public.profiles
          where id = bf.uid
            and org_id = p_org_id
            and reports_to_user_id is not null
          union all
          select user_id as uid from public._hr_metric_hr_viewer_user_ids(p_org_id)
        ) q
        where uid is not null
      ) x
      on conflict (recipient_id, dedupe_key) do nothing;
    end loop;
  end if;

  -- Working hours (rota vs contract / cap)
  if public._hr_metric_json_enabled(s.metrics_enabled, 'working_hours') then
    for wk in
      select p.id as uid, p.full_name as fn, e.weekly_hours as wh
      from public.profiles p
      left join public.employee_hr_records e on e.user_id = p.id and e.org_id = p_org_id
      where p.org_id = p_org_id
        and p.status = 'active'
    loop
      select coalesce(sum(extract(epoch from (rs.end_time - rs.start_time)) / 3600.0), 0)
      into v_hours
      from public.rota_shifts rs
      where rs.org_id = p_org_id
        and rs.user_id = wk.uid
        and rs.start_time >= w_start
        and rs.start_time < w_end;

      v_cap := case
        when coalesce(s.working_hours_use_contract, true) and wk.wh is not null then wk.wh::numeric
        when s.working_hours_absolute_max is not null then s.working_hours_absolute_max
        else 48::numeric
      end;

      if v_hours > v_cap + 0.01 then
        insert into public.hr_metric_notifications (
          org_id, recipient_id, metric_kind, severity, title, body, payload,
          subject_user_id, dedupe_key
        )
        select
          p_org_id,
          x.recipient_id,
          'working_hours_excess',
          'warning',
          'Working hours above limit',
          format(
            '%s  scheduled hours this week are about %s h (limit %s h).',
            wk.fn,
            round(v_hours, 1)::text,
            round(v_cap, 1)::text
          ),
          jsonb_build_object('hours', v_hours, 'cap', v_cap),
          wk.uid,
          'hours:' || p_org_id::text || ':' || wk.uid::text || ':' || v_week
        from (
          select distinct uid as recipient_id
          from (
            select reports_to_user_id as uid
            from public.profiles
            where id = wk.uid
              and org_id = p_org_id
              and reports_to_user_id is not null
            union all
            select user_id as uid from public._hr_metric_hr_viewer_user_ids(p_org_id)
          ) q
          where uid is not null
        ) x
        on conflict (recipient_id, dedupe_key) do nothing;
      end if;
    end loop;
  end if;

  -- Diversity quota (live listings with targets)
  if public._hr_metric_json_enabled(s.metrics_enabled, 'diversity') then
    for jl in
      select
        jl.id as lid,
        jl.title,
        jl.diversity_target_pct as tgt,
        jl.diversity_included_codes as codes,
        rr.created_by as req_by,
        jl.created_by as list_by
      from public.job_listings jl
      join public.recruitment_requests rr on rr.id = jl.recruitment_request_id
      where jl.org_id = p_org_id
        and jl.status = 'live'
        and jl.diversity_target_pct is not null
        and cardinality(jl.diversity_included_codes) > 0
    loop
      select
        count(*) filter (where ja.equality_monitoring_recorded_at is not null),
        count(*) filter (
          where ja.equality_monitoring_recorded_at is not null
            and ja.eq_ethnicity_code is not null
            and ja.eq_ethnicity_code = any (jl.codes)
        )
      into v_total, v_matched
      from public.job_applications ja
      where ja.job_listing_id = jl.lid
        and ja.submitted_at >= now() - (v_win || ' days')::interval;

      if v_total >= v_min_s and v_total > 0 then
        v_share := (v_matched::numeric / v_total::numeric) * 100;
        if v_share + 0.0001 < jl.tgt then
          insert into public.hr_metric_notifications (
            org_id, recipient_id, metric_kind, severity, title, body, payload,
            subject_job_listing_id, dedupe_key
          )
          select
            p_org_id,
            x.recipient_id,
            'diversity_quota',
            'warning',
            'Recruitment diversity target',
            format(
              '%s  share of applicants in selected equality categories is about %s%% (target %s%%).',
              jl.title,
              round(v_share, 1)::text,
              round(jl.tgt, 1)::text
            ),
            jsonb_build_object(
              'listing_id', jl.lid,
              'share_pct', v_share,
              'target_pct', jl.tgt,
              'sample', v_total
            ),
            jl.lid,
            'diversity:' || jl.lid::text || ':' || v_week
          from (
            select distinct uid as recipient_id
            from (
              select jl.req_by as uid
              union all
              select jl.list_by
              union all
              select user_id as uid from public._hr_metric_hr_viewer_user_ids(p_org_id)
            ) q
            where uid is not null
          ) x
          on conflict (recipient_id, dedupe_key) do nothing;
        end if;
      end if;
    end loop;
  end if;

  -- Probation review overdue (same window as dashboard: end date passed, not completed)
  if public._hr_metric_json_enabled(s.metrics_enabled, 'probation') then
    for emp in
      select pr.id as uid, pr.full_name as fn, r.probation_end_date as end_dt
      from public.employee_hr_records r
      join public.profiles pr on pr.id = r.user_id
      where r.org_id = p_org_id
        and pr.status = 'active'
        and r.probation_end_date is not null
        and r.probation_check_completed_at is null
        and current_date > r.probation_end_date
    loop
      insert into public.hr_metric_notifications (
        org_id, recipient_id, metric_kind, severity, title, body, payload,
        subject_user_id, dedupe_key
      )
      select
        p_org_id,
        x.recipient_id,
        'probation_review_due',
        'critical',
        'Probation review overdue',
        format('%s  probation ended on %s; review not recorded.', emp.fn, emp.end_dt::text),
        jsonb_build_object('probation_end_date', emp.end_dt),
        emp.uid,
        'probation:' || p_org_id::text || ':' || emp.uid::text || ':' || v_week
      from (
        select distinct uid as recipient_id
        from (
          select reports_to_user_id as uid
          from public.profiles
          where id = emp.uid
            and org_id = p_org_id
            and reports_to_user_id is not null
          union all
          select user_id as uid from public._hr_metric_hr_viewer_user_ids(p_org_id)
        ) q
        where uid is not null
      ) x
      on conflict (recipient_id, dedupe_key) do nothing;
    end loop;
  end if;

  -- Missing employee HR record
  if public._hr_metric_json_enabled(s.metrics_enabled, 'missing_hr_record') then
    for m in
      select p.id as uid, p.full_name as fn
      from public.profiles p
      where p.org_id = p_org_id
        and p.status = 'active'
        and not exists (
          select 1 from public.employee_hr_records e
          where e.org_id = p_org_id and e.user_id = p.id
        )
    loop
      insert into public.hr_metric_notifications (
        org_id, recipient_id, metric_kind, severity, title, body, payload,
        subject_user_id, dedupe_key
      )
      select
        p_org_id,
        hv.user_id,
        'missing_hr_record',
        'warning',
        'Missing HR record',
        format('%s  no employee HR file.', m.fn),
        jsonb_build_object(),
        m.uid,
        'missing_hr:' || p_org_id::text || ':' || m.uid::text || ':' || v_week
      from public._hr_metric_hr_viewer_user_ids(p_org_id) hv
      on conflict (recipient_id, dedupe_key) do nothing;
    end loop;
  end if;

  -- Performance review: manager assessment past due
  if public._hr_metric_json_enabled(s.metrics_enabled, 'review_cycle') then
    for rv in
      select
        pr.id as rid,
        pr.reviewer_id as rev_id,
        pr.reviewee_id,
        c.name as cname,
        c.manager_assessment_due as due
      from public.performance_reviews pr
      join public.review_cycles c on c.id = pr.cycle_id
      where pr.org_id = p_org_id
        and c.status = 'active'
        and c.manager_assessment_due is not null
        and c.manager_assessment_due < current_date
        and pr.status in ('pending', 'self_submitted')
        and pr.reviewer_id is not null
    loop
      insert into public.hr_metric_notifications (
        org_id, recipient_id, metric_kind, severity, title, body, payload,
        subject_user_id, dedupe_key
      )
      select
        p_org_id,
        x.recipient_id,
        'review_cycle_manager_overdue',
        'warning',
        'Performance review awaiting manager',
        format('Cycle "%s"  manager assessment was due %s.', rv.cname, rv.due::text),
        jsonb_build_object('performance_review_id', rv.rid, 'cycle', rv.cname),
        rv.rev_id,
        'perf:' || rv.rid::text || ':' || v_week
      from (
        select distinct uid as recipient_id
        from (
          select rv.rev_id as uid
          union all
          select user_id as uid from public._hr_metric_hr_viewer_user_ids(p_org_id)
        ) q
        where uid is not null
      ) x
      on conflict (recipient_id, dedupe_key) do nothing;
    end loop;
  end if;
end;
$$;

revoke all on function public.hr_metrics_run_org(uuid) from public;
grant execute on function public.hr_metrics_run_org(uuid) to service_role;
grant execute on function public.hr_metrics_run_org(uuid) to postgres;

-- ---------------------------------------------------------------------------
-- pg_cron: daily 06:15 UTC
-- ---------------------------------------------------------------------------

do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid
      into v_job_id
    from cron.job
    where jobname = 'hr-metrics-run-orgs'
    limit 1;

    if v_job_id is not null then
      perform cron.unschedule(v_job_id);
    end if;

    perform cron.schedule(
      'hr-metrics-run-orgs',
      '15 6 * * *',
      $job$select public.hr_metrics_run_all_orgs();$job$
    );
  end if;
end
$$;
