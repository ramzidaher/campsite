-- Phase 2 follow-up: rollout flags + counter contract + reconciliation helpers.

create table if not exists public.shell_counter_rollout_flags (
  org_id uuid primary key references public.organisations(id) on delete cascade,
  broadcast_enabled boolean not null default true,
  approvals_enabled boolean not null default true,
  scheduling_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.shell_counter_rollout_flags enable row level security;

drop policy if exists "shell_counter_rollout_flags_select_org_admin" on public.shell_counter_rollout_flags;
create policy "shell_counter_rollout_flags_select_org_admin"
on public.shell_counter_rollout_flags
for select
to authenticated
using (
  public.has_permission(auth.uid(), org_id, 'org.settings.manage', '{}'::jsonb)
);

create or replace function public.user_shell_counters()
returns table (
  user_id uuid,
  org_id uuid,
  broadcast_unread integer,
  broadcast_pending_approvals integer,
  recruitment_notifications integer,
  application_notifications integer,
  leave_notifications integer,
  hr_metric_notifications integer,
  calendar_event_notifications integer,
  pending_approvals integer,
  leave_pending_approval integer,
  recruitment_pending_review integer,
  performance_pending integer,
  onboarding_active integer,
  rota_pending_final integer,
  rota_pending_peer integer,
  computed_at timestamptz,
  version bigint
)
language sql
stable
set search_path = public
as $$
  select
    ubc.user_id,
    ubc.org_id,
    ubc.broadcast_unread,
    ubc.broadcast_pending_approvals,
    ubc.recruitment_notifications,
    ubc.application_notifications,
    ubc.leave_notifications,
    ubc.hr_metric_notifications,
    ubc.calendar_event_notifications,
    ubc.pending_approvals,
    ubc.leave_pending_approval,
    ubc.recruitment_pending_review,
    ubc.performance_pending,
    ubc.onboarding_active,
    ubc.rota_pending_final,
    ubc.rota_pending_peer,
    ubc.computed_at,
    ubc.version
  from public.user_badge_counters ubc;
$$;

create or replace function public.set_shell_counter_rollout_flags(
  p_org_id uuid,
  p_broadcast_enabled boolean default null,
  p_approvals_enabled boolean default null,
  p_scheduling_enabled boolean default null
)
returns public.shell_counter_rollout_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.shell_counter_rollout_flags%rowtype;
begin
  if p_org_id is null then
    raise exception 'org_id is required';
  end if;

  if not public.has_permission(v_actor, p_org_id, 'org.settings.manage', '{}'::jsonb) then
    raise exception 'insufficient permissions';
  end if;

  insert into public.shell_counter_rollout_flags (
    org_id,
    broadcast_enabled,
    approvals_enabled,
    scheduling_enabled,
    updated_at
  )
  values (
    p_org_id,
    coalesce(p_broadcast_enabled, true),
    coalesce(p_approvals_enabled, true),
    coalesce(p_scheduling_enabled, true),
    now()
  )
  on conflict (org_id) do update
  set broadcast_enabled = coalesce(p_broadcast_enabled, public.shell_counter_rollout_flags.broadcast_enabled),
      approvals_enabled = coalesce(p_approvals_enabled, public.shell_counter_rollout_flags.approvals_enabled),
      scheduling_enabled = coalesce(p_scheduling_enabled, public.shell_counter_rollout_flags.scheduling_enabled),
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.shell_counter_apply_delta(
  p_user_id uuid,
  p_org_id uuid,
  p_counter_key text,
  p_mode text default 'increment',
  p_delta integer default 0,
  p_set_value integer default null
)
returns public.user_badge_counters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_badge_counters%rowtype;
begin
  if p_user_id is null or p_org_id is null then
    raise exception 'user_id and org_id are required';
  end if;

  insert into public.user_badge_counters (user_id, org_id)
  values (p_user_id, p_org_id)
  on conflict (user_id) do nothing;

  if p_mode = 'set' then
    if p_set_value is null then
      raise exception 'set mode requires p_set_value';
    end if;
    execute format(
      'update public.user_badge_counters set %I = greatest(0, $1), computed_at = now(), version = version + 1 where user_id = $2 returning *',
      p_counter_key
    )
    using p_set_value, p_user_id
    into v_row;
  elsif p_mode = 'decrement' then
    execute format(
      'update public.user_badge_counters set %I = greatest(0, %I - $1), computed_at = now(), version = version + 1 where user_id = $2 returning *',
      p_counter_key,
      p_counter_key
    )
    using abs(coalesce(p_delta, 0)), p_user_id
    into v_row;
  else
    execute format(
      'update public.user_badge_counters set %I = greatest(0, %I + $1), computed_at = now(), version = version + 1 where user_id = $2 returning *',
      p_counter_key,
      p_counter_key
    )
    using abs(coalesce(p_delta, 0)), p_user_id
    into v_row;
  end if;

  return v_row;
end;
$$;

create or replace function public.backfill_user_badge_counters(p_batch integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
begin
  insert into public.badge_counter_recalc_queue (user_id, org_id, reason, requested_at)
  select p.id, p.org_id, 'phase2_backfill', now()
  from public.profiles p
  where p.org_id is not null
    and p.status = 'active'
  on conflict (user_id) do update
  set requested_at = excluded.requested_at,
      reason = excluded.reason;

  v_processed := public.process_badge_counter_recalc_queue(greatest(1, least(coalesce(p_batch, 500), 2000)));
  return v_processed;
end;
$$;

create or replace function public.reconcile_user_badge_counters(
  p_org_id uuid default null,
  p_limit integer default 500
)
returns table (
  processed integer,
  repaired integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_processed integer := 0;
  v_repaired integer := 0;
  v_before jsonb;
  v_after jsonb;
begin
  for r in
    select p.id as user_id
    from public.profiles p
    where p.status = 'active'
      and (p_org_id is null or p.org_id = p_org_id)
    order by p.id
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
  loop
    v_processed := v_processed + 1;

    select public._badge_counts_json_from_row(ubc)
      into v_before
    from public.user_badge_counters ubc
    where ubc.user_id = r.user_id;

    v_after := public.refresh_user_badge_counters(r.user_id);

    if coalesce(v_before, '{}'::jsonb) is distinct from coalesce(v_after, '{}'::jsonb) then
      v_repaired := v_repaired + 1;
    end if;
  end loop;

  return query select v_processed, v_repaired;
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

  if not found or v_cached.computed_at < (now() - interval '60 seconds') then
    perform public.refresh_user_badge_counters(v_uid);
    select *
      into v_cached
    from public.user_badge_counters ubc
    where ubc.user_id = v_uid;
  end if;

  if found then
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

  if not (v_broadcast_enabled and v_approvals_enabled and v_scheduling_enabled) then
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

  if not found or v_cached.computed_at < (now() - interval '60 seconds') then
    perform public.refresh_user_badge_counters(v_uid);
    select *
      into v_cached
    from public.user_badge_counters ubc
    where ubc.user_id = v_uid;
  end if;

  return jsonb_build_object(
    'rota_pending_final', coalesce(v_cached.rota_pending_final, 0),
    'rota_pending_peer', coalesce(v_cached.rota_pending_peer, 0),
    'pending_approvals', coalesce(v_cached.pending_approvals, 0)
  );
end;
$$;

grant execute on function public.user_shell_counters() to authenticated;
grant execute on function public.set_shell_counter_rollout_flags(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.shell_counter_apply_delta(uuid, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.backfill_user_badge_counters(integer) to authenticated;
grant execute on function public.reconcile_user_badge_counters(uuid, integer) to authenticated;
grant execute on function public.main_shell_badge_counts_bundle() to authenticated;
grant execute on function public.main_shell_scheduling_bundle() to authenticated;
