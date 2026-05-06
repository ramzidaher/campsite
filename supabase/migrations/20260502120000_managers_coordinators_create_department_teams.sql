-- Managers (dept_managers) and coordinators (user_departments) may create teams in their departments.
-- Coordinators get the same team update and roster rules as department managers (no delete  org admin only).

-- ---------------------------------------------------------------------------
-- department_teams: INSERT for manager + coordinator
-- ---------------------------------------------------------------------------

drop policy if exists department_teams_insert_dept_manager on public.department_teams;

create policy department_teams_insert_dept_manager
  on public.department_teams
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = department_teams.dept_id
        and d.org_id = p.org_id
        and p.status = 'active'
        and p.role = 'manager'
        and exists (
          select 1
          from public.dept_managers dm
          where dm.dept_id = d.id and dm.user_id = auth.uid()
        )
    )
  );

drop policy if exists department_teams_insert_coordinator on public.department_teams;

create policy department_teams_insert_coordinator
  on public.department_teams
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      join public.user_departments ud on ud.dept_id = d.id and ud.user_id = auth.uid()
      where d.id = department_teams.dept_id
        and d.org_id = p.org_id
        and p.status = 'active'
        and p.role = 'coordinator'
    )
  );

-- ---------------------------------------------------------------------------
-- department_teams: UPDATE for coordinator (mirror dept manager policy)
-- ---------------------------------------------------------------------------

drop policy if exists department_teams_update_coordinator on public.department_teams;

create policy department_teams_update_coordinator
  on public.department_teams
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.profiles p on p.id = auth.uid()
      join public.user_departments ud on ud.dept_id = d.id and ud.user_id = auth.uid()
      where dt.id = department_teams.id
        and p.role = 'coordinator'
        and p.status = 'active'
        and p.org_id = d.org_id
    )
  )
  with check (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.profiles p on p.id = auth.uid()
      join public.user_departments ud on ud.dept_id = d.id and ud.user_id = auth.uid()
      where dt.id = department_teams.id
        and p.role = 'coordinator'
        and p.status = 'active'
        and p.org_id = d.org_id
    )
  );

-- ---------------------------------------------------------------------------
-- Trigger: allow coordinators to update teams like dept managers
-- ---------------------------------------------------------------------------

create or replace function public.department_teams_enforce_update_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org uuid;
  v_is_org_admin boolean := false;
  v_is_dept_manager boolean := false;
  v_is_coordinator boolean := false;
  v_is_team_lead boolean := false;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  select p.role, p.org_id into v_role, v_org
  from public.profiles p
  where p.id = auth.uid() and p.status = 'active';

  if v_org is null or v_role is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from public.profiles p
    join public.departments d on d.id = new.dept_id and d.org_id = p.org_id
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('org_admin', 'super_admin')
  ) into v_is_org_admin;

  if v_is_org_admin then
    return new;
  end if;

  select exists (
    select 1
    from public.dept_managers dm
    join public.profiles p on p.id = auth.uid()
    where dm.dept_id = new.dept_id
      and dm.user_id = auth.uid()
      and p.role = 'manager'
      and p.status = 'active'
      and p.org_id = (select d2.org_id from public.departments d2 where d2.id = new.dept_id)
  ) into v_is_dept_manager;

  select exists (
    select 1
    from public.user_departments ud
    join public.profiles p on p.id = auth.uid()
    where ud.dept_id = new.dept_id
      and ud.user_id = auth.uid()
      and p.role = 'coordinator'
      and p.status = 'active'
      and p.org_id = (select d2.org_id from public.departments d2 where d2.id = new.dept_id)
  ) into v_is_coordinator;

  v_is_team_lead := old.lead_user_id is not distinct from auth.uid();

  if v_is_dept_manager or v_is_coordinator then
    if new.id is distinct from old.id or new.dept_id is distinct from old.dept_id then
      raise exception 'Cannot move or replace a team';
    end if;
    return new;
  end if;

  if v_is_team_lead then
    if new.id is distinct from old.id
      or new.dept_id is distinct from old.dept_id
      or new.lead_user_id is distinct from old.lead_user_id
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Team owners may only change the team name';
    end if;
    return new;
  end if;

  raise exception 'Not allowed to update this team';
end;
$$;

-- ---------------------------------------------------------------------------
-- department_team_members: coordinator insert/delete (mirror manager)
-- ---------------------------------------------------------------------------

drop policy if exists department_team_members_coordinator_insert on public.department_team_members;

create policy department_team_members_coordinator_insert
  on public.department_team_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.user_departments udv on udv.dept_id = d.id and udv.user_id = auth.uid()
      join public.profiles pv on pv.id = auth.uid()
        and pv.role = 'coordinator'
        and pv.status = 'active'
        and pv.org_id = d.org_id
      join public.profiles pt on pt.id = department_team_members.user_id
        and pt.org_id = d.org_id
        and pt.status = 'active'
      where dt.id = department_team_members.team_id
    )
  );

drop policy if exists department_team_members_coordinator_delete on public.department_team_members;

create policy department_team_members_coordinator_delete
  on public.department_team_members
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.user_departments udv on udv.dept_id = d.id and udv.user_id = auth.uid()
      join public.profiles pv on pv.id = auth.uid()
        and pv.role = 'coordinator'
        and pv.status = 'active'
        and pv.org_id = d.org_id
      where dt.id = department_team_members.team_id
    )
  );
