# Phase 1 Stage Report — Cache Invalidation Coverage
**Date:** 2026-04-30
**Follow-up to:** `reports/phase1-redis-cache-stage-report.md`
**Status:** PARTIALLY COMPLETE — core invalidation layer added and wired into major write paths; some domains still TTL-only

---

## What Was Verified First

- The original Redis rollout left one real correctness gap: `invalidateSharedCache()` only deleted Redis and did **not** clear the in-process L1 `Map`, so the same warm instance could still serve stale data after a write.
- Several high-impact write paths already run on the server (`jobs`, `recruitment`, `interviews`, role/member admin APIs), which makes them good candidates for immediate invalidation coverage.
- Several other writes happen directly in client components (`onboarding`, `performance`, department management, pending approvals, some member status updates), so `router.refresh()` alone was **not** enough once Redis was introduced.

---

## What Changed

### 1. Foundation: exact + prefix invalidation now clears L1 and Redis

`apps/web/src/lib/cache/sharedCache.ts`

- Added a shared cache registry so every Redis-backed cache can be invalidated locally as well as remotely.
- Added `registerSharedCacheStore(...)` and registered all migrated `getCached*.ts` stores.
- Added `invalidateSharedCacheByPrefix(...)` for org-scoped key families like:
  - HR directory viewer caches
  - onboarding template-task caches
- Added raw Redis helpers:
  - `deleteRedisKey(...)`
  - `deleteRedisKeysByPrefix(...)`

This fixed the prior bug where invalidation only removed Redis and left warm instance memory stale.

### 2. Shell cache invalidation added

`apps/web/src/lib/supabase/cachedMainShellLayoutBundle.ts`

- Added `invalidateCachedMainShellLayoutBundle(userId)`
- Added `invalidateAllCachedMainShellLayoutBundles()`

This gives us exact invalidation for a changed member and a rare full flush for role-definition changes.

### 3. Central invalidation map added

`apps/web/src/lib/cache/cacheInvalidation.ts`

Added explicit, verified invalidators for:

- HR dashboard
- HR directory
- HR overview
- org chart
- performance cycles
- onboarding shared + template-task caches
- jobs listings
- admin applications
- recruitment queue
- interview schedule
- shell cache per user / all users

Also added grouped helpers:

- `invalidateOrgMemberCachesForOrg(...)`
- `invalidateJobRelatedCachesForOrg(...)`
- `invalidateRecruitmentRelatedCachesForOrg(...)`
- `invalidateInterviewRelatedCachesForOrg(...)`

### 4. Client-side invalidation bridge added

`apps/web/src/lib/cache/clientInvalidate.ts`
`apps/web/src/app/api/cache/invalidate/route.ts`

This route lets browser-side Supabase mutations explicitly invalidate server caches after success.

Current supported scopes:

- `org-members`
- `jobs`
- `applications`
- `recruitment`
- `interviews`
- `onboarding`
- `performance`

---

## Coverage Added

### Server-side write paths now invalidating caches

- `app/(main)/admin/jobs/actions.ts`
  - create draft listing
  - update listing
  - publish
  - archive
  - unarchive

- `app/(main)/admin/recruitment/actions.ts`
  - request status changes

- `app/(main)/manager/recruitment/actions.ts`
  - create recruitment request

- `app/(main)/admin/interviews/actions.ts`
  - reassign booking
  - create slot
  - bulk create slots
  - complete slot
  - cancel available slot
  - book interview for application

- `app/(main)/admin/jobs/[id]/applications/actions.ts`
  - application stage changes
  - interview joining instruction changes

- `app/(public)/jobs/[slug]/apply/actions.ts`
  - public application submit

- `app/(public)/jobs/offer-sign/actions.ts`
  - signed offer updates onboarding readiness cache

- `app/api/admin/members/update-departments/route.ts`
- `app/api/admin/members/update-reports-to/route.ts`
- `app/api/admin/members/assign-role/route.ts`
- `app/api/admin/members/delete/route.ts`
- `app/api/admin/invite-member/route.ts`
- `app/api/admin/roles/route.ts`
- `app/api/admin/roles/[roleId]/route.ts`
- `app/api/admin/custom-roles/route.ts`
- `app/api/admin/custom-roles/[roleId]/route.ts`

### Client-side write paths now invalidating caches

- `components/admin/AdminUsersClient.tsx`
  - bulk approve
  - bulk deactivate
  - direct status change
  - remove member from org

- `components/admin/AdminDepartmentsClient.tsx`
  - department create/edit/merge
  - manager/member/team/category/broadcast-permission changes

- `components/admin/AdminPendingApprovalsClient.tsx`
- `components/admin/AdminOrgBulkApprove.tsx`
- `components/PendingApprovalsClient.tsx`
  - pending-approval approve / reject / bulk-approve flows

- `components/admin/hr/onboarding/OnboardingHubClient.tsx`
  - template create
  - task upsert/delete/reorder
  - readiness/start-confirm flows

- `components/admin/hr/performance/PerformanceCyclesClient.tsx`
  - create cycle

- `components/admin/hr/performance/PerformanceCycleDetailClient.tsx`
  - activate
  - close
  - enroll members

---

## Verification

- `cd apps/web && npx tsc --noEmit`
- Result: **passes clean**

---

## Remaining Gaps

Phase 1 invalidation is **much better covered now**, but it is **not fully exhaustive yet**.

Still observed as TTL-only after successful writes:

- Leave / absence mutations that can affect HR dashboard and overview:
  - `components/leave/LeaveHubClient.tsx`

- HR documents / medical notes / training records:
  - `components/admin/hr/EmployeeHRFileClient.tsx`
  - `components/profile/EmployeeSelfDocumentsClient.tsx`
  - `app/api/hr/medical-notes/route.ts`
  - `app/api/hr/training-records/route.ts`
  - related delete/update routes

- Some self-service profile mutations:
  - `components/ProfileSettings.tsx`

- Any other direct client writes that update org-wide HR data but do not yet call `/api/cache/invalidate`

These paths will still converge correctly by TTL expiry, but they do not yet get immediate cross-instance invalidation.

---

## Honest Phase 1 Status After This Stage

### Fully improved

- Redis shared caching
- shell bundle Redis L2
- L1 + Redis invalidation foundation
- exact/prefix invalidation primitives
- major jobs / recruitment / interview / member-admin / onboarding / performance flows
- user-facing degraded-banner cleanup

### Still not fully closed

- Exhaustive invalidation for every HR-domain mutation in the app
- Production validation with the load-test repro after deploy

Phase 1 is no longer blocked by architecture design. The remaining work is mostly **coverage auditing** across long-tail mutation surfaces.

---

## Recommended Next Step

Do one focused pass for the remaining HR-domain mutations and close the last TTL-only flows:

1. Leave / sickness / TOIL / carryover writes
2. HR documents / medical notes / training records
3. Self-profile membership/status changes

After that, run the prod-route-thrash repro against the deployed app and then move to Phase 2.
