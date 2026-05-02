# Page Layer Stage D Report — Dashboard Cache Convergence Slice 2
**Date:** 2026-04-30  
**Status:** COMPLETE — dashboard cache island converged to shared cache utility  
**Follow-up to:** `reports/product-balance-readiness-audit-20260430.md`

---

## Scope

This slice covered:

- `apps/web/src/lib/dashboard/loadDashboardHome.ts`

And supporting invalidation alignment:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## What Was Verified First

Before this slice, dashboard home loading relied on a route-local `Map` cache island with:

- custom TTL/stale-window behavior
- custom in-flight and background refresh logic
- manual refresh debounce logic

That model was not aligned with the standardized shared cache pattern used across normalized route families.

---

## What Changed

### 1. Replaced dashboard cache island with shared cache utility

File:

- `apps/web/src/lib/dashboard/loadDashboardHome.ts`

Change:

- removed bespoke dashboard `Map`/stale-window cache entry model
- introduced shared cache registration and read-through loading via:
  - `registerSharedCacheStore(...)`
  - `getOrLoadSharedCachedValue(...)`
- added namespace:
  - `campsite:dashboard:home`
- kept manual refresh behavior by explicit per-key invalidation before load:
  - `invalidateSharedCache('campsite:dashboard:home', key)`

### 2. Added invalidation coverage for dashboard namespace

File:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Added `campsite:dashboard:home` prefix invalidation in:

- `invalidateOrgMemberCachesForOrg`
- `invalidateDepartmentRelatedCachesForOrg`
- `invalidateProfileSurfaceForOrg`
- `invalidateOrgSettingsCachesForOrg`
- `invalidateAllKnownSharedCachesForOrg`

---

## Verification

Ran:

```bash
cd apps/web && npx tsc --noEmit
```

Result:

- passed cleanly

Lint:

- targeted lints on changed files: clean

---

## Balance Impact

- Removes one of the largest remaining page-local cache islands on a high-touch route.
- Aligns dashboard data-path behavior with shared cache architecture used elsewhere.
- Improves cache invalidation consistency for member/profile/org settings updates.

---

## Recommended Next Move

Continue Stage D with:

1. WS1.3 — `hr/recruitment` branch-model unification
2. WS2.1 — fallback taxonomy policy and explicit route behavior rules
