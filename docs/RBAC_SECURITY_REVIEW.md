# RBAC security review (Phase 7)

This note summarizes a **manual review** of tenant admin/API routes and how they relate to PostgreSQL RLS/RPC enforcement. It is not a penetration test.

## Principles

- **Authoritative enforcement** is in the database: `has_permission`, hierarchy helpers (`is_reports_descendant_in_org`, `is_effective_org_admin`, `actor_can_assign_role`), RLS on `profiles`, `departments`, `user_departments`, `user_permission_overrides`, etc.
- **Next.js API routes** should mirror gates where possible so clients get fast 403/400s, but **must not** be the only line of defense.
- **Supabase client** in routes uses the user JWT; queries respect RLS unless a route uses the **service role** (elevated).

## Reviewed admin routes (generally aligned)

| Route | Gate pattern | Notes |
|--------|---------------|--------|
| `POST /api/admin/members/assign-role` | `assign_user_org_role` | Rank, system/custom, reports rules enforced in RPC. |
| `POST /api/admin/members/update-reports-to` | `update_member_reports_to` | Hierarchy + cycle check in RPC. |
| `GET /api/admin/members/assignable-roles` | `list_assignable_org_roles` | Ceiling + non–org-admin custom-only roles. |
| `GET/POST .../members/[userId]/permission-overrides` | `has_permission` + `is_effective_org_admin` / `is_reports_descendant_in_org` + RPCs | Mutations also enforced in RPC + RLS/trigger. |
| `GET/POST /api/admin/custom-roles` | `roles.manage` + `create_org_role` / picker validation | Custom roles only; caps in RPC. |
| `GET/PATCH/DELETE /api/admin/custom-roles/[roleId]` | Same | |
| `GET/POST /api/admin/roles`, `PATCH .../roles/[roleId]` | `roles.view` / `create_org_role` / `update_org_role_permissions` | Server RPCs enforce caps and system-role edit rules. |
| `POST /api/admin/permissions/bootstrap` | `roles.manage` + service role catalog upsert | Intentionally powerful; service role only for catalog table. |
| `POST /api/admin/resend-access-email`, invite flows | `members.invite` | See finding below for **provision** path. |

## Department isolation

- **List/read** surfaces rely on RLS (`profiles_select_department_isolation`, scoped `departments`, `user_departments`, etc.). API handlers that only `select` with the user client **inherit** those boundaries.
- **HR directory / org chart** use `hr_directory_list`, which masks `reports_to` when the viewer cannot see the manager profile.

## Findings / gaps

### 1. Member invite provision (`admin_provision_invited_member`) — elevation risk

`POST /api/admin/invite-member` checks `members.invite`, then calls **`admin_provision_invited_member` with the service role**. That RPC validates legacy **profile role strings** and org membership setup but **does not** currently invoke `actor_can_assign_role` or the Phase 5 system/custom assignment rules used by `assign_user_org_role`.

**Risk:** An actor with `members.invite` could invite someone to a **higher** legacy role than their own rank allows, depending on how `org_roles` keys map to profile `role`.

**Recommendation:** After provisioning, call `assign_user_org_role` (or a new unified RPC) under a security-definer that also checks the **inviter** (pass inviter id) and rank/system rules; or restrict `members.invite` to roles that cannot exceed inviter (product + DB).

### 2. AI summarize route

`POST /api/broadcasts/summarize` requires authentication but **not** a specific org permission. Any authenticated user can send arbitrary title/body to the summarization provider.

**Recommendation:** Gate with something like `broadcasts.view` or `broadcasts.manage` for the relevant broadcast/org, or restrict to internal admin use.

### 3. Non–admin API surface

Routes under `/api/admin/*` were the focus. Other `/api/*` routes should be reviewed periodically (e.g. job application CV download, Unsplash, Google OAuth) for org scoping; many are user-scoped or third-party and acceptable.

## Conclusion

Role assignment and permission overrides added in Phases 4–6 are **RPC-first** and consistent on routes that use them. The **invite → service-role provision** path is the main **documented gap** relative to rank/system-role rules; closing it should be a follow-up migration + API tightening.
