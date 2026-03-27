# 06 — Rota (shifts) and admin rota

## 1. Product intent

- **Staff rota (`/rota`):** Members view **their shifts** and, depending on role, **team** or **full org** schedules.
- **Admin rota (`/admin/rota`):** Org-wide management UI for coverage and links to import — **only org admins** reach this route via `admin/layout.tsx`.
- **Sheets import (`/admin/rota-import`):** Google Sheets–based import wizard + history — **guaranteed org-admin-only** via parent layout; page loads `org_id` only.

## 2. Backend (Supabase)

### 2.1 Core tables

**Base:** `supabase/migrations/20250327000001_phase3_rota_calendar.sql`

| Table | Notes |
|-------|--------|
| **`rota_shifts`** | Primary shift storage (`org_id`, `dept_id`, `user_id`, times, `role_label`, `notes`, `source`, …) — **all web queries use this name** |
| `departments` | Display names |
| `profiles` | Assignee display |
| `sheets_column_mappings` | Google Sheets column mapping (admin import) |
| Later tables | Grep `rota_sync`, `import` in `supabase/migrations/` for additions |

### 2.2 RLS policies (current chain)

**`rota_shifts`** (v2 roles in `20260329120000_v2_profile_roles.sql`, **`super_admin` aligned in `20260406180000_calendar_rota_super_admin_alignment.sql`**):

| Policy | Intent |
|--------|--------|
| **`rota_shifts_select`** | Same org; row visible if **`user_id = auth.uid()`** OR viewer is **`org_admin` / `super_admin`** OR viewer **`dept_managers`** for row’s **`dept_id`**. |
| **`rota_shifts_insert` / `update` / `delete`** | **`can_manage_rota_for_dept(dept_id)`** for dept rows; org-wide **`dept_id is null`** branch allows **`org_admin` / `super_admin`**. |

**`can_manage_rota_for_dept`:** **`org_admin`** or **`super_admin`** for any dept in org; **`manager`** if listed in **`dept_managers`** for that dept.

### 2.3 Client query entry points

- `apps/web/src/components/rota/RotaClient.tsx` — `.from('rota_shifts')`
- `apps/web/src/lib/admin/loadAdminRota.ts` — dashboard aggregates from `rota_shifts`
- `apps/web/src/lib/dashboard/loadDashboardHome.ts` — upcoming shift snippets
- Grep each file for `.rpc(` if RPCs are added

### 2.4 Google Sheets

- OAuth and column mapping stored per org; see `SheetsImportWizard` and related migrations.

## 3. Frontend — staff (`apps/web`)

### 3.1 Route

**File:** `apps/web/src/app/(main)/rota/page.tsx`

- Server: `getUser()`, load `profiles` with `status`, redirect pending users to `/pending`.

### 3.2 Client

**File:** `apps/web/src/components/rota/RotaClient.tsx`

- **`canViewRotaDepartmentScope`**, **`canViewRotaFullOrgGrid`**, **`canEditRotaShifts`** from `@campsite/types` (replacing ad hoc role checks).
- **View modes:** `my` (always), `team` if department scope, `full` if org admin.
- **Query shaping:** `my` → `user_id`; `team` + **manager** → `dept_id in managed`; `team` + **org admin** or **`full`** → no extra filter (RLS limits rows).
- Fetches joins to `departments` and assignee `profiles` in memory after load.

**When extending:**

- Any new **full-org** view must remain **org-admin-only** in UI (`canViewRotaFullOrgGrid`); RLS remains the backstop.

## 4. Shared types

**File:** `packages/types/src/rota.ts`

| Helper | Purpose |
|--------|---------|
| `canViewRotaDepartmentScope(role)` | Manager or `isOrgAdminRole` — Department tab. |
| `canViewRotaFullOrgGrid(role)` | `isOrgAdminRole` only — Full rota tab. |
| `canEditRotaShifts(role)` | Manager or org admin — matches typical mutation RLS. |

## 5. Frontend — admin (`apps/web`)

### 5.1 Layout gate

**File:** `apps/web/src/app/(main)/admin/layout.tsx`

- `canAccessOrgAdminArea(profile.role)` → non–org-admin redirected to `/broadcasts`.

### 5.2 Admin rota page

**File:** `apps/web/src/app/(main)/admin/rota/page.tsx`

- Loads `loadAdminRotaDashboard(supabase, orgId)`.
- Renders **`AdminRotaView`** — org-admin-only copy (managers use `/manager` + `/rota`).

### 5.3 Sheets import

**File:** `apps/web/src/app/(main)/admin/rota-import/page.tsx`

- Minimal profile select: `org_id` only; **no duplicate** `isOrgAdminRole` check (layout enforces).
- Renders `SheetsImportWizard`, `RotaSyncHistory`.

### 5.4 Cross-links

- `AdminRotaView` links to `/admin/rota-import` and `/rota`.
- `AppTopBar` title map includes `/admin/rota-import` — update if route renames.

## 6. Manager workspace cross-links

**File:** `apps/web/src/app/(main)/manager/layout.tsx`

- Sidebar link **Department rota** → `/rota` (not `/admin/rota`).

## 7. Verification checklist

- [x] Manager sees shifts consistent with **`dept_managers`** + own rows — **RLS** `rota_shifts_select`; client **team** view filters by managed `dept_id`.
- [x] Non–org-admin cannot enable **Full rota** tab — **`canViewRotaFullOrgGrid`**; coordinators/CSAs never get the control.
- [x] Import wizard: **`admin/layout`** org-admin gate; writes to mappings / import tables use org-scoped RLS — URL guessing without org admin session fails at layout.
- [x] Shift create respects **`org_id`** / **`dept_id`** — client sends profile org; FKs enforced by DB.

## 8. Automated tests (`npm run test --workspace=@campsite/web`)

- `src/lib/__tests__/rotaTypes.test.ts` — rota tab / edit helpers.

## 9. Implementation order (new rota rule)

1. SQL: RLS on **`rota_shifts`** (and related tables); `npm run supabase:db:push`.
2. `packages/types/src/rota.ts` helpers + `RotaClient` / `loadAdminRota` queries.
3. UI labels for coverage stats.
4. Update this document with exact policies.
