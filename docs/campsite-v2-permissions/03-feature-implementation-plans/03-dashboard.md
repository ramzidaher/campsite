# 03 — Dashboard (home)

## 1. Product intent

- The dashboard is the **default post-login home** (`/` redirects to `/dashboard` for active members).
- **KPI tiles** (broadcasts sent count, active members count) are **not shown to everyone**: scope is **org-wide**, **department-scoped**, or **hidden** based on `profiles.role`.
- **Quick actions** (e.g. compose broadcast, link to member directory) must respect the same capability helpers as the rest of the app.

## 2. Shared types and API (source of truth for KPI scope)

### 2.1 Types

**File:** `packages/types/src/dashboard.ts`

| Function | Returns | Meaning |
|----------|---------|---------|
| `dashboardAggregateScope(role)` | `'none' \| 'org' \| 'dept'` | Drives whether KPI tiles appear and how they’re labelled. |
| `canViewDashboardStatTiles(role)` | boolean | `scope !== 'none'`. |
| `canViewOrgWideDashboardStats(role)` | boolean | Deprecated alias for `scope === 'org'`. |

**Baseline:**

- **`org`:** `org_admin`, legacy `super_admin`
- **`dept`:** `manager`, `coordinator`, `society_leader`
- **`none`:** `administrator`, `duty_manager`, `csa` (no aggregate tiles)

### 2.2 Count queries

**File:** `packages/api/src/dashboardStatCounts.ts` — `fetchDashboardStatCounts(supabase, { userId, orgId, role })`

- Imports **`dashboardAggregateScope`** from **`@campsite/types`** (no duplicated role matrix).

**Logic:**

- **`org` scope:** `broadcasts` count `status = 'sent'` for `org_id`; `profiles` count `status = 'active'` for `org_id`.
- **`dept` scope:** Union `user_departments` for user; for **managers**, also union `dept_managers`. Filter `broadcasts` and member counts to those departments (see implementation for exact queries).

**Rule:** If you change scope in `dashboard.ts`, **`fetchDashboardStatCounts` follows automatically** via the shared import — still verify query behaviour for each scope.

## 3. Backend (Supabase)

### 3.1 Tables touched

| Table | Usage |
|-------|--------|
| `broadcasts` | Sent count (RLS must not leak other orgs’ rows) |
| `profiles` | Active member count |
| `user_departments` | Dept membership for dept scope |
| `dept_managers` | Extra dept visibility for managers |
| `departments` | Validate dept ids belong to org |

### 3.2 RLS

- All queries run as **authenticated** user; **RLS** must ensure counts cannot include data the user cannot otherwise read.
- If KPI numbers ever **diverge** from feed visibility, treat it as a **security bug** — fix RLS or restrict the query.

### 3.3 RPCs used on dashboard page

**File:** `apps/web/src/lib/dashboard/loadDashboardHome.ts`

- `fetchDashboardStatCounts` (via `@campsite/api`)
- `broadcast_unread_count` (RPC)
- `broadcasts` (recent sent), `calendar_events`, `rota_shifts`, plus `loadPendingApprovalsPreview` when `isApproverRole`

## 4. Frontend (`apps/web`)

### 4.1 Route

**File:** `apps/web/src/app/(main)/dashboard/page.tsx`

**Server steps:**

1. `createClient()` + `getUser()`.
2. Load `profiles` row: `id`, `org_id`, `role`, `full_name`, `status`.
3. Redirect: no `org_id` → `/login`; `status !== 'active'` → `/pending`.
4. `loadDashboardHome(supabase, userId, orgId, { full_name, role })`.
5. Compute:
   - `canViewOrgDirectory` → `isOrgAdminRole(role)` (link to `/admin/users`).
   - `canCompose` → `canComposeBroadcast(role)` (`packages/types/src/broadcasts.ts`).
   - `showPrimaryComposeCta` → `canCompose && !isBroadcastDraftOnlyRole(role)`.

### 4.2 Presentation component

**File:** `apps/web/src/components/dashboard/DashboardHome.tsx`

- Receives **preloaded model**; avoids duplicating stat logic on the client.
- **`membersStatHref`:** org admins get `/admin/users`; others with KPI tiles get a non-linked members tile when dept-scoped.

### 4.3 Shell badges

**File:** `apps/web/src/app/(main)/layout.tsx`

- `getPendingApprovalCount` when `isApproverRole(profileRole)`.
- `broadcast_unread_count` for sidebar/top bar badges.

## 5. Verification checklist

- [x] Org admin sees org-wide counts via `fetchDashboardStatCounts` with `scope === 'org'`. _Spot-check vs SQL when changing RLS._
- [x] Manager sees counts across union of **managed + member** departments (`dept_managers` + `user_departments`, filtered by org).
- [x] Administrator / duty manager / CSA see **no** KPI tiles (`dashboardAggregateScope` → `none`; `broadcastTotal` / `memberActiveTotal` omitted).
- [x] `packages/types` and `packages/api` stay aligned — **`dashboardStatCounts` imports `dashboardAggregateScope` from `@campsite/types`**.

## 6. Automated tests (`npm run test --workspace=@campsite/web`)

- `src/lib/__tests__/dashboardAggregateScope.test.ts` — scope per role class (must match §2.1).

## 7. Extension notes

- If product later gives **administrator** KPI tiles, change **`dashboardAggregateScope`** first, then verify **`fetchDashboardStatCounts`** branch behaviour and UI copy — not the reverse.

## 8. Database migrations

- Dashboard KPI logic is **application-layer** on existing tables; **no standing migration** is required for scope rules. If you add RLS or RPCs for dashboard-only access, add a migration under `supabase/migrations/` and run `npm run supabase:db:push`.
