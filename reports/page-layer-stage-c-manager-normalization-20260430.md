# Page Layer Stage C Report — Manager Route Normalization Slice 3
**Date:** 2026-04-30
**Status:** COMPLETE — manager dashboard + manager system overview moved to shared cached loaders
**Follow-up to:** `reports/page-layer-stage-c-profile-normalization-20260430.md`

---

## Scope

This slice covered:

- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`

And applied one targeted follow-up in:

- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`

---

## What Was Verified First

### 1. Manager routes still used direct route-level fan-out reads

Before this slice:

- `manager/page.tsx` handled large direct query fan-out in-route.
- `manager/system-overview/page.tsx` loaded profile/permissions/scope/directory directly in-route.

This was a clear Stage C imbalance vs normalized route families that use shared cached page-data loaders.

### 2. Access checks must stay request-local

Permission and route gating behavior remains request-specific and was preserved in the route modules.

---

## What Changed

### 1. Added shared loader for manager dashboard page data

New file:

- `apps/web/src/lib/manager/getCachedManagerDashboardPageData.ts`

It now caches:

- managed dept IDs
- manager stats (members, broadcasts, rota counters)
- upcoming calendar/shift items
- per-department breakdown

Cache namespace:

- `campsite:manager:dashboard`

Key shape:

- `org:${orgId}:user:${userId}`

### 2. `manager/page.tsx` now uses shell bundle + shared loader

File:

- `apps/web/src/app/(main)/manager/page.tsx`

Change:

- switched profile/permissions gate to shell bundle access helpers
- replaced direct in-route fan-out reads with:
  - `getCachedManagerDashboardPageData(orgId, user.id)` wrapped by `withServerPerf`

Result:

- manager dashboard now follows shared cache strategy while preserving permission/redirect behavior.

### 3. Added shared loader for manager system-overview page data

New file:

- `apps/web/src/lib/manager/getCachedManagerSystemOverviewPageData.ts`

It now caches:

- workspace department scope
- departments directory bundle
- built system-overview graph payload

Cache namespace:

- `campsite:manager:system-overview`

Key shape:

- `org:${orgId}:user:${userId}`

### 4. `manager/system-overview` now uses shell bundle + shared loader

File:

- `apps/web/src/app/(main)/manager/system-overview/page.tsx`

Change:

- switched profile/permission flow to shell bundle access helpers
- replaced direct page fan-out with:
  - `getCachedManagerSystemOverviewPageData(orgId, user.id, role, permissionKeys)` wrapped by `withServerPerf`

Result:

- manager system overview now aligns with normalized route-family read strategy.

### 5. Invalidation now clears manager namespaces

File:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Added prefix invalidation for:

- `campsite:manager:dashboard`
- `campsite:manager:system-overview`

in:

- `invalidateDepartmentRelatedCachesForOrg`
- `invalidateOrgSettingsCachesForOrg`
- `invalidateAllKnownSharedCachesForOrg`

### 6. Targeted follow-up: admin HR detail now reuses shared employee-file cache

File:

- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`

Change:

- replaced direct `supabase.rpc('hr_employee_file', ...)` call with `getCachedHrEmployeeFile(orgId, userId)`

Result:

- this heavy shared RPC path no longer bypasses normalized cache utilities on admin HR detail.

---

## Files Changed

- `apps/web/src/lib/manager/getCachedManagerDashboardPageData.ts`
- `apps/web/src/lib/manager/getCachedManagerSystemOverviewPageData.ts`
- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## Verification

- Targeted lints on changed files: clean.
- Typecheck currently fails in unrelated existing UI dependency issues (`class-variance-authority` / `clsx` / `tailwind-merge`) outside this slice.

---

## Remaining Stage C Target

- deeper normalization pass for `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx` (broader route-level fan-out consolidation, beyond the shared employee-file cache reuse applied here)

---

## Recommended Next Move

Complete the final Stage C route by extracting `admin/hr/[userId]` query fan-out into a dedicated shared cached loader, then keep route-local permission gates in the page and consume the normalized payload.
