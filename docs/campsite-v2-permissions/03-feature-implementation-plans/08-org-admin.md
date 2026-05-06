# 08  Organisation admin (`/admin`)

## 1. Product intent

- **Org admin** (`profiles.role` = `org_admin`, legacy `super_admin`) has **full control inside one tenant**: members, structure, broadcast admin tools, rota import, discount rules, org settings, integrations.
- **Not** the same as **platform admin** (`platform_admins`  see [11-platform-founders.md](./11-platform-founders.md)).

## 2. Shared gates (web)

**File:** `apps/web/src/lib/adminGates.ts`

| Function | Meaning |
|----------|---------|
| `canAccessOrgAdminArea(role)` | May enter **`/admin/*`** at all (`isOrgAdminRole`) |
| `canManageOrgUsers(role)` | Users, pending (bulk), roles pages |
| `canManageOrgDepartments(role)` | Departments, categories |
| `canManageOrgBroadcastsAdmin(role)` | Admin broadcasts tools |
| `canManageOrgSettings(role)` | Settings, notifications, discount admin, integrations |
| `getMainShellAdminNavItems(role)` | Sidebar structure under **Admin** |

**Current implementation:** every **`canManage*`** returns **`isOrgAdminRole`**  kept as **separate functions** so sub-gates can diverge without rewriting every `page.tsx`.

**Rule:** New `/admin/*` pages should use **one** of the `canManage*` functions in `page.tsx` for sub-gates, or rely solely on **`admin/layout.tsx`** if the feature is org-admin-only without finer split.

**Managers / coordinators:** they **do not** pass `canAccessOrgAdminArea`; approval queues use **`/pending-approvals`** (see [02-member-approvals-and-profiles.md](./02-member-approvals-and-profiles.md)). The **`/admin/pending`** route lives under the org-admin layout only; its `isApproverRole` check is defensive (org admins are approvers).

## 3. Backend (Supabase)

### 3.1 Layout-level expectations

- Most **mutations** on org configuration tables require **org admin** in RLS or `SECURITY DEFINER` RPCs with explicit role checks.
- **Managers/coordinators** may have **department-scoped** RPCs for approvals (not org admin layout).

### 3.2 Tables touched by admin UI (non-exhaustive)

| Area | Tables / concepts |
|------|-------------------|
| Members | `profiles`, `user_departments`, `user_subscriptions` |
| Structure | `departments`, `dept_managers`, `dept_categories`, `dept_broadcast_permissions` |
| Content | `broadcasts` (admin tools), categories |
| Rota | **`rota_shifts`**, sync/import mapping tables |
| Discount | `discount_tiers`, `scan_logs` |
| Org | `organisations`, settings JSON columns per migrations |

**For each new admin screen:** document the **policies** and **RPCs** in that feature’s plan file (broadcasts, rota, discount) and link from here.

## 4. Frontend  Layout

**File:** `apps/web/src/app/(main)/admin/layout.tsx`

1. `getUser()` → `/login` if absent.
2. Load `profiles.role`, `status`, `org_id`.
3. Redirect **`/broadcasts`** if missing org, not **`active`**, or **`!canAccessOrgAdminArea(role)`**.

**Children:** rendered in `<div className="min-w-0">`  full-width content; main chrome is parent **`(main)/layout.tsx`** + **`AppShell`**.

## 5. Frontend  Routes (inventory)

Each path below lives under `apps/web/src/app/(main)/admin/…`.

| Route | Page file | Sub-gate (redirect target) |
|-------|-----------|----------------------------|
| `/admin` | `page.tsx` | Layout only; **`canManageOrgUsers`** gates bulk approve UI |
| `/admin/users` | `users/page.tsx` | **`canManageOrgUsers`** → `/admin` |
| `/admin/pending` | `pending/page.tsx` | **`isApproverRole`** → `/admin` (redundant with layout); **`showApproveAll`** = **`canManageOrgUsers`** |
| `/admin/roles` | `roles/page.tsx` | **`canManageOrgUsers`** → `/admin` |
| `/admin/broadcasts` | `broadcasts/page.tsx` | **`canManageOrgBroadcastsAdmin`** → `/admin` |
| `/admin/departments` | `departments/page.tsx` | **`canManageOrgDepartments`** → `/admin` |
| `/admin/categories` | `categories/page.tsx` | **`canManageOrgDepartments`** → `/admin` |
| `/admin/rota` | `rota/page.tsx` | Layout only |
| `/admin/rota-import` | `rota-import/page.tsx` | Layout only (page loads **`org_id`**) |
| `/admin/discount` | `discount/page.tsx` | **`canManageOrgSettings`** → `/admin` |
| `/admin/scan-logs` | `scan-logs/page.tsx` | **`isOrgAdminRole`** → `/admin` (stricter than **`canManageOrgSettings`**) |
| `/admin/settings` | `settings/page.tsx` | **`canManageOrgSettings`** → `/admin` |
| `/admin/notifications` | `notifications/page.tsx` | **`canManageOrgSettings`** → `/admin` |
| `/admin/integrations` | `integrations/page.tsx` | **`canManageOrgSettings`** → `/admin` |

## 6. Frontend  Shell navigation

**File:** `apps/web/src/lib/adminGates.ts`  **`getMainShellAdminNavItems`**

- Returns **`null`** if not org admin → **Admin** block hidden in **`AppShell`**.
- Pending badge merged in **`(main)/layout.tsx`** for **`/admin/pending`**.

**When adding a nav item:**

1. Add href + label to **`getMainShellAdminNavItems`**.
2. Create **`page.tsx`** with matching **sub-gate**.
3. Ensure **RLS** allows org admin mutations for that feature.

**Note:** **`/admin/rota-import`** is reached from **`AdminRotaView`** (not required in the main nav list).

## 7. Key client views (reference)

| View | Path |
|------|------|
| Overview | `components/admin/AdminOverviewView.tsx` |
| Users | `components/admin/AdminUsersClient.tsx` |
| Departments + broadcast toggles | `components/admin/AdminDepartmentsClient.tsx` |
| Org settings | `components/admin/OrgSettingsClient.tsx` |
| Integrations | `components/admin/AdminIntegrationsView.tsx` |
| Roles copy | `components/admin/AdminRolesAndPermissionsView.tsx` |

## 8. Verification checklist

- [x] Non–org-admin hitting **`/admin/users`** (or any **`/admin/*`**) is redirected  **`admin/layout.tsx`** **`canAccessOrgAdminArea`**.
- [x] Coordinator cannot use org-admin-only data paths  **RLS** on tenant tables (see feature plans); no access to **`/admin`** shell.
- [x] Scan logs use **`isOrgAdminRole`** on **`scan-logs/page.tsx`**, not only **`canManageOrgSettings`**  stays stricter if **`canManageOrgSettings`** is ever broadened.
- [x] Nav items match routes that exist; all listed **`/admin/*`** pages apply layout + documented sub-gate.

## 9. Automated tests (`npm run test --workspace=@campsite/web`)

- `src/lib/__tests__/adminGates.test.ts`  **`canAccessOrgAdminArea`**, **`canManage*`**, **`getMainShellAdminNavItems`**.

## 10. Implementation order (new admin section)

1. Product: decide **sub-gate** (`canManage*` vs org-admin-only).
2. SQL: RLS + RPCs; `npm run supabase:db:push` when schema changes.
3. `admin/.../page.tsx` server component + client view.
4. **`getMainShellAdminNavItems`** entry.
5. Cross-link from [README](./README.md) if new top-level feature.
