# 09  Manager workspace (`/manager`)

## 1. Product intent

- **Managers** (`profiles.role === 'manager'`) get a **focused workspace**: overview, quick links to pending members, broadcasts, and department rota.
- This is **not** full org admin: no `/admin` access unless they are also org admin (separate role  in practice a user has one `profiles.role`).

## 2. Shared types

**File:** `packages/types/src/roles.ts`

| Helper | Purpose |
|--------|---------|
| **`isManagerRole(role)`** | Gate for **`/manager`** layout and overview; shell **Manager** section (`showManager` in `(main)/layout.tsx`). |
| **`isApproverRole`** | Managers can approve **pending members** (with RLS dept scope). |
| **`isOrgAdminRole`** | **false** for managers  use for `/admin` layout. |

## 3. Backend (Supabase)

### 3.1 Manager-specific data

- **`dept_managers`** links `user_id` → `dept_id` for departments they oversee.
- Pending approvals, broadcasts approval, and rota visibility often **intersect** manager depts  see SQL for `dept_managers` in:

  - `user_may_broadcast_to_dept`
  - Approval RPCs (`20260328120000_approval_rpcs.sql` and later)
  - `loadPendingApprovals` / dashboard dept-scoped stats (`packages/api/src/dashboardStatCounts.ts`)

### 3.2 RLS expectations

- Managers **must not** update org-wide settings tables reserved for org admin.
- Managers **may** approve broadcasts or members **only** for departments they manage  **verify** each RPC (`can_approve_profile`, `decide_pending_broadcast`, etc.).

## 4. Frontend (`apps/web`)

### 4.1 Layout (hard gate)

**File:** `apps/web/src/app/(main)/manager/layout.tsx`

1. `getUser()` → `/login`.
2. Load `profiles`: `role`, `status`, `org_id`.
3. Redirect **`/broadcasts`** if no org, not **`active`**, or **`!isManagerRole(role)`**.

**UI:** Left sidebar with links:

- `/manager`  Overview
- `/pending-approvals`  Pending members
- `/broadcasts`  Broadcasts
- `/rota`  Department rota
- Back to app home → `/broadcasts` (as implemented)

### 4.2 Manager overview page

**File:** `apps/web/src/app/(main)/manager/page.tsx`

- Same **`isManagerRole`** gate as layout.
- Summarises **manager-scoped** counts: pending members in managed depts, **`pending_approval`** broadcasts in those depts, **`rota_shifts`** in those depts this week (see `ManagerDashboardClient`).

### 4.3 Approvals

- Managers use **`/pending-approvals`** (same as coordinators) with **`PendingApprovalsClient`**.
- Org admins use **Admin → Pending**; shell hides duplicate **Approvals** nav for org admins via **`showStandaloneApprovals`** in **`(main)/layout.tsx`**.

### 4.4 Main shell

**File:** `apps/web/src/app/(main)/layout.tsx`

- **`showManager = isManagerRole(profileRole)`** → **Manager** block in **`AppShell`** with link to **`/manager`**.

## 5. Verification checklist

- [x] User with role **`coordinator`** cannot open **`/manager`**  layout **`isManagerRole`** redirect.
- [x] Manager cannot open **`/admin`**  **`admin/layout.tsx`** **`canAccessOrgAdminArea`** (`isOrgAdminRole` only).
- [x] Manager approval actions for members **outside** managed depts fail  **RLS** / **`can_approve_profile`** (see [02-member-approvals-and-profiles.md](./02-member-approvals-and-profiles.md)).
- [x] **`showManager`** uses **`isManagerRole`**  only **`manager`** role.

## 6. Automated tests (`npm run test --workspace=@campsite/web`)

- `src/lib/__tests__/managerWorkspace.test.ts`  **`isManagerRole`** vs approver/org admin.

## 7. Implementation order (extend manager powers)

1. Product: define **dept scope** for the new action.
2. SQL: RPC + RLS using **`dept_managers`**; `npm run supabase:db:push` when schema changes.
3. Optional: add link in **`manager/layout.tsx`** sidebar.
4. If a new route needs the same gate, use **`isManagerRole`** from **`@campsite/types`**.
