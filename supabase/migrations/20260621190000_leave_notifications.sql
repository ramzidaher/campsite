-- In-app notifications when a manager decides on leave (approve / reject / cancel / edit flows).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.leave_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  leave_request_id uuid not null references public.leave_requests(id) on delete cascade,
  event text not null check (
    event in (
      'leave_approved',
      'leave_rejected',
      'cancellation_approved',
      'cancellation_declined',
      'edit_approved',
      'edit_declined'
    )
  ),
  actor_name text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists leave_notifications_recipient_idx
  on public.leave_notifications (recipient_id, read_at, created_at desc);

create index if not exists leave_notifications_request_idx
  on public.leave_notifications (leave_request_id);

alter table public.leave_notifications enable row level security;

drop policy if exists "users see own leave notifications" on public.leave_notifications;
create policy "users see own leave notifications"
  on public.leave_notifications for select
  using (recipient_id = auth.uid());

drop policy if exists "service role manages leave notifications" on public.leave_notifications;
create policy "service role manages leave notifications"
  on public.leave_notifications for all
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- Internal: insert a row for the requester (best-effort  never raises)
-- ---------------------------------------------------------------------------

create or replace function public.leave_notify_requester_decision(
  p_org_id uuid,
  p_leave_request_id uuid,
  p_requester_id uuid,
  p_event text,
  p_decider_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  if p_requester_id is null or p_decider_id is null then
    return;
  end if;

  if p_requester_id = p_decider_id then
    return;
  end if;

  if p_event not in (
    'leave_approved',
    'leave_rejected',
    'cancellation_approved',
    'cancellation_declined',
    'edit_approved',
    'edit_declined'
  ) then
    return;
  end if;

  select nullif(trim(coalesce(full_name, '')), '') into v_actor
  from public.profiles
  where id = p_decider_id;

  begin
    insert into public.leave_notifications (org_id, recipient_id, leave_request_id, event, actor_name)
    values (p_org_id, p_requester_id, p_leave_request_id, p_event, v_actor);
  exception
    when others then
      null;
  end;
end;
$$;

revoke all on function public.leave_notify_requester_decision(uuid, uuid, uuid, text, uuid) from public;

-- ---------------------------------------------------------------------------
-- RPC: mark one read
-- ---------------------------------------------------------------------------

create or replace function public.leave_notification_mark_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leave_notifications
  set read_at = now()
  where id = p_notification_id
    and recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.leave_notification_mark_read(uuid) from public;
grant execute on function public.leave_notification_mark_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: mark all read
-- ---------------------------------------------------------------------------

create or replace function public.leave_notifications_mark_all_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leave_notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.leave_notifications_mark_all_read() from public;
grant execute on function public.leave_notifications_mark_all_read() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: unread count (bell badge)
-- ---------------------------------------------------------------------------

create or replace function public.leave_notifications_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.leave_notifications
  where recipient_id = auth.uid()
    and read_at is null;
$$;

revoke all on function public.leave_notifications_unread_count() from public;
grant execute on function public.leave_notifications_unread_count() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: list for current user
-- ---------------------------------------------------------------------------

create or replace function public.leave_notifications_for_me()
returns table (
  id uuid,
  leave_request_id uuid,
  event text,
  actor_name text,
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
    n.leave_request_id,
    n.event,
    n.actor_name,
    n.read_at,
    n.created_at
  from public.leave_notifications n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit 75;
$$;

revoke all on function public.leave_notifications_for_me() from public;
grant execute on function public.leave_notifications_for_me() to authenticated;

-- ---------------------------------------------------------------------------
-- leave_request_decide: notify requester after each successful outcome
-- ---------------------------------------------------------------------------

create or replace function public.leave_request_decide(
  p_request_id uuid,
  p_approve boolean,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_requester uuid;
  v_kind text;
  v_start date;
  v_end date;
  v_note text;
  v_status text;
  v_days numeric;
  v_yk text;
  v_ent numeric;
  v_used_other numeric;
  v_bal numeric;
  v_pending_toil numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.leave_can_decide_request(v_uid, p_request_id) then
    raise exception 'not allowed';
  end if;

  select
    org_id,
    requester_id,
    coalesce(proposed_kind, kind),
    coalesce(proposed_start_date, start_date),
    coalesce(proposed_end_date, end_date),
    coalesce(proposed_note, note),
    status
  into v_org, v_requester, v_kind, v_start, v_end, v_note, v_status
  from public.leave_requests
  where id = p_request_id;

  if v_status not in ('pending', 'pending_cancel', 'pending_edit') then
    raise exception 'request is not awaiting approval';
  end if;

  if v_status = 'pending_cancel' then
    if p_approve then
      update public.leave_requests
      set
        status = 'cancelled',
        decided_by = v_uid,
        decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), ''),
        requested_action_at = null,
        proposed_kind = null,
        proposed_start_date = null,
        proposed_end_date = null,
        proposed_note = null,
        updated_at = now()
      where id = p_request_id;
      perform public.leave_notify_requester_decision(v_org, p_request_id, v_requester, 'cancellation_approved', v_uid);
    else
      update public.leave_requests
      set
        status = 'approved',
        decided_by = v_uid,
        decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), ''),
        requested_action_at = null,
        proposed_kind = null,
        proposed_start_date = null,
        proposed_end_date = null,
        proposed_note = null,
        updated_at = now()
      where id = p_request_id;
      perform public.leave_notify_requester_decision(v_org, p_request_id, v_requester, 'cancellation_declined', v_uid);
    end if;
    return;
  end if;

  if not p_approve then
    if v_status = 'pending_edit' then
      update public.leave_requests
      set
        status = 'approved',
        decided_by = v_uid,
        decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), ''),
        requested_action_at = null,
        proposed_kind = null,
        proposed_start_date = null,
        proposed_end_date = null,
        proposed_note = null,
        updated_at = now()
      where id = p_request_id;
      perform public.leave_notify_requester_decision(v_org, p_request_id, v_requester, 'edit_declined', v_uid);
    else
      update public.leave_requests
      set
        status = 'rejected',
        decided_by = v_uid,
        decided_at = now(),
        decision_note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
      where id = p_request_id;
      perform public.leave_notify_requester_decision(v_org, p_request_id, v_requester, 'leave_rejected', v_uid);
    end if;
    return;
  end if;

  if public.leave_request_has_overlap(v_org, v_requester, v_start, v_end, p_request_id) then
    raise exception 'leave request overlaps an existing booking';
  end if;

  v_days := public.leave_org_day_count_inclusive(v_org, v_start, v_end);
  v_yk := public.leave_calendar_year_key(v_org, v_start);
  perform public.leave_ensure_allowance_row(v_org, v_requester, v_yk);

  if v_kind = 'annual' then
    select la.annual_entitlement_days into v_ent
    from public.leave_allowances la
    where la.org_id = v_org and la.user_id = v_requester and la.leave_year = v_yk;

    v_used_other :=
      public.leave_sum_request_days(v_org, v_requester, 'annual', v_yk, array['pending', 'approved', 'pending_edit']::text[], p_request_id)
      + v_days;

    if v_used_other > coalesce(v_ent, 0) then
      raise exception 'annual leave would exceed entitlement';
    end if;
  else
    select la.toil_balance_days into v_bal
    from public.leave_allowances la
    where la.org_id = v_org and la.user_id = v_requester and la.leave_year = v_yk;

    v_pending_toil := public.leave_pending_toil_days_excluding(v_org, v_requester, v_yk, p_request_id);
    if coalesce(v_bal, 0) - v_pending_toil < v_days then
      raise exception 'insufficient TOIL balance';
    end if;
  end if;

  if v_status = 'pending_edit' then
    update public.leave_requests
    set
      kind = v_kind,
      start_date = v_start,
      end_date = v_end,
      note = v_note,
      status = 'approved',
      decided_by = v_uid,
      decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), ''),
      requested_action_at = null,
      proposed_kind = null,
      proposed_start_date = null,
      proposed_end_date = null,
      proposed_note = null,
      updated_at = now()
    where id = p_request_id;
    perform public.leave_notify_requester_decision(v_org, p_request_id, v_requester, 'edit_approved', v_uid);
    return;
  end if;

  if v_kind = 'toil' then
    update public.leave_allowances
    set
      toil_balance_days = toil_balance_days - v_days,
      updated_at = now()
    where org_id = v_org and user_id = v_requester and leave_year = v_yk;
  end if;

  update public.leave_requests
  set
    status = 'approved',
    decided_by = v_uid,
    decided_at = now(),
    decision_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_request_id;
  perform public.leave_notify_requester_decision(v_org, p_request_id, v_requester, 'leave_approved', v_uid);
end;
$$;

revoke all on function public.leave_request_decide(uuid, boolean, text) from public;
grant execute on function public.leave_request_decide(uuid, boolean, text) to authenticated;
