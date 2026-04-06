-- Org subscription trial (14 days for new orgs) + founder portal governance fields.
-- No payment provider integration; founders manage status and trial dates manually.

alter table public.organisations
  drop constraint if exists organisations_subscription_status_check;

alter table public.organisations
  add constraint organisations_subscription_status_check
  check (subscription_status in ('trial', 'active', 'limited', 'suspended'));

alter table public.organisations
  add column if not exists subscription_trial_started_at timestamptz,
  add column if not exists subscription_trial_ends_at timestamptz;

alter table public.organisations
  alter column subscription_status set default 'trial';

create or replace function public.organisations_default_trial_on_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.subscription_status = 'trial' then
    if new.subscription_trial_started_at is null then
      new.subscription_trial_started_at := now();
    end if;
    if new.subscription_trial_ends_at is null then
      new.subscription_trial_ends_at := new.subscription_trial_started_at + interval '14 days';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_organisations_default_trial on public.organisations;
create trigger trg_organisations_default_trial
  before insert on public.organisations
  for each row
  execute function public.organisations_default_trial_on_insert();

create or replace function public.platform_organisations_list()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not allowed';
  end if;
  return coalesce(
    (
      select jsonb_agg(row_data order by sort_created desc)
      from (
        select
          o.created_at as sort_created,
          jsonb_build_object(
            'id', o.id,
            'name', o.name,
            'slug', o.slug,
            'is_active', o.is_active,
            'created_at', o.created_at,
            'logo_url', o.logo_url,
            'plan_tier', o.plan_tier,
            'subscription_status', o.subscription_status,
            'is_locked', o.is_locked,
            'maintenance_mode', o.maintenance_mode,
            'force_logout_after', o.force_logout_after,
            'subscription_trial_started_at', o.subscription_trial_started_at,
            'subscription_trial_ends_at', o.subscription_trial_ends_at,
            'user_count', (select count(*)::int from public.profiles p where p.org_id = o.id),
            'broadcast_count', (select count(*)::int from public.broadcasts b where b.org_id = o.id)
          ) as row_data
        from public.organisations o
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.platform_organisations_list() from public;
grant execute on function public.platform_organisations_list() to authenticated;

drop function if exists public.platform_update_org_governance(uuid, text, text, boolean, boolean, boolean);

create or replace function public.platform_update_org_governance(
  p_org_id uuid,
  p_plan_tier text,
  p_subscription_status text,
  p_is_locked boolean,
  p_maintenance_mode boolean,
  p_force_logout boolean default false,
  p_trial_ends_at timestamptz default null,
  p_clear_trial boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_o public.organisations%rowtype;
  v_new_status text;
begin
  if not public.platform_is_founder(auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into strict v_o from public.organisations where id = p_org_id;

  select jsonb_build_object(
    'plan_tier', v_o.plan_tier,
    'subscription_status', v_o.subscription_status,
    'is_locked', v_o.is_locked,
    'maintenance_mode', v_o.maintenance_mode,
    'force_logout_after', v_o.force_logout_after,
    'subscription_trial_started_at', v_o.subscription_trial_started_at,
    'subscription_trial_ends_at', v_o.subscription_trial_ends_at
  )
  into v_before;

  v_new_status := case
    when p_subscription_status in ('trial', 'active', 'limited', 'suspended') then p_subscription_status
    else v_o.subscription_status
  end;

  update public.organisations o
  set
    plan_tier = coalesce(nullif(trim(coalesce(p_plan_tier, '')), ''), o.plan_tier),
    subscription_status = v_new_status,
    is_locked = coalesce(p_is_locked, o.is_locked),
    maintenance_mode = coalesce(p_maintenance_mode, o.maintenance_mode),
    force_logout_after = case when coalesce(p_force_logout, false) then now() else o.force_logout_after end,
    subscription_trial_started_at = case
      when p_clear_trial then null
      when p_trial_ends_at is not null then coalesce(v_o.subscription_trial_started_at, now())
      when v_new_status = 'trial' and v_o.subscription_trial_started_at is null then now()
      else v_o.subscription_trial_started_at
    end,
    subscription_trial_ends_at = case
      when p_clear_trial then null
      when p_trial_ends_at is not null then p_trial_ends_at
      when v_new_status = 'trial' and v_o.subscription_trial_ends_at is null and p_trial_ends_at is null
        then now() + interval '14 days'
      else v_o.subscription_trial_ends_at
    end
  where o.id = p_org_id;

  insert into public.platform_audit_events (
    actor_user_id, org_id, event_type, entity_type, entity_id, before_state, after_state, metadata
  )
  select
    auth.uid(),
    o.id,
    'org.governance_updated',
    'organisation',
    o.id::text,
    coalesce(v_before, '{}'::jsonb),
    jsonb_build_object(
      'plan_tier', o.plan_tier,
      'subscription_status', o.subscription_status,
      'is_locked', o.is_locked,
      'maintenance_mode', o.maintenance_mode,
      'force_logout_after', o.force_logout_after,
      'subscription_trial_started_at', o.subscription_trial_started_at,
      'subscription_trial_ends_at', o.subscription_trial_ends_at
    ),
    jsonb_build_object(
      'force_logout_triggered', coalesce(p_force_logout, false),
      'trial_cleared', coalesce(p_clear_trial, false)
    )
  from public.organisations o
  where o.id = p_org_id;
end;
$$;

revoke all on function public.platform_update_org_governance(uuid, text, text, boolean, boolean, boolean, timestamptz, boolean) from public;
grant execute on function public.platform_update_org_governance(uuid, text, text, boolean, boolean, boolean, timestamptz, boolean) to authenticated, service_role;
