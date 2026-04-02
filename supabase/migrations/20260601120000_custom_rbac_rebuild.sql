-- Customizable RBAC foundation (clean rebuild).
-- Founder remains global via platform_admins; org permissions are tenant-scoped.

create table if not exists public.permission_catalog (
  key text primary key,
  label text not null,
  description text not null default '',
  is_founder_only boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.org_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  key text not null,
  label text not null,
  description text not null default '',
  is_system boolean not null default false,
  is_archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create table if not exists public.org_role_permissions (
  role_id uuid not null references public.org_roles(id) on delete cascade,
  permission_key text not null references public.permission_catalog(key) on delete cascade,
  constraint org_role_permissions_pkey primary key (role_id, permission_key)
);

create table if not exists public.user_org_role_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  role_id uuid not null references public.org_roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint user_org_role_assignments_pkey primary key (user_id, org_id, role_id)
);

create table if not exists public.org_permission_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  permission_key text not null references public.permission_catalog(key) on delete cascade,
  rule jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_role_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists org_roles_org_id_idx on public.org_roles(org_id);
create index if not exists user_org_role_assignments_user_org_idx on public.user_org_role_assignments(user_id, org_id);
create index if not exists user_org_role_assignments_org_idx on public.user_org_role_assignments(org_id);
create index if not exists org_permission_policies_org_perm_idx on public.org_permission_policies(org_id, permission_key);
create index if not exists audit_role_events_org_created_idx on public.audit_role_events(org_id, created_at desc);

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('members.view', 'View members', 'View users and member profiles.', false),
  ('members.invite', 'Invite members', 'Invite users to organisation.', false),
  ('members.edit_roles', 'Edit member roles', 'Assign and update member role assignments.', false),
  ('members.edit_status', 'Edit member status', 'Activate/deactivate members.', false),
  ('members.remove', 'Remove members', 'Remove users from organisation.', false),
  ('approvals.members.review', 'Review member approvals', 'Approve or reject pending members.', false),
  ('roles.view', 'View role permissions', 'View org role permission matrix.', false),
  ('roles.manage', 'Manage roles', 'Create/update/archive roles and grants.', false),
  ('departments.manage', 'Manage departments', 'Manage departments and structures.', false),
  ('teams.manage', 'Manage teams', 'Manage teams and assignments.', false),
  ('broadcasts.compose', 'Compose broadcasts', 'Create draft broadcasts.', false),
  ('broadcasts.publish', 'Publish broadcasts', 'Send scheduled/immediate broadcasts.', false),
  ('broadcasts.publish_without_approval', 'Publish without approval', 'Skip approval requirement for sends.', false),
  ('broadcasts.approve', 'Approve broadcasts', 'Approve pending broadcasts.', false),
  ('rota.view', 'View rota', 'View rota schedules.', false),
  ('rota.manage', 'Manage rota', 'Create/edit rota definitions and shifts.', false),
  ('rota.final_approve', 'Final approve rota changes', 'Approve rota swaps/changes.', false),
  ('discounts.verify_qr', 'Verify staff discount QR', 'Use discount verification scanner.', false),
  ('org.settings.manage', 'Manage org settings', 'Change organisation settings.', false),
  ('integrations.manage', 'Manage integrations', 'Manage integrations and credentials.', false),
  ('recruitment.manage', 'Manage recruitment', 'Manage recruitment requests.', false),
  ('jobs.manage', 'Manage jobs', 'Manage job listings.', false),
  ('applications.manage', 'Manage applications', 'Manage job applications.', false),
  ('offers.manage', 'Manage offers', 'Manage offer templates and offer letters.', false),
  ('interviews.manage', 'Manage interviews', 'Manage interview schedule.', false),
  ('founder.platform.manage', 'Founder platform access', 'Platform-global founder controls.', true),
  ('founder.billing.manage', 'Founder billing access', 'Billing and subscription controls.', true),
  ('founder.feature_flags.manage', 'Founder feature flags', 'Platform feature flag controls.', true)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;

create or replace function public.is_platform_founder(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = p_user_id
  );
$$;

create or replace function public.has_permission(
  p_user_id uuid,
  p_org_id uuid,
  p_permission_key text,
  p_context jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_founder boolean := false;
  v_member_active boolean := false;
  v_granted boolean := false;
  v_requires_approval boolean := false;
begin
  if p_user_id is null or p_org_id is null or coalesce(trim(p_permission_key), '') = '' then
    return false;
  end if;

  select public.is_platform_founder(p_user_id) into v_founder;
  if v_founder then
    return true;
  end if;

  select exists (
    select 1
    from public.user_org_memberships m
    where m.user_id = p_user_id
      and m.org_id = p_org_id
      and m.status = 'active'
  ) into v_member_active;

  if not v_member_active then
    return false;
  end if;

  select exists (
    select 1
    from public.user_org_role_assignments a
    join public.org_roles r on r.id = a.role_id
    join public.org_role_permissions rp on rp.role_id = r.id
    where a.user_id = p_user_id
      and a.org_id = p_org_id
      and r.org_id = p_org_id
      and r.is_archived = false
      and rp.permission_key = p_permission_key
  ) into v_granted;

  if not v_granted then
    return false;
  end if;

  select coalesce((opp.rule ->> 'requires_approval')::boolean, false)
  into v_requires_approval
  from public.org_permission_policies opp
  where opp.org_id = p_org_id
    and opp.permission_key = p_permission_key
    and opp.is_active = true
  order by opp.created_at desc
  limit 1;

  if v_requires_approval and coalesce((p_context ->> 'approved')::boolean, false) = false then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.has_current_org_permission(
  p_permission_key text,
  p_context jsonb default '{}'::jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), public.current_org_id(), p_permission_key, p_context);
$$;

create or replace function public.get_my_permissions(p_org_id uuid default null)
returns table(permission_key text)
language sql
stable
security definer
set search_path = public
as $$
  with target_org as (
    select coalesce(p_org_id, public.current_org_id()) as org_id
  )
  select distinct rp.permission_key
  from target_org t
  join public.user_org_role_assignments a
    on a.user_id = auth.uid() and a.org_id = t.org_id
  join public.org_roles r
    on r.id = a.role_id and r.org_id = t.org_id and r.is_archived = false
  join public.org_role_permissions rp
    on rp.role_id = r.id
  union
  select pc.key
  from target_org t
  join public.permission_catalog pc on true
  where public.is_platform_founder(auth.uid()) = true
    and pc.is_founder_only = false;
$$;

create or replace function public.create_org_role(
  p_org_id uuid,
  p_key text,
  p_label text,
  p_description text default '',
  p_permission_keys text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_key text := lower(regexp_replace(trim(coalesce(p_key, '')), '[^a-z0-9_]+', '_', 'g'));
  v_perm text;
begin
  if not public.has_permission(auth.uid(), p_org_id, 'roles.manage', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_key = '' then
    raise exception 'role key required';
  end if;
  if trim(coalesce(p_label, '')) = '' then
    raise exception 'role label required';
  end if;

  insert into public.org_roles (org_id, key, label, description, is_system, is_archived, created_by)
  values (p_org_id, v_key, trim(p_label), coalesce(p_description, ''), false, false, auth.uid())
  returning id into v_role_id;

  foreach v_perm in array coalesce(p_permission_keys, '{}')
  loop
    insert into public.org_role_permissions (role_id, permission_key)
    values (v_role_id, trim(v_perm))
    on conflict do nothing;
  end loop;

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (p_org_id, auth.uid(), null, 'role.created', jsonb_build_object('role_id', v_role_id, 'key', v_key));

  return v_role_id;
end;
$$;

create or replace function public.update_org_role_permissions(
  p_org_id uuid,
  p_role_id uuid,
  p_label text,
  p_description text,
  p_permission_keys text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perm text;
begin
  if not public.has_permission(auth.uid(), p_org_id, 'roles.manage', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.org_roles r
  set
    label = trim(coalesce(p_label, r.label)),
    description = coalesce(p_description, r.description),
    updated_at = now()
  where r.id = p_role_id
    and r.org_id = p_org_id
    and r.is_archived = false;

  delete from public.org_role_permissions rp
  using public.org_roles r
  where rp.role_id = r.id
    and r.id = p_role_id
    and r.org_id = p_org_id;

  foreach v_perm in array coalesce(p_permission_keys, '{}')
  loop
    insert into public.org_role_permissions (role_id, permission_key)
    values (p_role_id, trim(v_perm))
    on conflict do nothing;
  end loop;

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (p_org_id, auth.uid(), null, 'role.permissions_updated', jsonb_build_object('role_id', p_role_id));
end;
$$;

create or replace function public.assign_user_org_role(
  p_org_id uuid,
  p_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), p_org_id, 'members.edit_roles', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_org_memberships m
    where m.user_id = p_user_id and m.org_id = p_org_id
  ) then
    raise exception 'target user is not a member of this organisation';
  end if;

  if not exists (
    select 1 from public.org_roles r
    where r.id = p_role_id and r.org_id = p_org_id and r.is_archived = false
  ) then
    raise exception 'invalid role';
  end if;

  delete from public.user_org_role_assignments a
  where a.user_id = p_user_id and a.org_id = p_org_id;

  insert into public.user_org_role_assignments (user_id, org_id, role_id, assigned_by)
  values (p_user_id, p_org_id, p_role_id, auth.uid());

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (p_org_id, auth.uid(), p_user_id, 'role.assigned', jsonb_build_object('role_id', p_role_id));
end;
$$;

-- Seed system roles and role-permission mappings from legacy roles.
insert into public.org_roles (org_id, key, label, description, is_system)
select o.id, 'org_admin', 'Org admin', 'System role migrated from legacy org_admin.', true
from public.organisations o
on conflict (org_id, key) do nothing;

insert into public.org_roles (org_id, key, label, description, is_system)
select o.id, 'manager', 'Manager', 'System role migrated from legacy manager.', true
from public.organisations o
on conflict (org_id, key) do nothing;

insert into public.org_roles (org_id, key, label, description, is_system)
select o.id, 'coordinator', 'Coordinator', 'System role migrated from legacy coordinator.', true
from public.organisations o
on conflict (org_id, key) do nothing;

insert into public.org_roles (org_id, key, label, description, is_system)
select o.id, 'administrator', 'Administrator', 'System role migrated from legacy administrator.', true
from public.organisations o
on conflict (org_id, key) do nothing;

insert into public.org_roles (org_id, key, label, description, is_system)
select o.id, 'duty_manager', 'Duty manager', 'System role migrated from legacy duty_manager.', true
from public.organisations o
on conflict (org_id, key) do nothing;

insert into public.org_roles (org_id, key, label, description, is_system)
select o.id, 'csa', 'CSA', 'System role migrated from legacy csa.', true
from public.organisations o
on conflict (org_id, key) do nothing;

insert into public.org_roles (org_id, key, label, description, is_system)
select o.id, 'society_leader', 'Society leader', 'System role migrated from legacy society_leader.', true
from public.organisations o
on conflict (org_id, key) do nothing;

insert into public.org_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.org_roles r
join (
  values
    ('org_admin', 'members.view'),
    ('org_admin', 'members.invite'),
    ('org_admin', 'members.edit_roles'),
    ('org_admin', 'members.edit_status'),
    ('org_admin', 'members.remove'),
    ('org_admin', 'approvals.members.review'),
    ('org_admin', 'roles.view'),
    ('org_admin', 'roles.manage'),
    ('org_admin', 'departments.manage'),
    ('org_admin', 'teams.manage'),
    ('org_admin', 'broadcasts.compose'),
    ('org_admin', 'broadcasts.publish'),
    ('org_admin', 'broadcasts.publish_without_approval'),
    ('org_admin', 'broadcasts.approve'),
    ('org_admin', 'rota.view'),
    ('org_admin', 'rota.manage'),
    ('org_admin', 'rota.final_approve'),
    ('org_admin', 'discounts.verify_qr'),
    ('org_admin', 'org.settings.manage'),
    ('org_admin', 'integrations.manage'),
    ('org_admin', 'recruitment.manage'),
    ('org_admin', 'jobs.manage'),
    ('org_admin', 'applications.manage'),
    ('org_admin', 'offers.manage'),
    ('org_admin', 'interviews.manage'),
    ('manager', 'members.view'),
    ('manager', 'approvals.members.review'),
    ('manager', 'broadcasts.compose'),
    ('manager', 'broadcasts.publish'),
    ('manager', 'broadcasts.approve'),
    ('manager', 'rota.view'),
    ('manager', 'rota.manage'),
    ('manager', 'rota.final_approve'),
    ('manager', 'discounts.verify_qr'),
    ('coordinator', 'members.view'),
    ('coordinator', 'approvals.members.review'),
    ('coordinator', 'broadcasts.compose'),
    ('coordinator', 'broadcasts.publish'),
    ('coordinator', 'rota.view'),
    ('coordinator', 'rota.manage'),
    ('administrator', 'broadcasts.compose'),
    ('administrator', 'broadcasts.publish'),
    ('administrator', 'broadcasts.publish_without_approval'),
    ('administrator', 'rota.view'),
    ('duty_manager', 'broadcasts.compose'),
    ('duty_manager', 'discounts.verify_qr'),
    ('duty_manager', 'rota.view'),
    ('duty_manager', 'rota.final_approve'),
    ('csa', 'broadcasts.compose'),
    ('csa', 'rota.view'),
    ('society_leader', 'broadcasts.compose'),
    ('society_leader', 'rota.view')
) as p(role_key, permission_key)
  on p.role_key = r.key
on conflict do nothing;

insert into public.user_org_role_assignments (user_id, org_id, role_id)
select p.id, p.org_id, r.id
from public.profiles p
join public.org_roles r
  on r.org_id = p.org_id
 and r.key = case
   when p.role = 'super_admin' then 'org_admin'
   else p.role
 end
where p.org_id is not null
  and p.role is not null
  and p.role <> 'unassigned'
on conflict do nothing;

alter table public.org_roles enable row level security;
alter table public.org_role_permissions enable row level security;
alter table public.user_org_role_assignments enable row level security;
alter table public.org_permission_policies enable row level security;
alter table public.audit_role_events enable row level security;

drop policy if exists org_roles_select on public.org_roles;
create policy org_roles_select on public.org_roles
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists org_roles_mutate on public.org_roles;
create policy org_roles_mutate on public.org_roles
for all to authenticated
using (public.has_current_org_permission('roles.manage', '{}'::jsonb))
with check (public.has_current_org_permission('roles.manage', '{}'::jsonb));

drop policy if exists org_role_permissions_select on public.org_role_permissions;
create policy org_role_permissions_select on public.org_role_permissions
for select to authenticated
using (
  exists (
    select 1
    from public.org_roles r
    where r.id = role_id
      and r.org_id = public.current_org_id()
  )
);

drop policy if exists org_role_permissions_mutate on public.org_role_permissions;
create policy org_role_permissions_mutate on public.org_role_permissions
for all to authenticated
using (public.has_current_org_permission('roles.manage', '{}'::jsonb))
with check (public.has_current_org_permission('roles.manage', '{}'::jsonb));

drop policy if exists user_org_role_assignments_select on public.user_org_role_assignments;
create policy user_org_role_assignments_select on public.user_org_role_assignments
for select to authenticated
using (
  org_id = public.current_org_id()
  and (
    user_id = auth.uid()
    or public.has_current_org_permission('members.view', '{}'::jsonb)
  )
);

drop policy if exists user_org_role_assignments_mutate on public.user_org_role_assignments;
create policy user_org_role_assignments_mutate on public.user_org_role_assignments
for all to authenticated
using (public.has_current_org_permission('members.edit_roles', '{}'::jsonb))
with check (public.has_current_org_permission('members.edit_roles', '{}'::jsonb));

drop policy if exists org_permission_policies_select on public.org_permission_policies;
create policy org_permission_policies_select on public.org_permission_policies
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists org_permission_policies_mutate on public.org_permission_policies;
create policy org_permission_policies_mutate on public.org_permission_policies
for all to authenticated
using (public.has_current_org_permission('roles.manage', '{}'::jsonb))
with check (public.has_current_org_permission('roles.manage', '{}'::jsonb));

drop policy if exists audit_role_events_select on public.audit_role_events;
create policy audit_role_events_select on public.audit_role_events
for select to authenticated
using (
  org_id = public.current_org_id()
  and public.has_current_org_permission('roles.view', '{}'::jsonb)
);

revoke all on function public.has_permission(uuid, uuid, text, jsonb) from public;
grant execute on function public.has_permission(uuid, uuid, text, jsonb) to authenticated, service_role;
revoke all on function public.has_current_org_permission(text, jsonb) from public;
grant execute on function public.has_current_org_permission(text, jsonb) to authenticated, service_role;
revoke all on function public.get_my_permissions(uuid) from public;
grant execute on function public.get_my_permissions(uuid) to authenticated, service_role;
revoke all on function public.create_org_role(uuid, text, text, text, text[]) from public;
grant execute on function public.create_org_role(uuid, text, text, text, text[]) to authenticated, service_role;
revoke all on function public.update_org_role_permissions(uuid, uuid, text, text, text[]) from public;
grant execute on function public.update_org_role_permissions(uuid, uuid, text, text, text[]) to authenticated, service_role;
revoke all on function public.assign_user_org_role(uuid, uuid, uuid) from public;
grant execute on function public.assign_user_org_role(uuid, uuid, uuid) to authenticated, service_role;

