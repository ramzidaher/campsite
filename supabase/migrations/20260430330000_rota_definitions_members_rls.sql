-- Rota definitions (v1): configurable rotas, optional members, shifts linked via rota_id.
-- Legacy rows: rota_id IS NULL keep prior-style visibility where possible.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.rotas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  dept_id uuid references public.departments (id) on delete set null,
  department_team_id uuid references public.department_teams (id) on delete set null,
  kind text not null default 'shift'
    check (kind in ('shift', 'activity', 'reception', 'other')),
  title text not null default 'Rota',
  owner_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rotas_org_id_idx on public.rotas (org_id);
create index if not exists rotas_dept_id_idx on public.rotas (dept_id);
create index if not exists rotas_owner_id_idx on public.rotas (owner_id);

create table if not exists public.rota_members (
  rota_id uuid not null references public.rotas (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rota_id, user_id)
);

create index if not exists rota_members_user_id_idx on public.rota_members (user_id);

alter table public.rota_shifts
  add column if not exists rota_id uuid references public.rotas (id) on delete set null;

create index if not exists rota_shifts_rota_id_idx on public.rota_shifts (rota_id);

comment on table public.rotas is
  'Rota definition (kind, title, scope). Shifts reference rotas.rota_id; NULL rota_id = legacy shift rows.';
comment on column public.rota_shifts.rota_id is
  'When set, shift belongs to a rota; visibility/mutation use rota rules in addition to department.';

-- ---------------------------------------------------------------------------
-- Validation: rota org / dept / owner consistency
-- ---------------------------------------------------------------------------

create or replace function public.rotas_validate_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d_org uuid;
  t_dept uuid;
  o_org uuid;
begin
  if new.org_id <> public.current_org_id() then
    raise exception 'rota org_id must match current org';
  end if;

  select p.org_id into o_org from public.profiles p where p.id = new.owner_id;
  if o_org is null or o_org <> new.org_id then
    raise exception 'Rota owner must belong to the same organisation';
  end if;

  if new.dept_id is not null then
    select d.org_id into d_org from public.departments d where d.id = new.dept_id;
    if d_org is null or d_org <> new.org_id then
      raise exception 'Department must belong to rota organisation';
    end if;
  end if;

  if new.department_team_id is not null then
    select dt.dept_id into t_dept
    from public.department_teams dt
    where dt.id = new.department_team_id;
    if t_dept is null then
      raise exception 'Invalid department_team';
    end if;
    if new.dept_id is not null and t_dept <> new.dept_id then
      raise exception 'department_team must belong to rota dept_id';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists rotas_validate on public.rotas;
create trigger rotas_validate
  before insert or update on public.rotas
  for each row
  execute procedure public.rotas_validate_fn();

create or replace function public.rota_shifts_rota_org_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r_org uuid;
begin
  if new.rota_id is null then
    return new;
  end if;
  select r.org_id into r_org from public.rotas r where r.id = new.rota_id;
  if r_org is null or r_org <> new.org_id then
    raise exception 'Shift org_id must match rota org_id';
  end if;
  return new;
end;
$$;

drop trigger if exists rota_shifts_rota_org on public.rota_shifts;
create trigger rota_shifts_rota_org
  before insert or update on public.rota_shifts
  for each row
  execute procedure public.rota_shifts_rota_org_fn();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_rota_assignments(p_rota_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r text;
  o_org uuid;
  r_dept uuid;
  r_owner uuid;
  p_org uuid;
begin
  select p.role, p.org_id into r, p_org from public.profiles p where p.id = auth.uid();
  if r is null or p_org is distinct from public.current_org_id() or p_org is null then
    return false;
  end if;

  select r0.dept_id, r0.owner_id into r_dept, r_owner
  from public.rotas r0
  where r0.id = p_rota_id and r0.org_id = public.current_org_id();

  if r_owner is null then
    return false;
  end if;

  if r in ('org_admin', 'super_admin') then
    return true;
  end if;

  if r = 'coordinator' then
    return true;
  end if;

  if r_owner = auth.uid() then
    return true;
  end if;

  if r = 'manager' and r_dept is not null then
    return public.can_manage_rota_for_dept(r_dept);
  end if;

  return false;
end;
$$;

-- Org admin only: transfer rota ownership
create or replace function public.rota_transfer_owner(p_rota_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
  ro uuid;
  new_org uuid;
begin
  select p.role into r from public.profiles p where p.id = auth.uid();
  if r is null or r not in ('org_admin', 'super_admin') then
    raise exception 'Only org admin may transfer rota ownership';
  end if;

  select org_id into ro from public.rotas where id = p_rota_id;
  if ro is null or ro <> public.current_org_id() then
    raise exception 'Rota not found';
  end if;

  select org_id into new_org from public.profiles where id = p_new_owner_id;
  if new_org is null or new_org <> ro then
    raise exception 'New owner must be in the same organisation';
  end if;

  update public.rotas
  set owner_id = p_new_owner_id, updated_at = now()
  where id = p_rota_id;
end;
$$;

grant execute on function public.rota_transfer_owner(uuid, uuid) to authenticated;

-- Active org member claims an open shift (user_id IS NULL) on a rota they can see
create or replace function public.rota_claim_open_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.rota_shifts where id = p_shift_id;
  if s.id is null or s.org_id <> public.current_org_id() then
    raise exception 'Shift not found';
  end if;
  if s.user_id is not null then
    raise exception 'Shift is not open';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.org_id = s.org_id
      and p.status = 'active'
  ) then
    raise exception 'Not allowed';
  end if;

  -- Must be allowed to see this open slot (same rules as SELECT)
  if s.rota_id is not null then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = s.org_id
        and p.status = 'active'
    ) then
      raise exception 'Not allowed';
    end if;
  end if;

  update public.rota_shifts
  set user_id = auth.uid()
  where id = p_shift_id and user_id is null;
end;
$$;

grant execute on function public.rota_claim_open_shift(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: rotas
-- ---------------------------------------------------------------------------

alter table public.rotas enable row level security;
alter table public.rota_members enable row level security;

drop policy if exists rotas_select on public.rotas;
create policy rotas_select
  on public.rotas
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.status = 'active'
    )
  );

drop policy if exists rotas_insert on public.rotas;
create policy rotas_insert
  on public.rotas
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and owner_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.status = 'active'
        and (
          p.role in ('org_admin', 'super_admin', 'coordinator')
          or (
            p.role = 'manager'
            and dept_id is not null
            and public.can_manage_rota_for_dept(dept_id)
          )
        )
    )
  );

drop policy if exists rotas_update on public.rotas;
create policy rotas_update
  on public.rotas
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.can_manage_rota_assignments(id)
  )
  with check (
    org_id = public.current_org_id()
    and public.can_manage_rota_assignments(id)
  );

drop policy if exists rotas_delete on public.rotas;
create policy rotas_delete
  on public.rotas
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.can_manage_rota_assignments(id)
  );

-- ---------------------------------------------------------------------------
-- RLS: rota_members
-- ---------------------------------------------------------------------------

drop policy if exists rota_members_select on public.rota_members;
create policy rota_members_select
  on public.rota_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rotas r
      where r.id = rota_members.rota_id
        and r.org_id = public.current_org_id()
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.status = 'active'
    )
  );

drop policy if exists rota_members_mutate on public.rota_members;
create policy rota_members_mutate
  on public.rota_members
  for all
  to authenticated
  using (
    exists (
      select 1 from public.rotas r
      where r.id = rota_members.rota_id
        and public.can_manage_rota_assignments(r.id)
    )
  )
  with check (
    exists (
      select 1 from public.rotas r
      where r.id = rota_members.rota_id
        and public.can_manage_rota_assignments(r.id)
    )
    and exists (
      select 1 from public.profiles p
      where p.id = rota_members.user_id
        and p.org_id = public.current_org_id()
        and p.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: rota_shifts (replace)
-- ---------------------------------------------------------------------------

drop policy if exists rota_shifts_select on public.rota_shifts;
create policy rota_shifts_select
  on public.rota_shifts
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = public.current_org_id()
        and p.status = 'active'
    )
    and (
      (
        rota_id is null
        and (
          user_id = auth.uid()
          or user_id is null
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('org_admin', 'super_admin', 'coordinator')
          )
          or exists (
            select 1 from public.dept_managers dm
            where dm.user_id = auth.uid()
              and dm.dept_id = rota_shifts.dept_id
          )
        )
      )
      or (
        rota_id is not null
        and (
          user_id = auth.uid()
          or user_id is null
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role in ('org_admin', 'super_admin', 'coordinator')
          )
          or exists (
            select 1 from public.rotas r
            where r.id = rota_shifts.rota_id
              and r.owner_id = auth.uid()
          )
          or exists (
            select 1 from public.rota_members m
            where m.rota_id = rota_shifts.rota_id
              and m.user_id = auth.uid()
          )
          or exists (
            select 1 from public.dept_managers dm
            where dm.user_id = auth.uid()
              and (
                dm.dept_id = rota_shifts.dept_id
                or dm.dept_id = (select r.dept_id from public.rotas r where r.id = rota_shifts.rota_id)
              )
          )
        )
      )
    )
  );

drop policy if exists rota_shifts_insert on public.rota_shifts;
create policy rota_shifts_insert
  on public.rota_shifts
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and (
      (
        rota_id is null
        and (
          (
            dept_id is not null
            and public.can_manage_rota_for_dept(dept_id)
          )
          or (
            dept_id is null
            and exists (
              select 1 from public.profiles p
              where p.id = auth.uid()
                and p.role in ('org_admin', 'super_admin')
            )
          )
        )
      )
      or (
        rota_id is not null
        and public.can_manage_rota_assignments(rota_id)
      )
    )
  );

drop policy if exists rota_shifts_update on public.rota_shifts;
create policy rota_shifts_update
  on public.rota_shifts
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      (
        rota_id is null
        and (
          (
            dept_id is not null
            and public.can_manage_rota_for_dept(dept_id)
          )
          or (
            dept_id is null
            and exists (
              select 1 from public.profiles p
              where p.id = auth.uid()
                and p.role in ('org_admin', 'super_admin')
            )
          )
        )
      )
      or (
        rota_id is not null
        and public.can_manage_rota_assignments(rota_id)
      )
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      (
        rota_id is null
        and (
          (
            dept_id is not null
            and public.can_manage_rota_for_dept(dept_id)
          )
          or (
            dept_id is null
            and exists (
              select 1 from public.profiles p
              where p.id = auth.uid()
                and p.role in ('org_admin', 'super_admin')
            )
          )
        )
      )
      or (
        rota_id is not null
        and public.can_manage_rota_assignments(rota_id)
      )
    )
  );

drop policy if exists rota_shifts_delete on public.rota_shifts;
create policy rota_shifts_delete
  on public.rota_shifts
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      (
        rota_id is null
        and (
          (
            dept_id is not null
            and public.can_manage_rota_for_dept(dept_id)
          )
          or (
            dept_id is null
            and exists (
              select 1 from public.profiles p
              where p.id = auth.uid()
                and p.role in ('org_admin', 'super_admin')
            )
          )
        )
      )
      or (
        rota_id is not null
        and public.can_manage_rota_assignments(rota_id)
      )
    )
  );
