-- Emergency stabilization: remove all synchronous refresh_user_badge_counters calls
-- from shell read paths. Everything is now enqueue-only.
-- Root cause: 199000 restored sync refresh on missing rows, causing connection pool
-- exhaustion under any non-trivial load (refresh_user_badge_counters runs 15+ queries).

create or replace function public.main_shell_badge_counts_bundle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid                  uuid := auth.uid();
  v_org_id               uuid;
  v_cached               public.user_badge_counters%rowtype;
  v_result               jsonb := '{}'::jsonb;
  v_broadcast_enabled    boolean;
  v_approvals_enabled    boolean;
  v_scheduling_enabled   boolean;
  v_have_counters        boolean := false;
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select p.org_id into v_org_id
  from public.profiles p
  where p.id = v_uid;

  if v_org_id is null then
    return '{}'::jsonb;
  end if;

  select * into v_cached
  from public.user_badge_counters ubc
  where ubc.user_id = v_uid;

  v_have_counters := found;

  if not v_have_counters then
    -- Never block on a full recompute  enqueue and return empty.
    perform public.enqueue_badge_counter_recalc_for_user(v_uid, 'missing_shell_read');
    return '{}'::jsonb;
  end if;

  if v_cached.computed_at < (now() - interval '60 seconds') then
    perform public.enqueue_badge_counter_recalc_for_user(v_uid, 'stale_shell_read');
  end if;

  v_result := public._badge_counts_json_from_row(v_cached);

  -- Rollout-flag overlay: if any feature counter is still being computed live,
  -- use the cached row value (already computed above) instead of a synchronous
  -- refresh. This removes the second potential sync-refresh path.
  select
    coalesce(f.broadcast_enabled, true),
    coalesce(f.approvals_enabled, true),
    coalesce(f.scheduling_enabled, true)
    into v_broadcast_enabled, v_approvals_enabled, v_scheduling_enabled
  from public.shell_counter_rollout_flags f
  where f.org_id = v_org_id;

  if not found then
    v_broadcast_enabled  := true;
    v_approvals_enabled  := true;
    v_scheduling_enabled := true;
  end if;

  -- If a flag is disabled the cache row already has the right value from
  -- the last background recalc  just surface it. If it looks stale,
  -- the enqueue above will refresh it within the next cron cycle.
  if not v_broadcast_enabled then
    v_result := jsonb_set(v_result, '{broadcast_unread}',
      coalesce(v_result -> 'broadcast_unread', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{broadcast_pending_approvals}',
      coalesce(v_result -> 'broadcast_pending_approvals', '0'::jsonb), true);
  end if;

  if not v_approvals_enabled then
    v_result := jsonb_set(v_result, '{pending_approvals}',
      coalesce(v_result -> 'pending_approvals', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{leave_pending_approval}',
      coalesce(v_result -> 'leave_pending_approval', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{recruitment_pending_review}',
      coalesce(v_result -> 'recruitment_pending_review', '0'::jsonb), true);
  end if;

  if not v_scheduling_enabled then
    v_result := jsonb_set(v_result, '{rota_pending_final}',
      coalesce(v_result -> 'rota_pending_final', '0'::jsonb), true);
    v_result := jsonb_set(v_result, '{rota_pending_peer}',
      coalesce(v_result -> 'rota_pending_peer', '0'::jsonb), true);
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
  v_uid           uuid := auth.uid();
  v_cached        public.user_badge_counters%rowtype;
  v_have_counters boolean := false;
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select * into v_cached
  from public.user_badge_counters ubc
  where ubc.user_id = v_uid;

  v_have_counters := found;

  if not v_have_counters then
    perform public.enqueue_badge_counter_recalc_for_user(v_uid, 'missing_scheduling_shell_read');
    return jsonb_build_object(
      'rota_pending_final', 0,
      'rota_pending_peer',  0,
      'pending_approvals',  0
    );
  end if;

  if v_cached.computed_at < (now() - interval '60 seconds') then
    perform public.enqueue_badge_counter_recalc_for_user(v_uid, 'stale_scheduling_shell_read');
  end if;

  return jsonb_build_object(
    'rota_pending_final', coalesce(v_cached.rota_pending_final, 0),
    'rota_pending_peer',  coalesce(v_cached.rota_pending_peer,  0),
    'pending_approvals',  coalesce(v_cached.pending_approvals,  0)
  );
end;
$$;
