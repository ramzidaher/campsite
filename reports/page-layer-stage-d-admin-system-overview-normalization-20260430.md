# Page Layer Stage D Report — Admin System Overview Parity Slice 1
**Date:** 2026-04-30  
**Status:** COMPLETE — admin system-overview normalized to shell + shared cached loader model  
**Follow-up to:** `reports/product-balance-readiness-audit-20260430.md`

---

## Scope

This slice covered:

- `apps/web/src/app/(main)/admin/system-overview/page.tsx`

And supporting changes in:

- `apps/web/src/lib/admin/getCachedAdminSystemOverviewPageData.ts` (new)
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## What Was Verified First

Before this slice, `admin/system-overview` still:

- performed direct profile lookup in-route
- called `getMyPermissions(...)` in-route
- built graph data via route-level fan-out reads

That was inconsistent with the normalized manager sibling and remaining balance goals.

---

## What Changed

### 1. Added shared cached admin system-overview loader

New file:

- `apps/web/src/lib/admin/getCachedAdminSystemOverviewPageData.ts`

It now caches:

- departments directory bundle
- admin overview aggregate
- built system-overview graph

Cache namespace:

- `campsite:admin:system-overview`

Key shape:

- `org:${orgId}:user:${userId}`

### 2. Admin system-overview route now uses shell-bundle gating

File:

- `apps/web/src/app/(main)/admin/system-overview/page.tsx`

Change:

- removed direct profile + permissions fetch path
- switched to shell-derived access:
  - `getCachedMainShellLayoutBundle()`
  - `shellBundleOrgId(...)`
  - `shellBundleProfileStatus(...)`
  - `parseShellPermissionKeys(...)`
- switched route data load to:
  - `getCachedAdminSystemOverviewPageData(...)` via `withServerPerf`

Result:

- route now follows the same core model as normalized manager system-overview.

### 3. Invalidation coverage added for new namespace

File:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Added prefix invalidation for `campsite:admin:system-overview` in:

- `invalidateDepartmentRelatedCachesForOrg`
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

- Eliminates one major sibling inconsistency between admin and manager system-overview routes.
- Reduces route-level read-model drift in a client-visible admin surface.
- Improves maintainability and incident comparability across overview routes.

---

## Recommended Next Move

Continue balance closure on:

1. dashboard cache model convergence (`loadDashboardHome` cache island)
2. hr/recruitment branch-model unification
