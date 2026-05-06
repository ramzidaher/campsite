# HR Module  Full Fix Plan

## Status: Planning
**Date:** 2026-04-09  
**Scope:** Fix all broken connections, permission gaps, missing RPCs, missing UI, and data integrity issues in the HR module.

---

## Overview of Problems Found

1. **Broken DB writes**  `review_cycles` INSERT crashes at DB level (`created_by` is NOT NULL with no default; client never sends it).
2. **Permission misuse**  `performance.view_reports` (a read permission) is used as the write gate in `review_manager_submit` and `review_goal_upsert` RPCs. Anyone with read-only HR view access can write assessments.
3. **No data sync trigger**  `job_applications.offer_letter_status` is never updated when an `application_offers` row is created/status-changed. Column is always stale.
4. **Employees are locked out of their own data**  No `hr.view_own` permission exists; employees cannot see their own job title, contract, or HR record. Only org_admin can.
5. **Managers can't see direct reports' HR data**  No `hr.view_direct_reports` permission or RLS policy. Currently only org_admin has any HR record visibility.
6. **Onboarding template tasks have no edit UI**  The hub links to `?template=id` which re-opens the same hub. No CRUD interface exists for template tasks after creation.
7. **Performance cycle create has no backend RPC**  Client does a raw `supabase.from('review_cycles').insert(...)` without `created_by`, hitting the NOT NULL constraint.
8. **Onboarding template task mutations go through direct table inserts**  No RPC, no audit trail, breaks the consistent security-definer pattern.
9. **`interview_joining_instructions`**  Column exists on `job_applications` but no UI reads or writes it.
10. **Dual route divergence**  `/hr/recruitment` and `/hr/jobs` are standalone pages separate from `/admin/recruitment` and `/admin/jobs`. They will diverge over time.
11. **Explicit DELETE RLS missing**  No tables have `for delete using (false)` policies. Safe but unintentional.
12. **`org_permission_policies` table**  Created in RBAC migration but never implemented anywhere; dead schema.

---

## Phase 1  Critical Bug Fixes (Nothing Works Without These)

### 1.1 Fix `review_cycles` INSERT  `created_by` NOT NULL crash
**Files:**
- `supabase/migrations/` → new migration to add `DEFAULT auth.uid()` to `review_cycles.created_by`
- `apps/web/src/components/admin/hr/performance/PerformanceCyclesClient.tsx` line 65 → pass `created_by` from session OR rely on the new default

**What to do:**
- Add a migration: `ALTER TABLE review_cycles ALTER COLUMN created_by SET DEFAULT auth.uid();`
- Alternatively create a BEFORE INSERT trigger (consistent with other tables)
- Remove the hard crash path in the client

### 1.2 Fix permission misuse in `review_manager_submit` and `review_goal_upsert`
**File:** `supabase/migrations/20260609120000_performance_reviews.sql`

**What to do:**
- In `review_manager_submit`: replace the HR override permission check from `performance.view_reports` → `performance.manage_cycles`
- In `review_goal_upsert`: same  replace `performance.view_reports` → `performance.manage_cycles` for HR admin override; keep `performance.review_direct_reports` for reviewers
- Write a new migration to replace these functions (cannot edit old migration files)

### 1.3 Fix `job_applications.offer_letter_status` sync
**What to do:**
- Write a migration adding a Postgres trigger on `application_offers` AFTER INSERT OR UPDATE that sets `job_applications.offer_letter_status = NEW.status` for the matching `job_application_id`
- This ensures the pipeline board always reflects current offer state without manual sync

---

## Phase 2  RBAC / Permissions Completion

### 2.1 Add `hr.view_own` permission
**What to do:**
- Add `hr.view_own` to `permission_catalog` migration
- Grant it to all roles (employee, manager, coordinator, org_admin, super_admin)
- Add RLS policy on `employee_hr_records`: `for select using (user_id = auth.uid() and org_id = current_org_id())`
- Add RLS policy on `employee_hr_record_events` similarly
- Wire to the `hr_employee_file` RPC: if caller is viewing their own file, allow via `hr.view_own`; if viewing someone else's, require `hr.view_records`

### 2.2 Add `hr.view_direct_reports` permission
**What to do:**
- Add `hr.view_direct_reports` to `permission_catalog`
- Grant it to: manager, coordinator, org_admin
- Add RLS policy on `employee_hr_records`: `for select using (has_permission(..., 'hr.view_direct_reports') and user_id in (select id from profiles where reports_to_user_id = auth.uid() and org_id = current_org_id()))`
- Update `hr_employee_file` RPC to also pass if caller is the direct manager of the target user

### 2.3 Verify permission catalog completeness
**What to do:**
- Audit `defaultPermissions.ts` and `permission_catalog` table entries against every `has_permission()` key used in all RPCs
- Ensure every key checked in an RPC exists in the catalog  missing catalog entries silently return false, denying access with no error
- Keys to verify are present: `hr.view_own`, `hr.view_direct_reports`, all `performance.*`, `onboarding.*`, `leave.*`, `recruitment.*`, `jobs.*`, `applications.*`, `offers.*`, `interviews.*`

### 2.4 Update `adminGates.ts` nav for new permissions
**File:** `apps/web/src/lib/adminGates.ts`

**What to do:**
- Add navigation item for the employee HR self-view page (Phase 4) gated on `hr.view_own`
- Ensure manager-side HR directory link is gated on `hr.view_direct_reports` not just `hr.view_records`

---

## Phase 3  Database Hardening

### 3.1 Add explicit DELETE policies on all HR tables
**What to do:**
- New migration: for each HR table, add `for delete using (false)` RLS policy with a clear name
- Tables: `employee_hr_records`, `employee_hr_record_events`, `leave_requests`, `leave_allowances`, `sickness_absences`, `onboarding_templates`, `onboarding_template_tasks`, `onboarding_runs`, `onboarding_run_tasks`, `review_cycles`, `performance_reviews`, `review_goals`
- This makes the security intent explicit and visible to future developers

### 3.2 Add `auth.uid()` defaults for `created_by` / `updated_by` columns
**What to do:**
- Migration: set `DEFAULT auth.uid()` on `review_cycles.created_by`, `onboarding_templates.created_by`, `recruitment_requests.created_by`  any table where the client is doing a direct insert without passing created_by
- Consistent with the `employee_hr_records` pattern which uses an explicit RPC for this

### 3.3 Add trigger to keep `profiles.role` in sync
**What to do:**
- Verify the existing denormalization trigger (profiles.role ↔ user_org_role_assignments) fires correctly on INSERT and UPDATE
- Check there's a trigger for DELETE (when a role assignment is removed, role should reset)

---

## Phase 4  Missing Backend RPCs

### 4.1 RPC: `onboarding_template_task_upsert`
**What to do:**
- Security definer RPC that creates or updates a task on a template
- Permission gate: `onboarding.manage_templates`
- Validates `template_id` belongs to caller's org
- Sets `org_id` server-side, not from client
- Handles sort_order assignment
- Matches the audit pattern of other HR RPCs

### 4.2 RPC: `onboarding_template_task_delete`
**What to do:**
- Security definer RPC that deletes a task from a template (only if no active runs reference it, or soft-delete)
- Permission gate: `onboarding.manage_templates`

### 4.3 RPC: `review_cycle_create`
**What to do:**
- Security definer RPC replacing the direct `review_cycles` table insert in the client
- Permission gate: `performance.manage_cycles`
- Sets `created_by = auth.uid()` server-side
- Validates dates: `period_start < period_end`, `self_assessment_due <= manager_assessment_due`
- Returns new cycle row

### 4.4 RPC: `interview_joining_instructions_set`
**What to do:**
- Security definer RPC that sets `job_applications.interview_joining_instructions`
- Permission gate: `interviews.manage`
- Takes `p_application_id` and `p_instructions text`

### 4.5 Update `hr_employee_file` RPC for new permission tiers
**What to do:**
- Add self-view path: if `p_user_id = auth.uid()`, check `hr.view_own` instead of `hr.view_records`
- Add manager-view path: if target's `reports_to_user_id = auth.uid()`, check `hr.view_direct_reports`
- Existing org-admin path: check `hr.view_records` (unchanged)

---

## Phase 5  Frontend Connections

### 5.1 Employee HR self-view page
**Route:** `/profile/hr` (or `/my-record`)

**What to do:**
- New RSC page that calls `hr_employee_file(auth.uid())` (the updated RPC that allows self-view)
- Read-only view of: job title, grade, contract type, FTE, work location, employment start date, probation end date, notice period, salary band (if `hr.view_own` grants it  consider filtering salary for self-view)
- Show own leave allowance summary: entitlement, used, TOIL balance, Bradford score
- Add nav item in AppShell for all logged-in users

### 5.2 Onboarding template task editor
**Route:** `/hr/onboarding?template={id}` (existing query param, just needs content)

**What to do:**
- In `OnboardingHubClient.tsx`: when `templateId` query param is present, render a task editor panel
- Tasks list with: title, category, assignee_type, due_offset_days, sort_order
- Add task / edit task / delete task buttons calling the new Phase 4 RPCs
- Reorder via drag or up/down buttons

### 5.3 Performance cycle creation via RPC
**File:** `apps/web/src/components/admin/hr/performance/PerformanceCyclesClient.tsx` line 65

**What to do:**
- Replace `supabase.from('review_cycles').insert(...)` call with `supabase.rpc('review_cycle_create', {...})`
- Update form fields to match RPC signature

### 5.4 Interview joining instructions UI
**File:** `apps/web/src/app/(main)/admin/jobs/[id]/applications/` pipeline view

**What to do:**
- In the application pipeline card (when stage = `interview_scheduled`), show a field to set/view joining instructions
- On save, call `supabase.rpc('interview_joining_instructions_set', {...})`
- Display joining instructions to the candidate via their portal token (`get_candidate_application_portal` already returns the application row  ensure `interview_joining_instructions` is included in the SELECT)

### 5.5 Offer letter status in application pipeline
**File:** Job pipeline component

**What to do:**
- `job_applications.offer_letter_status` is now kept in sync (Phase 1.3)
- Add offer status badge to the application card when `offer_letter_status` is not null
- Values: `sent`, `signed`, `declined`, `superseded`  each with a distinct colour/icon

### 5.6 Manager HR directory
**What to do:**
- Add a manager-facing HR directory page (or section in manager workspace) gated on `hr.view_direct_reports`
- Shows only direct reports: name, job title, contract type, work location, leave balance, Bradford score
- Uses the updated `hr_employee_file` RPC or a new `hr_direct_reports_list` RPC

---

## Phase 6  Routing & Navigation

### 6.1 Consolidate /hr/recruitment and /hr/jobs routes
**What to do:**
- Audit `/apps/web/src/app/(main)/hr/recruitment/page.tsx` and `/hr/jobs/page.tsx`
- Determine if they duplicate `/admin/recruitment` and `/admin/jobs`
- Either convert them to re-exports (same pattern as `/hr/records` → `/admin/hr`) or merge the logic
- Goal: single source of truth per feature, no diverging parallel pages

### 6.2 AppShell navigation audit
**Files:** `apps/web/src/components/AppShell.tsx`, `apps/web/src/lib/adminGates.ts`

**What to do:**
- Ensure every HR nav section item has a corresponding permission check
- Add self-view HR record link for all users (Phase 5.1)
- Ensure the manager workspace nav includes the direct reports HR section (Phase 5.6)
- Verify badge counts (pending leave approvals, pending recruitment requests) render correctly for all role types, not just org_admin

### 6.3 Fix AppShell.tsx and AppTopBar.tsx uncommitted changes
**What to do:**
- Review what changed in these two files (currently modified in git working tree)
- Ensure changes are intentional and coherent with the navigation plan
- Commit or clean up as appropriate

---

## Phase 7  Data Integrity & Cleanup

### 7.1 Remove or implement `org_permission_policies` table
**What to do:**
- Decision: either implement JSON-policy evaluation in `has_permission()` or drop the table
- If dropping: migration to `drop table if exists org_permission_policies`
- If keeping: document the intended use

### 7.2 Audit all server actions for org_id scoping
**What to do:**
- Every server action that does a Supabase mutation must derive `org_id` from the server session, not from the client body
- Audit: `recruitment/actions.ts`, `jobs/actions.ts`, `applications/actions.ts`, `interviews/actions.ts`, `application-offers/actions.ts`, `offer-templates/actions.ts`
- Fix any that read `org_id` from request body (client-controlled = unsafe)

### 7.3 Rate limit `submit_job_application` RPC
**What to do:**
- Add Postgres-level rate limiting or move to an edge function with IP-based rate limiting
- Currently anon-callable with no throttle  vulnerable to spam/flood

### 7.4 Verify all `created_by` / `updated_by` columns populate correctly end-to-end
**What to do:**
- For each HR table with these columns, insert a test record via the app and confirm the column is populated
- Catch any remaining gaps missed by the migration fixes in Phase 3.2

---

## Execution Order (Dependencies)

```
Phase 1 (bugs)     → must go first, unblocks Phase 4/5
Phase 2 (RBAC)     → can run in parallel with Phase 3
Phase 3 (DB hard.) → can run in parallel with Phase 2
Phase 4 (RPCs)     → requires Phase 2+3 to be landed first
Phase 5 (Frontend) → requires Phase 4 RPCs to exist
Phase 6 (Routing)  → can start any time, no dependencies
Phase 7 (Cleanup)  → run last, after all features stable
```

---

## Files That Will Change (High-Level)

| Area | Files |
|------|-------|
| DB Migrations | New migration files in `supabase/migrations/` for Phases 1, 2, 3, 4 |
| RPCs (replaced) | `review_manager_submit`, `review_goal_upsert`, `hr_employee_file` |
| RPCs (new) | `onboarding_template_task_upsert`, `onboarding_template_task_delete`, `review_cycle_create`, `interview_joining_instructions_set` |
| Permission catalog | `defaultPermissions.ts`, HR permission grants migration |
| Admin UI | `PerformanceCyclesClient.tsx`, `OnboardingHubClient.tsx`, job pipeline component |
| New pages | `/profile/hr` employee self-view page |
| Shell/Nav | `AppShell.tsx`, `AppTopBar.tsx`, `adminGates.ts` |
| Route consolidation | `/hr/recruitment/page.tsx`, `/hr/jobs/page.tsx` |
| Server actions | All HR server actions (org_id audit) |
