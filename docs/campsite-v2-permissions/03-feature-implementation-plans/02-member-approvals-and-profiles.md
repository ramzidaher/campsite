# 02  Member approvals and profiles

## 1. Product intent

- **Approvers** (org admin, manager, coordinator  see `isApproverRole` in `packages/types/src/roles.ts`) review **pending** members (`profiles.status = 'pending'`).
- Approvers **assign a real `profiles.role`** from a role list that depends on **viewer role** (`rolesAssignableOnApprove` in same file).
- **Org admins** have the broadest assignable set; managers/coordinators cannot assign `org_admin` or `manager` from the queue (per `rolesAssignableOnApprove`).

## 2. Backend (Supabase + SQL)

### 2.1 Core tables

| Table | Relevant columns |
|-------|------------------|
| `profiles` | `id`, `org_id`, `role`, `status`, `full_name`, `email`, timestamps |
| `user_departments` | `user_id`, `dept_id`  must be consistent after approval |
| `departments` | Used for displaying pending member’s departments |

### 2.2 RLS expectations

- Approvers must **only** see pending users in their **organisation** (and often scoped by **department** overlap  confirm in latest migrations for `can_approve_profile` or equivalent).
- Updates to `profiles.status` and `profiles.role` must be **denied** for non-approvers.
- **Do not** expose full org member list to pending users.

**Implemented:**

- **`can_approve_profile(viewer, target)`** (`20260329120000_v2_profile_roles.sql`, tightened in `20260405100000_can_approve_viewer_must_be_active.sql`):
  - Viewer must be **`status = 'active'`** and same `org_id` as target; target **`pending`**.
  - **Org admin** or legacy **`super_admin`**: any pending in org.
  - **Manager**: target shares a department where viewer is in **`dept_managers`**.
  - **Coordinator**: target shares a **`user_departments`** row (same `dept_id`) with viewer.

### 2.3 RPCs (patterns)

- **`approve_pending_profile(p_target, p_approve, p_rejection_note, p_role)`** (`20260403150000_unassigned_registration_and_approve_role.sql`):
  - Calls **`can_approve_profile`** first; failure → `42501 not allowed`.
  - **Approve:** single `UPDATE` sets `status = 'active'`, `role`, `reviewed_at`, `reviewed_by` (atomic for role + status).
  - **Reject:** sets `status = 'inactive'`, optional `rejection_note`.
  - **`unassigned`** pending members **must** receive a real `p_role` in `PROFILE_ROLES`; managers/coordinators cannot pass `org_admin` or `manager` (enforced in SQL, not only UI).

### 2.4 Types used for assignable roles

**File:** `packages/types/src/roles.ts`

```text
isApproverRole(role)
rolesAssignableOnApprove(viewerRole) → ProfileRole[]
isOrgAdminRole(role)
```

Any new role added to `PROFILE_ROLES` must update:

- DB CHECK on `profiles.role`
- `rolesAssignableOnApprove` matrix
- Admin UI role dropdowns

## 3. Frontend (`apps/web`)

### 3.1 Routes

| Path | Server gate | File |
|------|-------------|------|
| `/pending-approvals` | `status === 'active'` and `isApproverRole`; else `/dashboard` | `apps/web/src/app/(main)/pending-approvals/page.tsx` |
| `/admin/pending` | Active profile + `isApproverRole`; `showApproveAll` via `canManageOrgUsers` | `apps/web/src/app/(main)/admin/pending/page.tsx` |

### 3.2 Data loading

**Files:**

- `apps/web/src/lib/admin/loadPendingApprovals.ts`  pending rows (name, email, departments, registration `role`).
- `apps/web/src/lib/admin/pendingApprovalScope.ts`  pure **`userIdsWithMembershipInDepartments`** (used for manager/coordinator filtering; tested in Jest).
- **Counts / preview:** `getPendingApprovalCount` and `loadPendingApprovalsPreview` in `apps/web/src/lib/dashboard/loadDashboardHome.ts` delegate to **`loadPendingApprovalRows`**, so nav badges and standalone queue stay aligned.

**Note:** Admin **overview** `pendingCount` (`loadAdminOverview`) is **org-wide** pending total for KPIs; only **org admins** see **Admin → Overview** bulk approve. Manager/coordinator counts in the shell use **`getPendingApprovalCount`**.

### 3.3 Client components

| Component | Path | Notes |
|-----------|------|-------|
| `PendingApprovalsClient` | `apps/web/src/components/PendingApprovalsClient.tsx` | Standalone queue; `rolesAssignableOnApprove(viewerRole)`; RPC `approve_pending_profile`. |
| `AdminPendingApprovalsClient` | `apps/web/src/components/admin/AdminPendingApprovalsClient.tsx` | Admin-area variant. |
| `AdminOrgBulkApprove` | `apps/web/src/components/admin/AdminOrgBulkApprove.tsx` | Org-admin bulk; full org pending list + chosen role per member. |

### 3.4 Shell / navigation

**Files:** `apps/web/src/app/(main)/layout.tsx`, `apps/web/src/components/AppShell.tsx`

- **`showStandaloneApprovals`:** approvers who are **not** org admins see **Approvals** in main nav (`/pending-approvals`).
- Org admins use **Admin → Pending**; badge uses **`getPendingApprovalCount`** (same rules as `loadPendingApprovalRows`).

## 4. Verification checklist

- [x] Coordinator cannot assign `org_admin` or `manager` from API (RLS/RPC), not only hidden in UI. _`approve_pending_profile` raises if `v_viewer_role in ('manager','coordinator')` and role in `('org_admin','manager')`. Jest: `rolesAssignableOnApprove.test.ts`._
- [x] Manager sees only pendings in departments they manage; coordinator sees pendings sharing a department. _`can_approve_profile` + `loadPendingApprovalRows` / `userIdsWithMembershipInDepartments`. Jest: `pendingApprovalScope.test.ts`._
- [x] Approving sets `status = 'active'` and persists `role` in one `UPDATE`. _`approve_pending_profile` approve branch._
- [x] `unassigned` registration role is replaced on approve with a value from assignable roles. _RPC requires `p_role` when target role is `unassigned`; default list from `rolesAssignableOnApprove`._

## 5. Automated tests (`npm run test --workspace=@campsite/web`)

- `src/lib/__tests__/pendingApprovalScope.test.ts`  department overlap set logic.
- `src/lib/__tests__/rolesAssignableOnApprove.test.ts`  UI role matrix matches RPC expectations.

## 6. Implementation order (when extending)

1. Update **SQL** approve RPC + RLS tests.
2. Update **`rolesAssignableOnApprove`** and any admin UI labels.
3. Update **web** clients (`PendingApprovalsClient`, admin pending flows) to pass new fields (e.g. department reassignment on approve).
4. Update **this document** and [ROLE-MAPPING.md](../01-core-model-resolution/ROLE-MAPPING.md) if role semantics change.
