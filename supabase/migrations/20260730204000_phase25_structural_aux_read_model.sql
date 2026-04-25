-- Phase 2.5 last-mile: structural aux read model.
-- Move expensive structural fields off the hot read path:
-- - permission_keys
-- - dept_name
-- - org_celebration_mode_overrides

create table if not exists public.user_shell_structural_aux (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  dept_name text,
  permission_keys jsonb not null default '[]'::jsonb,
  org_celebration_mode_overrides jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists user_shell_structural_aux_org_idx
  on public.user_shell_structural_aux (org_id);

create index if not exists user_shell_structural_aux_computed_at_idx
  on public.user_shell_structural_aux (computed_at desc);

alter table public.user_shell_structural_aux enable row level security;

drop policy if exists "user_shell_structural_aux_select_own" on public.user_shell_structural_aux;
create policy "user_shell_structural_aux_select_own"
on public.user_shell_structural_aux
for select
to authenticated
using (auth.uid() = user_id);

create table if not exists public.shell_structural_aux_recalc_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text,
  requested_at timestamptz not null default now()
);

create index if not exists shell_structural_aux_recalc_queue_requested_at_idx
  on public.shell_structural_aux_recalc_queue (requested_at asc);

alter table public.shell_structural_aux_recalc_queue enable row level security;

create or replace function public.enqueue_shell_structural_aux_recalc_for_user(
  p_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.shell_structural_aux_recalc_queue (user_id, reason, requested_at)
  values (p_user_id, p_reason, now())
  on conflict (user_id) do update
  set requested_at = excluded.requested_at,
      reason = coalesce(excluded.reason, public.shell_structural_aux_recalc_queue.reason)
  where public.shell_structural_aux_recalc_queue.requested_at < (now() - interval '15 seconds')
     or public.shell_structural_aux_recalc_queue.reason is distinct from excluded.reason;
end;
$$;

create or replace function public.refresh_user_shell_structural_aux(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := p_user_id;
  v_org_id uuid;
  v_dept_name text;
  v_permission_keys jsonb := '[]'::jsonb;
  v_overrides jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return '{}'::jsonb;
  end if;

  select p.org_id
    into v_org_id
  from public.profiles p
  where p.id = v_uid;

  if v_org_id is null then
    delete from public.user_shell_structural_aux where user_id = v_uid;
    delete from public.shell_structural_aux_recalc_queue where user_id = v_uid;
    return '{}'::jsonb;
  end if;

  select d.name
    into v_dept_name
  from public.user_departments ud
  join public.departments d on d.id = ud.dept_id
  where ud.user_id = v_uid
  limit 1;

  select coalesce(jsonb_agg(gmp.permission_key), '[]'::jsonb)
    into v_permission_keys
  from public.get_my_permissions(v_org_id) gmp;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'mode_key', m.mode_key,
        'label', m.label,
        'is_enabled', m.is_enabled,
        'display_order', m.display_order,
        'auto_start_month', m.auto_start_month,
        'auto_start_day', m.auto_start_day,
        'auto_end_month', m.auto_end_month,
        'auto_end_day', m.auto_end_day,
        'gradient_override', m.gradient_override,
        'emoji_primary', m.emoji_primary,
        'emoji_secondary', m.emoji_secondary
      )
      order by m.display_order asc, m.label asc
    ),
    '[]'::jsonb
  )
  into v_overrides
  from public.org_celebration_modes m
  where m.org_id = v_org_id;

  insert into public.user_shell_structural_aux (
    user_id, org_id, dept_name, permission_keys, org_celebration_mode_overrides, computed_at, version
  )
  values (
    v_uid, v_org_id, v_dept_name, coalesce(v_permission_keys, '[]'::jsonb), coalesce(v_overrides, '[]'::jsonb), now(), 1
  )
  on conflict (user_id) do update
  set org_id = excluded.org_id,
      dept_name = excluded.dept_name,
      permission_keys = excluded.permission_keys,
      org_celebration_mode_overrides = excluded.org_celebration_mode_overrides,
      computed_at = now(),
      version = public.user_shell_structural_aux.version + 1;

  delete from public.shell_structural_aux_recalc_queue where user_id = v_uid;

  return jsonb_build_object(
    'dept_name', v_dept_name,
    'permission_keys', coalesce(v_permission_keys, '[]'::jsonb),
    'org_celebration_mode_overrides', coalesce(v_overrides, '[]'::jsonb)
  );
end;
$$;

create or replace function public.process_shell_structural_aux_recalc_queue(p_limit integer default 200)
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
    from public.shell_structural_aux_recalc_queue q
    order by q.requested_at asc
    limit greatest(1, least(coalesce(p_limit, 200), 5000))
  loop
    perform public.refresh_user_shell_structural_aux(r.user_id);
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

create or replace function public.main_shell_layout_structural()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_org_id uuid;
  v_role   text;
  v_email  text;
  v_full_name text;
  v_avatar_url text;
  v_status text;
  v_reauth timestamptz;
  v_celebration_mode text;
  v_celebration_auto boolean;
  v_ui_mode text;
  v_org_name text;
  v_org_logo_url text;
  v_org_is_locked boolean;
  v_org_maintenance boolean;
  v_org_sub_status text;
  v_org_trial_ends timestamptz;
  v_org_force_logout timestamptz;
  v_org_brand_preset text;
  v_org_brand_tokens jsonb;
  v_org_brand_policy text;
  v_is_platform boolean;
  v_aux public.user_shell_structural_aux%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('authenticated', false, 'has_profile', false);
  end if;

  select
    p.org_id,
    p.role,
    au.email,
    p.full_name,
    p.avatar_url,
    p.status,
    p.reauth_required_at,
    p.celebration_mode,
    p.celebration_auto_enabled,
    p.ui_mode,
    o.name,
    o.logo_url,
    o.is_locked,
    o.maintenance_mode,
    o.subscription_status,
    o.subscription_trial_ends_at,
    o.force_logout_after,
    o.brand_preset_key,
    o.brand_tokens,
    o.brand_policy
  into
    v_org_id,
    v_role,
    v_email,
    v_full_name,
    v_avatar_url,
    v_status,
    v_reauth,
    v_celebration_mode,
    v_celebration_auto,
    v_ui_mode,
    v_org_name,
    v_org_logo_url,
    v_org_is_locked,
    v_org_maintenance,
    v_org_sub_status,
    v_org_trial_ends,
    v_org_force_logout,
    v_org_brand_preset,
    v_org_brand_tokens,
    v_org_brand_policy
  from public.profiles p
  left join auth.users au on au.id = p.id
  left join public.organisations o on o.id = p.org_id
  where p.id = v_uid;

  if not found then
    select au.email into v_email
    from auth.users au
    where au.id = v_uid;

    return jsonb_build_object(
      'authenticated', true,
      'has_profile', false,
      'email', v_email,
      'is_platform_operator', public.is_platform_admin()
    );
  end if;

  v_is_platform := public.is_platform_admin();

  if v_org_id is null then
    return jsonb_build_object(
      'authenticated', true,
      'has_profile', (v_role is not null),
      'email', v_email,
      'is_platform_operator', v_is_platform
    );
  end if;

  select *
    into v_aux
  from public.user_shell_structural_aux a
  where a.user_id = v_uid;

  if not found then
    perform public.enqueue_shell_structural_aux_recalc_for_user(v_uid, 'missing_structural_aux');
    v_aux.dept_name := null;
    v_aux.permission_keys := '[]'::jsonb;
    v_aux.org_celebration_mode_overrides := '[]'::jsonb;
  elsif v_aux.computed_at < (now() - interval '180 seconds') then
    perform public.enqueue_shell_structural_aux_recalc_for_user(v_uid, 'stale_structural_aux');
  end if;

  return jsonb_build_object(
    'authenticated', true,
    'has_profile', true,
    'email', v_email,
    'is_platform_operator', v_is_platform,
    'profile_role', v_role,
    'profile_full_name', v_full_name,
    'profile_avatar_url', v_avatar_url,
    'profile_status', v_status,
    'org_id', v_org_id::text,
    'profile_reauth_required_at', v_reauth,
    'org_name', coalesce(v_org_name, 'Organisation'),
    'org_logo_url', v_org_logo_url,
    'org_is_locked', coalesce(v_org_is_locked, false),
    'org_maintenance_mode', coalesce(v_org_maintenance, false),
    'org_subscription_status', v_org_sub_status,
    'org_subscription_trial_ends_at', v_org_trial_ends,
    'org_force_logout_after', v_org_force_logout,
    'org_brand_preset_key', v_org_brand_preset,
    'org_brand_tokens', coalesce(v_org_brand_tokens, '{}'::jsonb),
    'org_brand_policy', coalesce(v_org_brand_policy, 'brand_base_with_celebration_accents'),
    'dept_name', v_aux.dept_name,
    'permission_keys', coalesce(v_aux.permission_keys, '[]'::jsonb),
    'celebration_mode', v_celebration_mode,
    'celebration_auto_enabled', v_celebration_auto,
    'ui_mode', v_ui_mode,
    'org_celebration_mode_overrides', coalesce(v_aux.org_celebration_mode_overrides, '[]'::jsonb)
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
    where jobname = 'process-shell-structural-aux-recalc-queue'
    limit 1;

    if v_job_id is null then
      perform cron.schedule(
        'process-shell-structural-aux-recalc-queue',
        '* * * * *',
        $job$select public.process_shell_structural_aux_recalc_queue(2000);$job$
      );
    end if;
  end if;
end
$cron$;

grant execute on function public.enqueue_shell_structural_aux_recalc_for_user(uuid, text) to authenticated;
grant execute on function public.refresh_user_shell_structural_aux(uuid) to authenticated;
grant execute on function public.process_shell_structural_aux_recalc_queue(integer) to authenticated;
