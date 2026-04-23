-- Speed up main_shell_layout_structural() and get_my_permissions() hot paths.
-- These lookups run on nearly every authenticated page request in the main shell.

-- Membership gate in get_my_permissions().
create index if not exists user_org_memberships_user_org_status_idx
  on public.user_org_memberships (user_id, org_id, status);

-- Role grants hydration in get_my_permissions().
create index if not exists user_org_role_assignments_user_org_idx
  on public.user_org_role_assignments (user_id, org_id, role_id);

create index if not exists org_roles_org_archived_idx
  on public.org_roles (org_id, is_archived, id);

create index if not exists org_role_permissions_role_permission_idx
  on public.org_role_permissions (role_id, permission_key);

-- Override checks (replace/additive/subtractive) in get_my_permissions().
create index if not exists user_permission_overrides_user_org_mode_permission_idx
  on public.user_permission_overrides (user_id, org_id, mode, permission_key);

-- Latest policy per permission (DISTINCT ON + created_at desc).
create index if not exists org_permission_policies_org_active_permission_created_idx
  on public.org_permission_policies (org_id, is_active, permission_key, created_at desc);

-- Department name snippet in main_shell_layout_structural().
create index if not exists user_departments_user_idx
  on public.user_departments (user_id, dept_id);
