-- Badge counter read model for shell hot path.
-- Strategy:
-- 1) Store per-user badge counters in a compact table.
-- 2) Recompute counters via a dedicated function (source of truth).
-- 3) Queue recomputes from table triggers, then process in batch.
-- 4) Serve `main_shell_badge_counts_bundle()` from cached row first.

create table if not exists public.user_badge_counters (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  broadcast_unread integer not null default 0,
  broadcast_pending_approvals integer not null default 0,
  recruitment_notifications integer not null default 0,
  application_notifications integer not null default 0,
  leave_notifications integer not null default 0,
  hr_metric_notifications integer not null default 0,
  calendar_event_notifications integer not null default 0,
  pending_approvals integer not null default 0,
  leave_pending_approval integer not null default 0,
  recruitment_pending_review integer not null default 0,
  performance_pending integer not null default 0,
  onboarding_active integer not null default 0,
  rota_pending_final integer not null default 0,
  rota_pending_peer integer not null default 0,
  computed_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists user_badge_counters_org_idx
  on public.user_badge_counters (org_id);

create index if not exists user_badge_counters_computed_at_idx
  on public.user_badge_counters (computed_at desc);

alter table public.user_badge_counters enable row level security;

drop policy if exists "user_badge_counters_select_own" on public.user_badge_counters;
create policy "user_badge_counters_select_own"
on public.user_badge_counters
for select
to authenticated
using (auth.uid() = user_id);

create table if not exists public.badge_counter_recalc_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  org_id uuid references public.organisations(id) on delete cascade,
  reason text,
  attempts integer not null default 0,
  requested_at timestamptz not null default now()
);

create index if not exists badge_counter_recalc_queue_requested_at_idx
  on public.badge_counter_recalc_queue (requested_at asc);

alter table public.badge_counter_recalc_queue enable row level security;

create or replace function public._badge_counts_json_from_row(r public.user_badge_counters)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'broadcast_unread', r.broadcast_unread,
    'broadcast_pending_approvals', r.broadcast_pending_approvals,
    'recruitment_notifications', r.recruitment_notifications,
    'application_notifications', r.application_notifications,
    'leave_notifications', r.leave_notifications,
    'hr_metric_notifications', r.hr_metric_notifications,
    'calendar_event_notifications', r.calendar_event_notifications,
    'pending_approvals', r.pending_approvals,
    'leave_pending_approval', r.leave_pending_approval,
    'recruitment_pending_review', r.recruitment_pending_review,
    'performance_pending', r.performance_pending,
    'onboarding_active', r.onboarding_active,
    'rota_pending_final', r.rota_pending_final,
    'rota_pending_peer', r.rota_pending_peer
  );
$$;

create or replace function public.enqueue_badge_counter_recalc_for_user(
  p_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if p_user_id is null then
    return;
  end if;

  select p.org_id into v_org_id
  from public.profiles p
  where p.id = p_user_id;

  if v_org_id is null then
    return;
  end if;

  insert into public.badge_counter_recalc_queue (user_id, org_id, reason, requested_at)
  values (p_user_id, v_org_id, p_reason, now())
  on conflict (user_id) do update
  set requested_at = excluded.requested_at,
      reason = coalesce(excluded.reason, public.badge_counter_recalc_queue.reason);
end;
$$;

create or replace function public.enqueue_badge_counter_recalc_for_org(
  p_org_id uuid,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enqueued integer := 0;
begin
  if p_org_id is null then
    return 0;
  end if;

  insert into public.badge_counter_recalc_queue (user_id, org_id, reason, requested_at)
  select p.id, p.org_id, p_reason, now()
  from public.profiles p
  where p.org_id = p_org_id
    and p.status = 'active'
  on conflict (user_id) do update
  set requested_at = excluded.requested_at,
      reason = coalesce(excluded.reason, public.badge_counter_recalc_queue.reason);

  get diagnostics v_enqueued = row_count;
  return v_enqueued;
end;
$$;

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

create or replace function public.process_badge_counter_recalc_queue(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_processed integer := 0;
begin
  for r in
    select q.user_id
    from public.badge_counter_recalc_queue q
    order by q.requested_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
  loop
    perform public.refresh_user_badge_counters(r.user_id);
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
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
  v_cached public.user_badge_counters%rowtype;
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select *
    into v_cached
  from public.user_badge_counters ubc
  where ubc.user_id = v_uid;

  if found and v_cached.computed_at >= (now() - interval '60 seconds') then
    return public._badge_counts_json_from_row(v_cached);
  end if;

  return public.refresh_user_badge_counters(v_uid);
end;
$$;

create or replace function public._trg_enqueue_badges_on_user_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_badge_counter_recalc_for_user(old.user_id, tg_table_name || ':delete');
  elsif tg_op = 'UPDATE' then
    if old.user_id is distinct from new.user_id then
      perform public.enqueue_badge_counter_recalc_for_user(old.user_id, tg_table_name || ':update_old');
    end if;
    perform public.enqueue_badge_counter_recalc_for_user(new.user_id, tg_table_name || ':update_new');
  else
    perform public.enqueue_badge_counter_recalc_for_user(new.user_id, tg_table_name || ':insert');
  end if;
  return null;
end;
$$;

create or replace function public._trg_enqueue_badges_on_reviewer_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_badge_counter_recalc_for_user(old.reviewer_id, tg_table_name || ':delete');
  elsif tg_op = 'UPDATE' then
    if old.reviewer_id is distinct from new.reviewer_id then
      perform public.enqueue_badge_counter_recalc_for_user(old.reviewer_id, tg_table_name || ':update_old');
    end if;
    perform public.enqueue_badge_counter_recalc_for_user(new.reviewer_id, tg_table_name || ':update_new');
  else
    perform public.enqueue_badge_counter_recalc_for_user(new.reviewer_id, tg_table_name || ':insert');
  end if;
  return null;
end;
$$;

create or replace function public._trg_enqueue_badges_on_recipient_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_badge_counter_recalc_for_user(old.recipient_id, tg_table_name || ':delete');
  elsif tg_op = 'UPDATE' then
    if old.recipient_id is distinct from new.recipient_id then
      perform public.enqueue_badge_counter_recalc_for_user(old.recipient_id, tg_table_name || ':update_old');
    end if;
    perform public.enqueue_badge_counter_recalc_for_user(new.recipient_id, tg_table_name || ':update_new');
  else
    perform public.enqueue_badge_counter_recalc_for_user(new.recipient_id, tg_table_name || ':insert');
  end if;
  return null;
end;
$$;

create or replace function public._trg_enqueue_badges_on_org_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_org uuid;
  v_new_org uuid;
begin
  v_old_org := case when tg_op in ('UPDATE', 'DELETE') then old.org_id else null end;
  v_new_org := case when tg_op in ('UPDATE', 'INSERT') then new.org_id else null end;

  if v_old_org is not null then
    perform public.enqueue_badge_counter_recalc_for_org(v_old_org, tg_table_name || ':org_old');
  end if;
  if v_new_org is not null and v_new_org is distinct from v_old_org then
    perform public.enqueue_badge_counter_recalc_for_org(v_new_org, tg_table_name || ':org_new');
  end if;

  return null;
end;
$$;

drop trigger if exists trg_badges_broadcast_reads_queue on public.broadcast_reads;
create trigger trg_badges_broadcast_reads_queue
after insert or update or delete on public.broadcast_reads
for each row execute function public._trg_enqueue_badges_on_user_row();

drop trigger if exists trg_badges_recruitment_notifications_queue on public.recruitment_notifications;
create trigger trg_badges_recruitment_notifications_queue
after insert or update or delete on public.recruitment_notifications
for each row execute function public._trg_enqueue_badges_on_recipient_row();

drop trigger if exists trg_badges_application_notifications_queue on public.application_notifications;
create trigger trg_badges_application_notifications_queue
after insert or update or delete on public.application_notifications
for each row execute function public._trg_enqueue_badges_on_recipient_row();

drop trigger if exists trg_badges_leave_notifications_queue on public.leave_notifications;
create trigger trg_badges_leave_notifications_queue
after insert or update or delete on public.leave_notifications
for each row execute function public._trg_enqueue_badges_on_recipient_row();

drop trigger if exists trg_badges_hr_metric_notifications_queue on public.hr_metric_notifications;
create trigger trg_badges_hr_metric_notifications_queue
after insert or update or delete on public.hr_metric_notifications
for each row execute function public._trg_enqueue_badges_on_recipient_row();

drop trigger if exists trg_badges_calendar_event_notifications_queue on public.calendar_event_notifications;
create trigger trg_badges_calendar_event_notifications_queue
after insert or update or delete on public.calendar_event_notifications
for each row execute function public._trg_enqueue_badges_on_recipient_row();

drop trigger if exists trg_badges_performance_reviews_queue on public.performance_reviews;
create trigger trg_badges_performance_reviews_queue
after insert or update or delete on public.performance_reviews
for each row execute function public._trg_enqueue_badges_on_reviewer_row();

drop trigger if exists trg_badges_onboarding_runs_queue on public.onboarding_runs;
create trigger trg_badges_onboarding_runs_queue
after insert or update or delete on public.onboarding_runs
for each row execute function public._trg_enqueue_badges_on_user_row();

drop trigger if exists trg_badges_broadcasts_queue on public.broadcasts;
create trigger trg_badges_broadcasts_queue
after insert or update or delete on public.broadcasts
for each row execute function public._trg_enqueue_badges_on_org_row();

drop trigger if exists trg_badges_rota_change_requests_queue on public.rota_change_requests;
create trigger trg_badges_rota_change_requests_queue
after insert or update or delete on public.rota_change_requests
for each row execute function public._trg_enqueue_badges_on_org_row();

drop trigger if exists trg_badges_leave_requests_queue on public.leave_requests;
create trigger trg_badges_leave_requests_queue
after insert or update or delete on public.leave_requests
for each row execute function public._trg_enqueue_badges_on_org_row();

drop trigger if exists trg_badges_toil_credit_requests_queue on public.toil_credit_requests;
create trigger trg_badges_toil_credit_requests_queue
after insert or update or delete on public.toil_credit_requests
for each row execute function public._trg_enqueue_badges_on_org_row();

drop trigger if exists trg_badges_recruitment_requests_queue on public.recruitment_requests;
create trigger trg_badges_recruitment_requests_queue
after insert or update or delete on public.recruitment_requests
for each row execute function public._trg_enqueue_badges_on_org_row();

drop trigger if exists trg_badges_profiles_queue on public.profiles;
create trigger trg_badges_profiles_queue
after insert or update or delete on public.profiles
for each row execute function public._trg_enqueue_badges_on_org_row();

-- Backfill queue once so existing users get a cached row quickly.
insert into public.badge_counter_recalc_queue (user_id, org_id, reason, requested_at)
select p.id, p.org_id, 'initial_backfill', now()
from public.profiles p
where p.org_id is not null
  and p.status = 'active'
on conflict (user_id) do nothing;

revoke all on table public.badge_counter_recalc_queue from public;
revoke all on table public.user_badge_counters from public;

grant select on table public.user_badge_counters to authenticated;

grant execute on function public.main_shell_badge_counts_bundle() to authenticated;
