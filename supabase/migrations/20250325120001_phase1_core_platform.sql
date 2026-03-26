-- Phase 1 — Core platform: orgs, profiles, departments, subscriptions, RLS.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid references public.organisations (id),
  full_name text not null,
  role text not null check (
    role in (
      'super_admin',
      'senior_manager',
      'manager',
      'coordinator',
      'assistant',
      'weekly_paid',
      'society_leader'
    )
  ),
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  avatar_url text,
  rejection_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  accent_preset text not null default 'midnight',
  color_scheme text not null default 'system' check (color_scheme in ('light', 'dark', 'system')),
  dnd_enabled boolean not null default false,
  dnd_start time,
  dnd_end time,
  created_at timestamptz not null default now()
);

create index profiles_org_id_idx on public.profiles (org_id);
create index profiles_status_idx on public.profiles (status);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  description text,
  type text not null default 'department' check (type in ('department', 'society', 'club')),
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index departments_org_id_idx on public.departments (org_id);

create table public.dept_categories (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid not null references public.departments (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (dept_id, name)
);

create index dept_categories_dept_id_idx on public.dept_categories (dept_id);

create table public.user_departments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  dept_id uuid not null references public.departments (id) on delete cascade,
  primary key (user_id, dept_id)
);

create table public.user_subscriptions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  cat_id uuid not null references public.dept_categories (id) on delete cascade,
  subscribed boolean not null default true,
  primary key (user_id, cat_id)
);

create table public.dept_managers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  dept_id uuid not null references public.departments (id) on delete cascade,
  primary key (user_id, dept_id)
);

-- ---------------------------------------------------------------------------
-- Helper functions (after tables — can_approve_profile references junction tables)
-- ---------------------------------------------------------------------------

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.can_approve_profile(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pv
    join public.profiles pt on pt.id = target
    where pv.id = viewer
      and pv.org_id = pt.org_id
      and pt.status = 'pending'
      and viewer <> target
      and (
        pv.role in ('super_admin', 'senior_manager')
        or (
          pv.role = 'manager'
          and exists (
            select 1
            from public.user_departments udt
            join public.dept_managers dm
              on dm.dept_id = udt.dept_id and dm.user_id = viewer
            where udt.user_id = target
          )
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.dept_categories enable row level security;
alter table public.user_departments enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.dept_managers enable row level security;

-- organisations
create policy organisations_select_anon
  on public.organisations
  for select
  to anon
  using (is_active = true);

create policy organisations_select_member
  on public.organisations
  for select
  to authenticated
  using (
    is_active = true
    or id = public.current_org_id()
  );

-- Inserts into organisations use service role / SQL (platform admin), not the anon key.

create policy organisations_update_super_admin
  on public.organisations
  for update
  to authenticated
  using (
    id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin' and p.org_id = organisations.id
    )
  )
  with check (
    id = public.current_org_id()
  );

-- profiles
create policy profiles_select_same_org
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or org_id = public.current_org_id()
  );

create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and org_id is not null
    and role = 'weekly_paid'
  );

-- New self-registration: default role weekly_paid until manager changes (optional). Spec: pending until approved.
-- Keep role as weekly_paid for applicants; managers approve into intended role via separate flow Phase 1+.
-- Spec lists roles — registration sets pending; we store requested role in profile.role as weekly_paid baseline.

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_by_approver
  on public.profiles
  for update
  to authenticated
  using (public.can_approve_profile(auth.uid(), id))
  with check (org_id = (select org_id from public.profiles where id = auth.uid()));

-- departments
create policy departments_select_anon
  on public.departments
  for select
  to anon
  using (
    is_archived = false
    and exists (
      select 1 from public.organisations o
      where o.id = departments.org_id and o.is_active = true
    )
  );

create policy departments_select_auth
  on public.departments
  for select
  to authenticated
  using (
    (
      is_archived = false
      and exists (
        select 1 from public.organisations o
        where o.id = departments.org_id and o.is_active = true
      )
    )
    or org_id = public.current_org_id()
  );

create policy departments_mutate_super_admin
  on public.departments
  for all
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'super_admin' and p.org_id = departments.org_id
    )
  )
  with check (
    org_id = public.current_org_id()
  );

-- dept_categories
create policy dept_categories_select_anon
  on public.dept_categories
  for select
  to anon
  using (
    exists (
      select 1
      from public.departments d
      join public.organisations o on o.id = d.org_id
      where d.id = dept_categories.dept_id
        and d.is_archived = false
        and o.is_active = true
    )
  );

create policy dept_categories_select_auth
  on public.dept_categories
  for select
  to authenticated
  using (
    exists (
      select 1 from public.departments d
      where d.id = dept_categories.dept_id
        and (
          d.org_id = public.current_org_id()
          or (
            d.is_archived = false
            and exists (select 1 from public.organisations o where o.id = d.org_id and o.is_active = true)
          )
        )
    )
  );

create policy dept_categories_mutate_super_admin
  on public.dept_categories
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_categories.dept_id
        and d.org_id = p.org_id
        and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_categories.dept_id
        and d.org_id = p.org_id
        and p.role = 'super_admin'
    )
  );

-- user_departments
create policy user_departments_select
  on public.user_departments
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.departments d
      where d.id = user_departments.dept_id
        and d.org_id = public.current_org_id()
    )
  );

create policy user_departments_insert_self
  on public.user_departments
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy user_departments_delete_self
  on public.user_departments
  for delete
  to authenticated
  using (user_id = auth.uid());

-- user_subscriptions
create policy user_subscriptions_select
  on public.user_subscriptions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.dept_categories c
      join public.departments d on d.id = c.dept_id
      where c.id = user_subscriptions.cat_id
        and d.org_id = public.current_org_id()
    )
  );

create policy user_subscriptions_insert_self
  on public.user_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy user_subscriptions_update_self
  on public.user_subscriptions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_subscriptions_delete_self
  on public.user_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- dept_managers
create policy dept_managers_select
  on public.dept_managers
  for select
  to authenticated
  using (
    exists (
      select 1 from public.departments d
      where d.id = dept_managers.dept_id
        and d.org_id = public.current_org_id()
    )
  );

create policy dept_managers_mutate_super_admin
  on public.dept_managers
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_managers.dept_id
        and d.org_id = p.org_id
        and p.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_managers.dept_id
        and d.org_id = p.org_id
        and p.role = 'super_admin'
    )
  );

-- Prevent users from changing their own role/status (approvals use separate policy).
create or replace function public.profiles_block_self_role_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'update' and new.id = old.id and new.id = auth.uid() then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Cannot change role or status on your own profile';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_no_self_role_status_change
before update on public.profiles
for each row
execute procedure public.profiles_block_self_role_status();
