-- Team owner (department_teams.lead_user_id): manage roster for that team; rename team.
-- Dept managers may set team name and owner for teams in departments they manage.
-- Team owners without department membership/manager role may broadcast only to teams they own
-- (higher roles unchanged: org admins / managers / members already target any team in dept).

-- ---------------------------------------------------------------------------
-- user_may_broadcast_to_dept: team owners may compose to that department
-- ---------------------------------------------------------------------------

create or replace function public.user_may_broadcast_to_dept(p_dept_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org uuid;
  dept_row record;
begin
  select p.role, p.org_id into v_role, v_org
  from public.profiles p
  where p.id = auth.uid();

  if v_org is null or v_role is null then
    return false;
  end if;

  select dept.*
  into dept_row
  from public.departments dept
  where dept.id = p_dept_id;

  if not found then
    return false;
  end if;

  if dept_row.org_id is distinct from v_org then
    return false;
  end if;

  case v_role
    when 'org_admin', 'super_admin' then
      return true;
    when 'manager' then
      return exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid() and dm.dept_id = p_dept_id
      );
    when 'coordinator' then
      return exists (
        select 1 from public.user_departments ud
        where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
      );
    when 'administrator', 'duty_manager', 'csa' then
      return exists (
        select 1 from public.user_departments ud
        where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
      );
    when 'society_leader' then
      return dept_row.type in ('society', 'club')
        and exists (
          select 1 from public.user_departments ud
          where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
        );
    else
      null;
  end case;

  if exists (
    select 1
    from public.department_teams dt
    where dt.dept_id = p_dept_id
      and dt.lead_user_id = auth.uid()
  ) then
    return true;
  end if;

  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- broadcasts_validate_fn: owner-only senders must use a team they own
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
  v_only_team_owner boolean;
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

  if not coalesce(new.is_org_wide, false) then
    select
      exists (
        select 1 from public.department_teams dt
        where dt.dept_id = new.dept_id and dt.lead_user_id = new.created_by
      )
      and not exists (
        select 1 from public.profiles p
        where p.id = new.created_by and p.role in ('org_admin', 'super_admin')
      )
      and not exists (
        select 1 from public.user_departments ud
        where ud.user_id = new.created_by and ud.dept_id = new.dept_id
      )
      and not (
        exists (
          select 1 from public.profiles p
          where p.id = new.created_by and p.role = 'manager'
        )
        and exists (
          select 1 from public.dept_managers dm
          where dm.user_id = new.created_by and dm.dept_id = new.dept_id
        )
      )
      and not (
        exists (
          select 1 from public.profiles p
          where p.id = new.created_by and p.role = 'society_leader'
        )
        and exists (
          select 1 from public.user_departments ud
          where ud.user_id = new.created_by and ud.dept_id = new.dept_id
        )
        and exists (
          select 1 from public.departments d
          where d.id = new.dept_id and d.type in ('society', 'club')
        )
      )
    into v_only_team_owner;

    if coalesce(v_only_team_owner, false) then
      if new.team_id is null then
        raise exception 'Select a team: you are a team owner but not on this department as a member or assigned manager.';
      end if;
      if not exists (
        select 1 from public.department_teams dt
        where dt.id = new.team_id
          and dt.dept_id = new.dept_id
          and dt.lead_user_id = new.created_by
      ) then
        raise exception 'You can only target a team you own in this department.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- department_teams: UPDATE rules (trigger) + RLS for manager & team lead
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

  v_is_team_lead := old.lead_user_id is not distinct from auth.uid();

  if v_is_dept_manager then
    if new.id is distinct from old.id or new.dept_id is distinct from old.dept_id then
      raise exception 'Managers cannot move or replace a team';
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

drop trigger if exists department_teams_enforce_update_rules on public.department_teams;
create trigger department_teams_enforce_update_rules
before update on public.department_teams
for each row
execute procedure public.department_teams_enforce_update_rules();

create policy department_teams_update_dept_manager
  on public.department_teams
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.dept_managers dm on dm.dept_id = d.id and dm.user_id = auth.uid()
      join public.profiles p on p.id = auth.uid()
      where dt.id = department_teams.id
        and p.role = 'manager'
        and p.status = 'active'
        and p.org_id = d.org_id
    )
  )
  with check (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.dept_managers dm on dm.dept_id = d.id and dm.user_id = auth.uid()
      join public.profiles p on p.id = auth.uid()
      where dt.id = department_teams.id
        and p.role = 'manager'
        and p.status = 'active'
        and p.org_id = d.org_id
    )
  );

create policy department_teams_update_team_lead
  on public.department_teams
  for update
  to authenticated
  using (
    department_teams.lead_user_id = auth.uid()
    and exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid() and p.org_id = d.org_id and p.status = 'active'
      where d.id = department_teams.dept_id
    )
  )
  with check (
    department_teams.lead_user_id = auth.uid()
    and exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid() and p.org_id = d.org_id and p.status = 'active'
      where d.id = department_teams.dept_id
    )
  );

comment on column public.department_teams.lead_user_id is
  'Team owner: may rename the team and manage department_team_members for this team. Org admins and dept managers may assign or change the owner.';

create index if not exists department_teams_lead_user_id_idx
  on public.department_teams (lead_user_id)
  where lead_user_id is not null;

-- ---------------------------------------------------------------------------
-- department_team_members: team lead insert/delete
-- ---------------------------------------------------------------------------

create policy department_team_members_insert_team_lead
  on public.department_team_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.profiles pv on pv.id = auth.uid() and pv.status = 'active' and pv.org_id = d.org_id
      where dt.id = department_team_members.team_id
        and dt.lead_user_id = auth.uid()
    )
    and exists (
      select 1
      from public.profiles pt
      join public.department_teams dt2 on dt2.id = department_team_members.team_id
      join public.departments d2 on d2.id = dt2.dept_id
      where pt.id = department_team_members.user_id
        and pt.org_id = d2.org_id
        and pt.status = 'active'
    )
  );

create policy department_team_members_delete_team_lead
  on public.department_team_members
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.department_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.profiles pv on pv.id = auth.uid() and pv.status = 'active' and pv.org_id = d.org_id
      where dt.id = department_team_members.team_id
        and dt.lead_user_id = auth.uid()
    )
  );
