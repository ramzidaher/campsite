-- Org-wide broadcasts: nullable cat_id, true delivery to all active org members.
-- Sub-teams under departments: dept_teams, user_dept_teams, optional broadcasts.team_id.

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

create table public.dept_teams (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid not null references public.departments (id) on delete cascade,
  name text not null,
  lead_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dept_id, name)
);

create index dept_teams_dept_id_idx on public.dept_teams (dept_id);

create table public.user_dept_teams (
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.dept_teams (id) on delete cascade,
  primary key (user_id, team_id)
);

create index user_dept_teams_team_id_idx on public.user_dept_teams (team_id);

alter table public.dept_teams enable row level security;
alter table public.user_dept_teams enable row level security;

create policy dept_teams_select_auth
  on public.dept_teams
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.id = dept_teams.dept_id
        and d.org_id = public.current_org_id()
    )
  );

create policy dept_teams_mutate_org_admin
  on public.dept_teams
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_teams.dept_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_teams.dept_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
    )
  );

create policy user_dept_teams_select_auth
  on public.user_dept_teams
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.dept_teams dt
      join public.departments d on d.id = dt.dept_id
      where dt.id = user_dept_teams.team_id
        and d.org_id = public.current_org_id()
    )
  );

create policy user_dept_teams_mutate_org_admin
  on public.user_dept_teams
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.dept_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.profiles p on p.id = auth.uid()
      where dt.id = user_dept_teams.team_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.dept_teams dt
      join public.departments d on d.id = dt.dept_id
      join public.profiles p on p.id = auth.uid()
      where dt.id = user_dept_teams.team_id
        and d.org_id = p.org_id
        and p.role = 'org_admin'
    )
  );

create or replace function public.user_dept_teams_validate_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d_dept uuid;
begin
  select dt.dept_id into d_dept from public.dept_teams dt where dt.id = new.team_id;
  if d_dept is null then
    raise exception 'Invalid team';
  end if;
  if not exists (
    select 1
    from public.user_departments ud
    where ud.user_id = new.user_id
      and ud.dept_id = d_dept
  ) then
    raise exception 'User must belong to the team''s department before joining a team';
  end if;
  return new;
end;
$$;

drop trigger if exists user_dept_teams_validate on public.user_dept_teams;
create trigger user_dept_teams_validate
before insert or update on public.user_dept_teams
for each row
execute procedure public.user_dept_teams_validate_fn();

-- ---------------------------------------------------------------------------
-- Broadcasts: team + nullable category for org-wide
-- ---------------------------------------------------------------------------

alter table public.broadcasts
  add column if not exists team_id uuid references public.dept_teams (id) on delete set null;

create index if not exists broadcasts_team_id_idx on public.broadcasts (team_id);

alter table public.broadcasts
  alter column cat_id drop not null;

-- Replace validate *before* backfill so UPDATE can clear cat_id on org-wide rows.
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
    if new.cat_id is not null then
      raise exception 'Org-wide broadcasts must not set a category';
    end if;
    if new.team_id is not null then
      raise exception 'Org-wide broadcasts must not set a team';
    end if;
  else
    if new.cat_id is null then
      raise exception 'Category required unless broadcast is org-wide';
    end if;
    select c.dept_id into c_dept from public.dept_categories c where c.id = new.cat_id;
    if c_dept is null or c_dept <> new.dept_id then
      raise exception 'Category must belong to the selected department';
    end if;
    if new.team_id is not null then
      select dt.dept_id into t_dept from public.dept_teams dt where dt.id = new.team_id;
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

update public.broadcasts
set cat_id = null
where coalesce(is_org_wide, false) = true;

alter table public.broadcasts
  drop constraint if exists broadcasts_org_wide_delivery_check;

alter table public.broadcasts
  add constraint broadcasts_org_wide_delivery_check
  check (
    (coalesce(is_org_wide, false) = true and cat_id is null and team_id is null)
    or (coalesce(is_org_wide, false) = false and cat_id is not null)
  );

-- ---------------------------------------------------------------------------
-- Sent visibility + notifications: org-wide + team scoping
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
      from public.user_dept_teams udt
      where udt.user_id = p_user_id
        and udt.team_id = b.team_id
    ) then
      return false;
    end if;
  end if;

  if b.cat_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p_user_id
      and us.cat_id = b.cat_id
      and us.subscribed = true
  );
end;
$$;
