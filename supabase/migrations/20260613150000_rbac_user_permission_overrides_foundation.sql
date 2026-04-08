-- Phase 1 RBAC data model foundation:
-- - User permission overrides table (Phase 4-ready)
-- - Relationship comments alignment for role/department/reporting links

create table if not exists public.user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('additive', 'subtractive', 'replace')),
  permission_key text not null references public.permission_catalog(key) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint user_permission_overrides_unique unique (org_id, user_id, mode, permission_key)
);

create index if not exists user_permission_overrides_org_user_idx
  on public.user_permission_overrides (org_id, user_id);

create index if not exists user_permission_overrides_org_permission_idx
  on public.user_permission_overrides (org_id, permission_key);

comment on table public.user_permission_overrides is
  'Per-user permission overrides on top of role grants. additive grants extra perms, subtractive denies role perms, replace defines explicit allowlist for replacement mode.';

comment on column public.user_permission_overrides.org_id is
  'Tenant boundary for override evaluation; must match the active organisation context.';

comment on column public.user_permission_overrides.user_id is
  'Auth user receiving the override within org_id.';

comment on column public.user_permission_overrides.mode is
  'Override behavior: additive=force grant, subtractive=force deny, replace=permission is part of explicit replacement allowlist.';

comment on column public.user_permission_overrides.permission_key is
  'Permission key from permission_catalog referenced by this override row.';

comment on column public.user_permission_overrides.created_by is
  'Profile that created this override row for auditability.';

comment on column public.user_permission_overrides.created_at is
  'Timestamp when this override row was created.';

alter table public.user_permission_overrides enable row level security;

drop policy if exists user_permission_overrides_select on public.user_permission_overrides;
create policy user_permission_overrides_select on public.user_permission_overrides
for select to authenticated
using (
  org_id = public.current_org_id()
  and (
    user_id = auth.uid()
    or public.has_current_org_permission('members.view', '{}'::jsonb)
  )
);

drop policy if exists user_permission_overrides_mutate on public.user_permission_overrides;
create policy user_permission_overrides_mutate on public.user_permission_overrides
for all to authenticated
using (public.has_current_org_permission('members.edit_roles', '{}'::jsonb))
with check (
  public.has_current_org_permission('members.edit_roles', '{}'::jsonb)
  and org_id = public.current_org_id()
);

comment on table public.user_org_role_assignments is
  'Org-scoped user-to-role assignments. Effective permissions are derived through org_roles -> org_role_permissions plus optional user_permission_overrides.';

comment on table public.user_departments is
  'Org structure membership link between users and departments; supports multi-department affiliation and powers HR/org-chart department labels.';

comment on column public.profiles.reports_to_user_id is
  'Direct manager profile in the same organisation; used to build reporting hierarchy (including org chart edges) and manager-scoped approvals.';

revoke all on table public.user_permission_overrides from public;
grant select, insert, update, delete on table public.user_permission_overrides to authenticated;
grant select, insert, update, delete on table public.user_permission_overrides to service_role;
