# Page Layer Stage C Report — Profile Normalization Slice 2
**Date:** 2026-04-30
**Status:** COMPLETE (targeted) — removed profile page-local cache island for employee-file RPC
**Follow-up to:** `reports/page-layer-stage-c-admin-users-normalization-20260430.md`

---

## Scope

This slice covered:

- `apps/web/src/app/(main)/profile/page.tsx`

Focused target in this pass:

- route-local `hrEmployeeFileCache` Map and stale-window cache logic

---

## What Was Verified First

### 1. Profile route still had a bespoke page-local cache

`profile/page.tsx` implemented:

- local `Map` cache for `hr_employee_file`
- custom TTL + stale window
- in-flight / refresh-in-flight management

That was exactly the type of route-local cache island Stage C aims to remove.

### 2. Remaining profile behavior is broader than one cache helper

The route still contains substantial timeout/fallback orchestration for many subqueries.
This slice intentionally addressed one confirmed cache-island bottleneck first rather than broad refactoring.

---

## What Changed

### 1. Added shared cached loader for profile employee-file RPC

New file:

- `apps/web/src/lib/profile/getCachedHrEmployeeFile.ts`

It now:

- wraps `hr_employee_file` RPC behind shared cache utilities
- keeps timeout-fallback behavior (`[]`/no-error fallback) for responsiveness
- uses org + user keying for safe tenant scoping

Cache namespace:

- `campsite:profile:employee-file`

Key shape:

- `org:${orgId}:user:${userId}`

### 2. Profile page now uses shared loader instead of local Map cache

File:

- `apps/web/src/app/(main)/profile/page.tsx`

Change:

- removed inline `hrEmployeeFileCache` implementation block
- switched `rpc_hr_employee_file` load site to `getCachedHrEmployeeFile(orgId, user.id)`

Result:

- profile route no longer owns a bespoke page-local cache implementation for this heavy RPC path
- this read path now follows the shared cache model used by other normalized surfaces

### 3. Invalidation now covers profile employee-file namespace

File:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Change:

- added prefix invalidation for `campsite:profile:employee-file` in:
  - `invalidateProfileSurfaceForOrg`
  - `invalidateAllKnownSharedCachesForOrg`

Result:

- org-level profile/HR invalidation flows now clear employee-file cache variants.

---

## Files Changed

- `apps/web/src/lib/profile/getCachedHrEmployeeFile.ts`
- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## Verification

Ran:

```bash
cd apps/web && npx tsc --noEmit
```

Result:

- passed cleanly

---

## Remaining Stage C Targets

- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`
- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`

---

## Recommended Next Move

Continue Stage C with manager route family normalization (`manager/page.tsx` and `manager/system-overview/page.tsx`) to reduce direct fan-out and align shared read strategy across manager surfaces.
