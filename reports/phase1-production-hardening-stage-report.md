# Phase 1 Stage Report — Production Hardening
**Date:** 2026-04-30
**Follow-up to:** `reports/phase1-cache-invalidation-stage-report.md`
**Status:** SUBSTANTIALLY COMPLETE — production hardening shipped; remaining gaps are narrow and mostly outside the shared Redis cache surfaces

**Current follow-up:** founder/back-office and org-settings closure work is tracked in `reports/phase1-code-closure-stage-report.md`

---

## What Was Verified First

- The public cache invalidation route was too permissive:
  - any active profile could call it
  - `shell_user_ids` were only UUID-validated, not org-validated
  - broad org invalidations could be triggered without scope-specific permission checks

- Role-definition writes were still clearing **all** shell caches globally, even though the change only affected one org.

- The remaining confirmed shared-cache misses were not evenly spread across HR:
  - **confirmed**: leave / attendance writes
  - **confirmed**: self-profile updates that change directory/shell-facing data
  - **confirmed**: core HR record editor saves
  - **confirmed**: department mutations were still using a too-broad member/admin invalidation shape

- I re-grepped the Redis-backed cache loaders (`src/lib/hr`, `src/lib/jobs`, `src/lib/interviews`, `src/lib/recruitment`, `src/lib/supabase`) for:
  - `employee_hr_documents`
  - `employee_medical_notes`
  - `employee_training_records`
  - `employee_employment_history`
  - `employee_dependants`
  - `hr_custom_field_values`

  No matches were found in the shared cache loaders. That means those writes are **not currently proven** shared-cache correctness gaps, even if they may still deserve a separate UX consistency audit.

---

## What Changed

### 1. `POST /api/cache/invalidate` is now permissioned and scoped

`apps/web/src/app/api/cache/invalidate/route.ts`

- Added scope-specific permission checks instead of allowing any active org member.
- Added org validation for `shell_user_ids` using service-role lookup.
- Added a self-only guard for `profile-self`.
- Added narrower scopes so client code can invalidate only the surface it actually changed:
  - `departments`
  - `leave-attendance`
  - `attendance-self`
  - `hr-records`
  - `profile-self`

Existing scopes remain supported:

- `org-members`
- `jobs`
- `applications`
- `recruitment`
- `interviews`
- `onboarding`
- `performance`

### 2. Shared invalidation map got new precise helpers

`apps/web/src/lib/cache/cacheInvalidation.ts`

Added:

- `invalidateDepartmentRelatedCachesForOrg(...)`
- `invalidateLeaveAttendanceCachesForOrg(...)`
- `invalidateProfileSurfaceForOrg(...)`
- `invalidateShellCachesForOrg(...)`

`invalidateShellCachesForOrg(...)` uses service-role profile lookup to invalidate shell bundles only for users in the affected org. If that lookup fails, it falls back to the old full flush as a safe fallback.

### 3. Role-definition writes no longer flush every tenant’s shell cache

Updated:

- `apps/web/src/app/api/admin/roles/route.ts`
- `apps/web/src/app/api/admin/roles/[roleId]/route.ts`
- `apps/web/src/app/api/admin/custom-roles/route.ts`
- `apps/web/src/app/api/admin/custom-roles/[roleId]/route.ts`

These now call `invalidateShellCachesForOrg(me.org_id)` instead of `invalidateAllShellCaches()`.

### 4. Department editor now uses a dedicated invalidation scope

`apps/web/src/components/admin/AdminDepartmentsClient.tsx`

Instead of sending a broad multi-scope member/admin invalidation payload, department writes now use:

- `scopes: ['departments']`

That scope maps to the actual shared-cache surfaces department changes affect:

- HR directory
- org chart
- jobs listings
- admin applications
- recruitment queue

### 5. Leave and attendance writes now invalidate shared HR aggregates

Updated:

- `apps/web/src/components/leave/LeaveHubClient.tsx`
- `apps/web/src/components/admin/OrgLeaveAdminClient.tsx`
- `apps/web/src/components/attendance/TimesheetReviewClient.tsx`
- `apps/web/src/components/attendance/AttendanceClockClient.tsx`

Coverage added for:

- leave submit / edit / cancel / approval decisions
- sickness create / void
- TOIL / carryover / encashment request flows
- leave allowance + leave settings admin changes
- holiday period create / enable / delete
- weekly timesheet manager decisions
- self clock in/out
- self weekly timesheet submit
- manager proxy clock events

These now invalidate the shared cached HR surfaces affected by attendance/leave aggregation:

- `campsite:hr:dashboard`
- `campsite:hr:directory`
- `campsite:hr:overview`

### 6. Self-profile writes now invalidate shell + shared directory surfaces

Updated:

- `apps/web/src/components/ProfileSettings.tsx`
- `apps/web/src/components/profile/PersonalDetailsCard.tsx`
- `apps/web/src/components/AppShell.tsx`

Coverage added for:

- profile photo updates
- profile save
- self deactivation
- personal details edits
- UI mode toggle

These now invalidate:

- shell bundle for the current user
- shared HR directory/org chart/overview surfaces that can display updated profile-facing data

### 7. Core HR record editor saves now invalidate shared profile surfaces

Updated:

- `apps/web/src/components/admin/hr/EmployeeHRFileClient.tsx`

Coverage added for:

- `employee_hr_record_upsert`
- `employee_probation_check_set`

These now invalidate the directory-facing shared caches instead of relying on `router.refresh()` alone.

---

## Verification

- `cd apps/web && npx tsc --noEmit`
- Result: **passes clean**

---

## Remaining Phase 1 Gaps

### Still real

- **Production validation has not been rerun after this hardening pass**
  - Upstash hit-rate / key activity check
  - shell timeout / degraded-shell monitoring
  - prod route-thrash repro

- **Founder back-office org membership mutations are still outside this pass**
  - `apps/web/src/app/(founders)/founders/platform-actions.ts`
  - those service-role org membership/profile writes can still leave end-user caches stale until TTL/manual refresh
  - this is operationally relevant, but it is not part of the main tenant runtime flows patched here

### Reclassified after verification

- The following areas are **not currently proven shared Redis cache misses** based on direct grep against the cache loaders:
  - HR documents
  - medical notes
  - training records
  - employment history
  - dependants
  - custom HR field values

They may still need a separate consistency audit, but they should not be described as active Phase 1 shared-cache correctness gaps without more evidence.

---

## Files Changed In This Hardening Stage

```
apps/web/src/app/api/cache/invalidate/route.ts
apps/web/src/lib/cache/cacheInvalidation.ts
apps/web/src/lib/cache/clientInvalidate.ts
apps/web/src/app/api/admin/roles/route.ts
apps/web/src/app/api/admin/roles/[roleId]/route.ts
apps/web/src/app/api/admin/custom-roles/route.ts
apps/web/src/app/api/admin/custom-roles/[roleId]/route.ts
apps/web/src/components/admin/AdminDepartmentsClient.tsx
apps/web/src/components/leave/LeaveHubClient.tsx
apps/web/src/components/admin/OrgLeaveAdminClient.tsx
apps/web/src/components/attendance/TimesheetReviewClient.tsx
apps/web/src/components/attendance/AttendanceClockClient.tsx
apps/web/src/components/ProfileSettings.tsx
apps/web/src/components/profile/PersonalDetailsCard.tsx
apps/web/src/components/AppShell.tsx
apps/web/src/components/admin/hr/EmployeeHRFileClient.tsx
```

---

## Recommended Next Step

Do not start Phase 2 yet.

Run a short production validation pass first:

1. verify Redis key activity / hit behaviour in Upstash
2. watch for fresh degraded shell events
3. run the prod route-thrash repro against the deployed app
4. only then decide whether remaining work is:
   - Phase 1 founder/back-office cleanup
   - or Phase 2 read-replica / materialized-view work
