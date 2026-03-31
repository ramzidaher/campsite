# 06 — Rota (shifts) and admin rota

## 1. Product intent

- **Staff rota (`/rota`):** Members view **their shifts** and, depending on role, **team** or **full org** schedules. **Rotas** (named schedules with `kind`: shift / activity / reception / other) group shifts via `rota_shifts.rota_id`. **Swap / change requests** use RPCs; **final approval** is org-wide for **`manager`**, **`duty_manager`**, and **`org_admin`** (see `can_final_approve_rota_request`).
- **Admin rota (`/admin/rota`):** Org-wide management UI for coverage and links to import — **only org admins** reach this route via `admin/layout.tsx`.
- **Sheets import (`/admin/rota-import`):** Google Sheets–based import wizard + history — **guaranteed org-admin-only** via parent layout; page loads `org_id` only. Not part of rota v1 product iteration.

**Product spec:** [docs/rota-feature-spec.md](../../rota-feature-spec.md)

## 2. Backend (Supabase)

### 2.1 Core tables

**Base shifts:** `supabase/migrations/20250327000001_phase3_rota_calendar.sql`

**Rota v1 extensions:**

| Migration | Notes |
|-----------|--------|
| `20260430330000_rota_definitions_members_rls.sql` | `rotas`, `rota_members`, `rota_shifts.rota_id`, RLS, `can_manage_rota_assignments`, `rota_transfer_owner`, `rota_claim_open_shift` |
| `20260430331000_rota_change_requests.sql` | `rota_change_requests`; RPCs: submit swap/change, peer accept, final approve/reject, cancel (mutations RPC-only) |
| `20260430332000_rota_notification_jobs.sql` | `rota_notification_jobs` + triggers on `rota_shifts` / `rota_change_requests` |
| `20260430340000_rota_notification_recipient_user_ids.sql` | **`rota_notification_recipient_user_ids(p_job_id)`** — **`service_role` only**; fan-out rules per `event_type` |
| `20260430333000_pending_approvals_rota_count.sql` | `pending_approvals_nav_count()` includes `pending_final` rota requests for approvers |
| `20260430350000_phase3_org_timezone_sheets_target_rota.sql` | **`organisations.timezone`**; **`sheets_mappings.target_rota_id`** (+ org validation trigger); **`rota_sheets_sync_log.target_rota_id`** |
| `20260430360000_rota_shifts_sheets_import_key.sql` | **`rota_shifts.sheets_import_key`** + partial unique **`(org_id, sheets_import_key)`** for Sheets upserts |
| `20260430351000_phase3_rotas_draft_rls_notifications.sql` | **`rotas.status`** `draft` \| `published`, **`published_at`**; RLS for draft visibility; **`rota_enqueue_notification_fn`** skips jobs for draft rotas |
| `20260430352000_phase3_shift_reminders.sql` | **`shift_reminder`** job type; **`rota_shift_reminder_sent`** dedupe; **`enqueue_rota_shift_reminders()`** (`service_role`) |
| `20260430353000_phase3_rota_notification_recipients_shift_reminder.sql` | Recipient RPC handles **`shift_reminder`** (assignee only) |

| Table | Notes |
|-------|--------|
| **`rotas`** | `org_id`, optional `dept_id` / `department_team_id`, `kind`, `title`, `owner_id`, **`status`** (`draft` \| `published`), **`published_at`** |
| **`rota_members`** | Invited participants `(rota_id, user_id)` — managed by same pool as rota assignments |
| **`rota_shifts`** | **`rota_id`** nullable: `NULL` = **legacy** row (original `can_manage_rota_for_dept` insert/update/delete rules); set = **rota-scoped** mutations via `can_manage_rota_assignments(rota_id)` |
| **`rota_change_requests`** | `request_type` `swap` \| `change`; `status` `pending_peer` \| `pending_final` \| `approved` \| `rejected` \| `cancelled` |
| **`rota_notification_jobs`** | Outbound notification queue; `authenticated` denied; workers use **service role** |

### 2.2 RLS summary

**`rotas`**

- **Select:** active org member; **`published`** rotas are visible to all; **`draft`** rotas only if **`can_manage_rota_assignments(id)`** (editors).
- **Insert:** `owner_id = auth.uid()` and caller is **`org_admin` / `super_admin`**, **`coordinator`**, or **`manager`** with **`dept_id`** set and `can_manage_rota_for_dept(dept_id)`.
- **Update / delete:** `can_manage_rota_assignments(id)` — **`org_admin`**, **`coordinator`**, **rota owner**, or **`manager`** when `rotas.dept_id` is set and `can_manage_rota_for_dept` holds.

**`rota_members`**

- **Select:** same org; parent rota must be **published** or viewer **`can_manage_rota_assignments`** on that rota.
- **Mutate:** `can_manage_rota_assignments` for parent rota; target `user_id` must be active in org.

**`rota_shifts`** (replaced policies)

- **Select:** active org member; **legacy** (`rota_id` null): unchanged. **Rota** (`rota_id` set): parent rota must be **published** or viewer **`can_manage_rota_assignments`**; then self, **open slots**, org admins/coordinators, rota **owner**, **`rota_members`**, or matching `dept_managers`.
- **Insert / update / delete:** legacy branch unchanged for `rota_id` null; with `rota_id` set → `can_manage_rota_assignments(rota_id)`.

**`duty_manager`**, **`csa`**, **`administrator`**, **`society_leader`:** no rota definition or shift **mutations** via RLS (except **`duty_manager`** may **final-approve** requests via RPC).

**`rota_change_requests`**

- **Select:** requester, counterparty, final approvers (`can_final_approve_rota_request`), or org admins/coordinators.
- **Insert / update:** none for `authenticated` — use RPCs only.

### 2.3 RPCs (authenticated)

| RPC | Purpose |
|-----|---------|
| `rota_transfer_owner(p_rota_id, p_new_owner_id)` | **Org admin** only |
| `rota_claim_open_shift(p_shift_id)` | Active member claims `user_id IS NULL` shift |
| `rota_change_request_submit_swap(primary, counterparty shift)` | Requester must hold primary shift |
| `rota_change_request_submit_change(shift_id, note)` | → `pending_final` (unassign on approve) |
| `rota_change_request_peer_accept` | Counterparty on swap |
| `rota_change_request_final_approve` / `_final_reject` | Manager / duty_manager / org_admin |
| `rota_change_request_cancel` | Requester |

### 2.4 Rota notification delivery (RPC + Edge)

- **`public.rota_notification_recipient_user_ids(p_job_id uuid)`** — returns `user_id` rows for the job’s `event_type` (shift assignee + rota owner + `rota_members` for shift events; **assignee only** for **`shift_reminder`**; requester/counterparty/approvers for request lifecycle). **`GRANT EXECUTE` to `service_role` only** (not `authenticated`).
- **`public.enqueue_rota_shift_reminders()`** — **`service_role` only**; finds upcoming **`rota_shifts`** per assignee **`profiles.shift_reminder_before_minutes`**, inserts dedupe rows into **`rota_shift_reminder_sent`**, enqueues **`shift_reminder`** jobs. Invoked at the start of each **`process-rota-notifications`** run (so one schedule covers enqueue + send).
- **`supabase/functions/process-rota-notifications`** — `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`; calls **`enqueue_rota_shift_reminders`**; then selects pending jobs (`processed_at IS NULL`, `attempts < 5`), calls the RPC, loads **`push_tokens`**, sends via **Expo** (optional **`EXPO_ACCESS_TOKEN`**). Sets **`processed_at`** after success or empty send; increments **`attempts`** / **`last_error`** on failure.
- **Deploy:** `npm run supabase:functions:deploy:rota-notify` (see root `package.json`).
- **Scheduling:** invoke the function on an interval (e.g. every 1–5 minutes) via **Supabase Scheduled Functions**, **Dashboard cron**, or external cron `POST` to the function URL with the service-role Bearer. Not wired in-repo; align with [12-push-and-notification-jobs.md](./12-push-and-notification-jobs.md).
- **Config:** `[functions.process-rota-notifications]` `verify_jwt = false` in `supabase/config.toml`.

### 2.5 Client query entry points

- `apps/web/src/components/rota/RotaClient.tsx` — `rota_shifts`, `rotas` (incl. **draft/publish** in setup), **`RotaMembersPanel`**, shift CRUD + overlap, **`org_timezone`** from **`organisations`** for time display
- `apps/web/src/app/(main)/rota/page.tsx` — loads **`organisations.timezone`** for `RotaClient`
- `apps/web/src/components/rota/RotaMembersPanel.tsx` — members CRUD for a selected rota
- `apps/web/src/components/rota/RotaRequestsPanel.tsx` — change requests + RPCs
- `apps/web/src/lib/admin/loadAdminRota.ts` — admin dashboard aggregates
- `apps/web/src/lib/dashboard/loadDashboardHome.ts` — shifts + `pending_approvals_nav_count`
- `apps/web/src/components/calendar/CalendarClient.tsx` — shifts + `rotas` join; org TZ for shift detail times
- `apps/web/src/app/(main)/admin/settings/page.tsx` + **`OrgSettingsClient`** — org admin sets **`organisations.timezone`**
- `apps/mobile/app/(tabs)/rota.tsx` — my / team shifts, org TZ query, **overlap** badge, swap/change requests, claim, approvals

### 2.6 Google Sheets

- **`POST /api/admin/rota-sheets-import`** (session user must be **org admin**): loads the org’s **`sheets_mappings`** row and the caller’s **`google_connections`** row (`type = 'sheets'`, `connection_id`); refreshes OAuth if needed; reads **`organisations.timezone`** and maps sheet date/time through **`date-fns-tz`** (`fromZonedTime`); upserts **`rota_shifts`** with **`source = 'sheets_import'`**, **`rota_id`** from **`target_rota_id`**, stable **`sheets_import_key`** = `spreadsheetId:encodedTab:sheetRowNumber`; writes **`rota_sheets_sync_log`** (`rows_imported`, optional **`error_message`** summary).
- **Column contract (letters):** name, date, start time, end time; optional dept and role. **Name** cell **`open`** / **`—`** / empty-skip patterns → **`user_id` null**. Dept text matched to **`departments.name`** in-org; name matched to **`profiles.full_name`** or **`email`** (active).
- **`SheetsImportWizard`** stores **`spreadsheet_id`** / URL on the user’s Sheets **`google_connections`**, saves **`connection_id`** + column letters + tab + **`header_row`** on **`sheets_mappings`**, and **Import now** calls the route above.

## 3. Frontend — staff (`apps/web`)

### 3.1 Route

**File:** `apps/web/src/app/(main)/rota/page.tsx`

- Server: `getUser()`, load `profiles` with `status`, redirect pending users to `/pending`.

### 3.2 Client

**File:** `apps/web/src/components/rota/RotaClient.tsx`

- **`canViewRotaDepartmentScope`**, **`canViewRotaFullOrgGrid`**, **`canEditRotaShifts`**, **`canCreateRota`**, **`canTransferRotaOwnership`** from `@campsite/types`.
- **View modes:** `my` (always), `team` if department scope (managers, coordinators, org admins), `full` if org admin.
- **Query shaping:** `my` → `user_id`; `team` + **manager** → `dept_id in managed`; `team` + **coordinator** / **org admin** → no extra filter (RLS limits rows).
- **Coordinators** must link new shifts to a **rota** (`rota_id` required in UI).
- **Open slots:** **Claim** button → `rota_claim_open_shift`.
- **`RotaRequestsPanel`:** swap / unassign requests and approvals.
- **`RotaMembersPanel`:** when the user can edit rotas, manage **`rota_members`** for the selected rota.
- **Shift editor:** add/edit/delete rota-scoped shifts; **overlap** badge when the same assignee has intersecting shifts; managers/coordinators/org_admin/owner may edit past shifts (see product spec §5).
- **Rota setup:** create rotas as **draft** or **published**; list to toggle **`rotas.status`** (draft hides roster from staff; no shift push until published).

**When extending:**

- Any new **full-org** view must remain **org-admin-only** in UI (`canViewRotaFullOrgGrid`); RLS remains the backstop.

## 4. Shared types

**File:** `packages/types/src/rota.ts`

| Helper | Purpose |
|--------|---------|
| `canViewRotaDepartmentScope` | Manager, coordinator, or org admin — Department tab. |
| `canViewRotaFullOrgGrid` | Org admin only — Full rota tab. |
| `canEditRotaShifts` | Manager, coordinator, or org admin — shift / rota management entry (owner-specific rules in RLS). |
| `canCreateRota` | Same as `canEditRotaShifts` for UI gates. |
| `canFinalApproveRotaRequests` | Manager, duty_manager, or org admin. |
| `canTransferRotaOwnership` | Org admin (matches RPC). |

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
- **`SheetsImportWizard`:** OAuth link → paste sheet URL (writes **`google_connections.spreadsheet_id`** / **`sheets_url`**) → map columns + target rota → **Import now** → **`POST /api/admin/rota-sheets-import`**.

### 5.4 Cross-links

- `AdminRotaView` links to `/admin/rota-import` and `/rota`.
- `AppTopBar` title map includes `/admin/rota-import` — update if route renames.

## 6. Manager workspace cross-links

**File:** `apps/web/src/app/(main)/manager/layout.tsx`

- Sidebar link **Department rota** → `/rota` (not `/admin/rota`).

## 7. Verification checklist

- [x] Manager sees shifts consistent with **`dept_managers`** + own rows — **RLS** `rota_shifts_select`; client **team** view filters by managed `dept_id`.
- [x] Coordinators get **Department** tab and can manage rotas/shifts per RLS (`can_manage_rota_assignments` / coordinator insert on `rotas`).
- [x] Non–org-admin cannot enable **Full rota** tab — **`canViewRotaFullOrgGrid`**.
- [x] Import wizard: **`admin/layout`** org-admin gate; writes to mappings / import tables use org-scoped RLS — URL guessing without org admin session fails at layout.
- [x] Shift create respects **`org_id`** / **`dept_id`** / optional **`rota_id`** — client sends profile org; FKs enforced by DB.
- [x] Swap / change flows and **`pending_approvals_nav_count`** include rota approvals for managers / duty managers / org admins.
- [x] Rota push pipeline: **`rota_notification_recipient_user_ids`** + **`process-rota-notifications`** (Expo); schedule worker in hosting/cron.
- [x] Web: **`rota_members`** UI + shift edit/delete + overlap warning when applicable.
- [x] Mobile: submit **swap** and **change** requests (RPC parity with web).
- [x] Phase 3: **draft/publish** rotas, **org timezone** display, **Sheets target rota** on mappings/sync log, **shift reminders** (profile minutes + enqueue + push).

## 8. Automated tests (`npm run test --workspace=@campsite/web`)

- `src/lib/__tests__/rotaTypes.test.ts` — rota tab / edit / approval helpers.

## 9. Implementation order (reference)

1. SQL: migrations under `supabase/migrations/2026043033*.sql`; `npm run supabase:db:push`.
2. `packages/types/src/rota.ts` helpers + `RotaClient` / `RotaRequestsPanel` / mobile `rota.tsx`.
3. Notification queue + `rota_notification_recipient_user_ids` + `process-rota-notifications` Edge delivery + cron/schedule.
4. Keep this document aligned when policies or RPCs change.
