-- Department teams: named groups under a department (e.g. Morning shift, Night shift).
-- Membership is independent of job role: any active org member may belong to a team.
-- Renames: dept_teams → department_teams, user_dept_teams → department_team_members.

-- ---------------------------------------------------------------------------
-- Drop trigger + policies (will recreate after rename)
-- ---------------------------------------------------------------------------

drop trigger if exists user_dept_teams_validate on public.user_dept_teams;

drop policy if exists dept_teams_select_auth on public.dept_teams;
drop policy if exists dept_teams_mutate_org_admin on public.dept_teams;
drop policy if exists user_dept_teams_select_auth on public.user_dept_teams;
drop policy if exists user_dept_teams_mutate_org_admin on public.user_dept_teams;

drop function if exists public.user_dept_teams_validate_fn();

-- ---------------------------------------------------------------------------
-- Rename tables + indexes
-- ---------------------------------------------------------------------------

alter table public.dept_teams rename to department_teams;
alter table public.user_dept_teams rename to department_team_members;

alter index if exists public.dept_teams_dept_id_idx rename to department_teams_dept_id_idx;
alter index if exists public.user_dept_teams_team_id_idx rename to department_team_members_team_id_idx;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.department_teams'::regclass and conname = 'dept_teams_pkey'
  ) then
    alter table public.department_teams rename constraint dept_teams_pkey to department_teams_pkey;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.department_team_members'::regclass
      and conname = 'user_dept_teams_pkey'
  ) then
    alter table public.department_team_members
      rename constraint user_dept_teams_pkey to department_team_members_pkey;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.department_team_members'::regclass
      and conname = 'user_dept_teams_user_id_fkey'
  ) then
    alter table public.department_team_members
      rename constraint user_dept_teams_user_id_fkey to department_team_members_user_id_fkey;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.department_team_members'::regclass
      and conname = 'user_dept_teams_team_id_fkey'
  ) then
    alter table public.department_team_members
      rename constraint user_dept_teams_team_id_fkey to department_team_members_team_id_fkey;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.broadcasts'::regclass and conname = 'broadcasts_team_id_fkey'
  ) then
    -- FK target table rename updates automatically; constraint name unchanged is fine.
    null;
  end if;
end $$;

comment on table public.department_teams is
  'Named teams within a department (e.g. Morning shift). Used to target broadcasts via broadcasts.team_id; unrelated to profile.role.';

comment on table public.department_team_members is
  'Membership of profiles in a department team. Users need not be in user_departments for that department; they must be active profiles in the same org as the department.';

comment on column public.broadcasts.team_id is
  'When set, only members of this department_team (plus usual exceptions) receive the non–org-wide broadcast.';

-- ---------------------------------------------------------------------------
-- RLS: department_teams
-- ---------------------------------------------------------------------------

create policy department_teams_select_auth
  on public.department_teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.id = department_teams.dept_id
        and d.org_id = public.current_org_id()
    )
  );

create policy department_teams_mutate_org_admin
  on public.department_teams
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = department_teams.dept_id
        and d.org_id = p.org_id
        and p.role in ('org_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = department_teams.dept_id
        and d.org_id = p.org_id
        and p.role in ('org_admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: department_team_members
-- ---------------------------------------------------------------------------

create policy department_team_members_select_auth
  on public.department_team_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      where dt.id = department_team_members.team_id
        and d.org_id = public.current_org_id()
    )
  );

create policy department_team_members_mutate_org_admin
  on public.department_team_members
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.profiles p on p.id = auth.uid()
      where dt.id = department_team_members.team_id
        and d.org_id = p.org_id
        and p.role in ('org_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.profiles p on p.id = auth.uid()
      where dt.id = department_team_members.team_id
        and d.org_id = p.org_id
        and p.role in ('org_admin', 'super_admin')
    )
  );

create policy department_team_members_dept_manager_insert
  on public.department_team_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.dept_managers dm on dm.dept_id = d.id and dm.user_id = auth.uid()
      join public.profiles pv on pv.id = auth.uid()
        and pv.role = 'manager'
        and pv.status = 'active'
        and pv.org_id = d.org_id
      join public.profiles pt on pt.id = department_team_members.user_id
        and pt.org_id = d.org_id
        and pt.status = 'active'
      where dt.id = department_team_members.team_id
    )
  );

create policy department_team_members_dept_manager_delete
  on public.department_team_members
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.dept_managers dm on dm.dept_id = d.id and dm.user_id = auth.uid()
      join public.profiles pv on pv.id = auth.uid()
        and pv.role = 'manager'
        and pv.status = 'active'
        and pv.org_id = d.org_id
      where dt.id = department_team_members.team_id
    )
  );

-- ---------------------------------------------------------------------------
-- Validate: same org + active profile (not necessarily in user_departments)
-- ---------------------------------------------------------------------------

create or replace function public.department_team_members_validate_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d_dept uuid;
  d_org uuid;
  u_org uuid;
  u_status text;
begin
  select dt.dept_id into d_dept from public.department_teams dt where dt.id = new.team_id;
  if d_dept is null then
    raise exception 'Invalid team';
  end if;

  select d.org_id into d_org from public.departments d where d.id = d_dept;
  if d_org is null then
    raise exception 'Invalid department';
  end if;

  select p.org_id, p.status into u_org, u_status
  from public.profiles p
  where p.id = new.user_id;

  if u_org is null or u_org <> d_org then
    raise exception 'User must belong to the same organisation as the team''s department';
  end if;

  if coalesce(u_status, '') <> 'active' then
    raise exception 'User must have an active profile';
  end if;

  return new;
end;
$$;

drop trigger if exists department_team_members_validate on public.department_team_members;
create trigger department_team_members_validate
before insert or update on public.department_team_members
for each row
execute procedure public.department_team_members_validate_fn();

-- ---------------------------------------------------------------------------
-- broadcasts_validate_fn (department_teams)
-- ---------------------------------------------------------------------------

create or replace function public.broadcasts_validate_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d_org uuid;
  c_dept uuid;
  t_dept uuid;
  p_org uuid;
begin
  select d.org_id into d_org from public.departments d where d.id = new.dept_id;
  if d_org is null then
    raise exception 'Invalid department';
  end if;
  if new.org_id <> d_org then
    raise exception 'org_id must match department organisation';
  end if;

  if coalesce(new.is_org_wide, false) then
    if new.channel_id is not null then
      raise exception 'Org-wide broadcasts must not set a channel';
    end if;
    if new.team_id is not null then
      raise exception 'Org-wide broadcasts must not set a team';
    end if;
  else
    if new.channel_id is null then
      raise exception 'Channel required unless broadcast is org-wide';
    end if;
    select c.dept_id into c_dept from public.broadcast_channels c where c.id = new.channel_id;
    if c_dept is null or c_dept <> new.dept_id then
      raise exception 'Channel must belong to the selected department';
    end if;
    if new.team_id is not null then
      select dt.dept_id into t_dept from public.department_teams dt where dt.id = new.team_id;
      if t_dept is null or t_dept <> new.dept_id then
        raise exception 'Team must belong to the selected department';
      end if;
    end if;
  end if;

  select p.org_id into p_org from public.profiles p where p.id = new.created_by;
  if p_org is null or p_org <> new.org_id then
    raise exception 'Creator must belong to the same organisation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_should_receive_sent_broadcast
-- ---------------------------------------------------------------------------

create or replace function public.user_should_receive_sent_broadcast(
  p_user_id uuid,
  b public.broadcasts
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
begin
  if b.id is null or b.status is distinct from 'sent' then
    return false;
  end if;

  select p.org_id, p.status into v_org, v_status
  from public.profiles p
  where p.id = p_user_id;

  if v_org is null or v_org <> b.org_id then
    return false;
  end if;

  if coalesce(v_status, '') <> 'active' and p_user_id is distinct from b.created_by then
    return false;
  end if;

  if coalesce(b.is_mandatory, false) then
    return true;
  end if;

  if coalesce(b.is_org_wide, false) then
    return true;
  end if;

  if b.created_by = p_user_id then
    return true;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role in ('org_admin', 'super_admin')
  ) then
    return true;
  end if;

  if b.team_id is not null then
    if not exists (
      select 1
      from public.department_team_members dtm
      where dtm.user_id = p_user_id
        and dtm.team_id = b.team_id
    ) then
      return false;
    end if;
  end if;

  if b.channel_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p_user_id
      and us.channel_id = b.channel_id
      and us.subscribed = true
  );
end;
$$;

revoke all on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) from public;
grant execute on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) to service_role;
