-- Multi-organisation membership: one auth user may belong to several tenants.
-- `profiles` remains the active-org row (role, status, org_id) for RLS via current_org_id().
-- `user_org_memberships` stores each (user, org) row; login / settings can switch active org.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.user_org_memberships (
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organisations (id) on delete cascade,
  full_name text not null,
  email text,
  role text not null,
  status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  rejection_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, org_id),
  constraint user_org_memberships_role_check check (
    role in (
      'unassigned',
      'org_admin',
      'manager',
      'coordinator',
      'administrator',
      'duty_manager',
      'csa',
      'society_leader'
    )
  ),
  constraint user_org_memberships_status_check check (status in ('pending', 'active', 'inactive'))
);

create index if not exists user_org_memberships_user_id_idx on public.user_org_memberships (user_id);
create index if not exists user_org_memberships_org_id_idx on public.user_org_memberships (org_id);

comment on table public.user_org_memberships is
  'Tenant memberships per auth user; profiles.org_id is the active org for RLS (current_org_id).';

-- ---------------------------------------------------------------------------
-- Backfill from existing profiles
-- ---------------------------------------------------------------------------

insert into public.user_org_memberships (
  user_id,
  org_id,
  full_name,
  email,
  role,
  status,
  reviewed_at,
  reviewed_by,
  rejection_note
)
select
  p.id,
  p.org_id,
  p.full_name,
  p.email,
  p.role,
  p.status,
  p.reviewed_at,
  p.reviewed_by,
  p.rejection_note
from public.profiles p
where p.org_id is not null
on conflict (user_id, org_id) do nothing;

-- ---------------------------------------------------------------------------
-- Sync profiles -> membership (security definer; runs as owner)
-- ---------------------------------------------------------------------------

create or replace function public.sync_profile_to_org_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.org_id is not null then
      delete from public.user_org_memberships
      where user_id = old.id and org_id = old.org_id;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.org_id is null and old.org_id is not null then
    delete from public.user_org_memberships
    where user_id = old.id and org_id = old.org_id;
    return new;
  end if;

  if new.org_id is not null then
    insert into public.user_org_memberships (
      user_id,
      org_id,
      full_name,
      email,
      role,
      status,
      reviewed_at,
      reviewed_by,
      rejection_note
    )
    values (
      new.id,
      new.org_id,
      new.full_name,
      new.email,
      new.role,
      new.status,
      new.reviewed_at,
      new.reviewed_by,
      new.rejection_note
    )
    on conflict (user_id, org_id) do update set
      full_name = excluded.full_name,
      email = excluded.email,
      role = excluded.role,
      status = excluded.status,
      reviewed_at = excluded.reviewed_at,
      reviewed_by = excluded.reviewed_by,
      rejection_note = excluded.rejection_note,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_org_membership on public.profiles;
create trigger trg_profiles_sync_org_membership
  after insert or update of org_id, full_name, email, role, status, reviewed_at, reviewed_by, rejection_note
  on public.profiles
  for each row
  execute procedure public.sync_profile_to_org_membership();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.user_org_memberships enable row level security;

create policy user_org_memberships_select_own
  on public.user_org_memberships
  for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Switch active org (updates profiles from chosen membership row)
-- ---------------------------------------------------------------------------

create or replace function public.set_my_active_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.user_org_memberships m
    where m.user_id = v_uid and m.org_id = p_org_id
  ) then
    raise exception 'not a member of this organisation' using errcode = '42501';
  end if;

  update public.profiles p
  set
    org_id = m.org_id,
    full_name = m.full_name,
    email = m.email,
    role = m.role,
    status = m.status,
    reviewed_at = m.reviewed_at,
    reviewed_by = m.reviewed_by,
    rejection_note = m.rejection_note
  from public.user_org_memberships m
  where p.id = v_uid
    and m.user_id = p.id
    and m.org_id = p_org_id;
end;
$$;

revoke all on function public.set_my_active_org(uuid) from public;
grant execute on function public.set_my_active_org(uuid) to authenticated;

comment on function public.set_my_active_org(uuid) is
  'Sets profiles active tenant from user_org_memberships; RLS current_org_id follows profiles.org_id.';

-- ---------------------------------------------------------------------------
-- Admin invite: allow second org (insert membership; leave active profile unchanged)
-- ---------------------------------------------------------------------------

create or replace function public.admin_provision_invited_member(
  p_user_id uuid,
  p_org_id uuid,
  p_full_name text,
  p_role text,
  p_dept_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_dept uuid;
  v_existing_org uuid;
begin
  if not exists (
    select 1 from public.organisations o where o.id = p_org_id and o.is_active = true
  ) then
    raise exception 'Invalid organisation';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'Auth user not found';
  end if;

  v_name := coalesce(nullif(trim(p_full_name), ''), 'Member');

  if p_role is null
    or trim(p_role) = ''
    or trim(p_role) not in (
      'org_admin',
      'manager',
      'coordinator',
      'administrator',
      'duty_manager',
      'csa',
      'society_leader'
    )
  then
    raise exception 'Invalid role for invite';
  end if;

  if p_dept_ids is not null then
    foreach v_dept in array p_dept_ids
    loop
      if not exists (
        select 1
        from public.departments d
        where d.id = v_dept and d.org_id = p_org_id and d.is_archived = false
      ) then
        raise exception 'Invalid department for organisation';
      end if;
    end loop;
  end if;

  select org_id into v_existing_org from public.profiles where id = p_user_id;

  if found then
    if v_existing_org is not null and v_existing_org <> p_org_id then
      insert into public.user_org_memberships (
        user_id,
        org_id,
        full_name,
        email,
        role,
        status
      )
      values (
        p_user_id,
        p_org_id,
        v_name,
        nullif(trim(v_email), ''),
        trim(p_role),
        'active'
      )
      on conflict (user_id, org_id) do update set
        full_name = excluded.full_name,
        email = excluded.email,
        role = excluded.role,
        status = excluded.status,
        updated_at = now();

      delete from public.user_departments ud
      using public.departments d
      where ud.user_id = p_user_id
        and ud.dept_id = d.id
        and d.org_id = p_org_id;

      if p_dept_ids is not null and cardinality(p_dept_ids) > 0 then
        insert into public.user_departments (user_id, dept_id)
        select p_user_id, q.d
        from (select distinct unnest(p_dept_ids) as d) q;
      end if;

      return;
    end if;

    update public.profiles
    set
      org_id = p_org_id,
      full_name = v_name,
      email = nullif(trim(v_email), ''),
      role = trim(p_role),
      status = 'active'
    where id = p_user_id;

    delete from public.user_departments ud
    using public.departments d
    where ud.user_id = p_user_id
      and ud.dept_id = d.id
      and d.org_id = p_org_id;

    if p_dept_ids is not null and cardinality(p_dept_ids) > 0 then
      insert into public.user_departments (user_id, dept_id)
      select p_user_id, q.d
      from (select distinct unnest(p_dept_ids) as d) q;
    end if;

    return;
  end if;

  insert into public.profiles (id, org_id, full_name, email, role, status)
  values (
    p_user_id,
    p_org_id,
    v_name,
    nullif(trim(v_email), ''),
    trim(p_role),
    'active'
  );

  if p_dept_ids is not null and cardinality(p_dept_ids) > 0 then
    insert into public.user_departments (user_id, dept_id)
    select p_user_id, q.d
    from (select distinct unnest(p_dept_ids) as d) q;
  end if;
end;
$$;

revoke all on function public.admin_provision_invited_member(uuid, uuid, text, text, uuid[]) from public;
grant execute on function public.admin_provision_invited_member(uuid, uuid, text, text, uuid[]) to service_role;

comment on function public.admin_provision_invited_member(uuid, uuid, text, text, uuid[]) is
  'Creates or updates profiles in org after invite; service_role only. Supports multiple orgs per user via user_org_memberships.';

-- ---------------------------------------------------------------------------
-- Remove member: drop one membership; if it was active, fall back to another org
-- ---------------------------------------------------------------------------

create or replace function public.org_admin_remove_member(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org uuid;
  v_viewer_role text;
  v_viewer_status text;
  v_target_org uuid;
  v_target_role text;
  v_org_admin_count int;
  v_fallback uuid;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select org_id, role, status
  into v_org, v_viewer_role, v_viewer_status
  from public.profiles
  where id = v_viewer;

  if v_org is null
    or v_viewer_status is distinct from 'active'
    or v_viewer_role not in ('org_admin', 'super_admin')
  then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_target = v_viewer then
    raise exception 'cannot remove yourself from the organisation';
  end if;

  select org_id, role
  into v_target_org, v_target_role
  from public.profiles
  where id = p_target;

  if not found then
    raise exception 'profile not found';
  end if;

  if v_target_org is null then
    raise exception 'user is not a member of an organisation';
  end if;

  if v_target_org is distinct from v_org then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_target_role in ('org_admin', 'super_admin') then
    select count(*)::int
    into v_org_admin_count
    from public.profiles
    where org_id = v_org
      and role in ('org_admin', 'super_admin');

    if v_org_admin_count <= 1 then
      raise exception 'cannot remove the last org admin for this organisation';
    end if;
  end if;

  delete from public.user_departments ud
  using public.departments d
  where ud.user_id = p_target
    and ud.dept_id = d.id
    and d.org_id = v_org;

  delete from public.dept_managers dm
  using public.departments d
  where dm.user_id = p_target
    and dm.dept_id = d.id
    and d.org_id = v_org;

  delete from public.user_subscriptions us
  using public.broadcast_channels c
  join public.departments d on d.id = c.dept_id
  where us.user_id = p_target
    and us.channel_id = c.id
    and d.org_id = v_org;

  delete from public.broadcast_reads br
  using public.broadcasts b
  where br.user_id = p_target
    and br.broadcast_id = b.id
    and b.org_id = v_org;

  delete from public.rota_shifts
  where org_id = v_org
    and user_id = p_target;

  delete from public.user_org_memberships
  where user_id = p_target
    and org_id = v_org;

  select m.org_id
  into v_fallback
  from public.user_org_memberships m
  where m.user_id = p_target
  order by m.updated_at desc
  limit 1;

  if v_fallback is not null then
    update public.profiles p
    set
      org_id = m.org_id,
      full_name = m.full_name,
      email = m.email,
      role = m.role,
      status = m.status,
      reviewed_at = m.reviewed_at,
      reviewed_by = m.reviewed_by,
      rejection_note = m.rejection_note
    from public.user_org_memberships m
    where p.id = p_target
      and m.user_id = p.id
      and m.org_id = v_fallback;
  else
    update public.profiles
    set
      org_id = null,
      role = 'unassigned',
      status = 'inactive',
      reviewed_at = now(),
      reviewed_by = v_viewer,
      rejection_note = null
    where id = p_target;
  end if;
end;
$$;

revoke all on function public.org_admin_remove_member(uuid) from public;
grant execute on function public.org_admin_remove_member(uuid) to authenticated;

comment on function public.org_admin_remove_member(uuid) is
  'Active org_admin removes target from current org; drops user_org_memberships row and may switch active profile to another membership.';
