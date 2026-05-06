# Page Layer Stage G Report  Performance Cycle Detail Normalization
**Date:** 2026-05-01  
**Status:** COMPLETE (slice)  
**Workstream:** Stage G global page-balance closure

---

## Scope

Files changed:

- `apps/web/src/lib/hr/getCachedPerformanceCycleDetailPageData.ts` (new)
- `apps/web/src/app/(main)/admin/hr/performance/[cycleId]/page.tsx`
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## What Was Imbalanced

`/admin/hr/performance/[cycleId]` was flagged as:

- mixed read model
- timeout fallback signal in page layer
- mixed invalidation dependency

The route performed direct cycle/reviews/members fan-out in-page.

---

## What Changed

1. Added shared loader:
   - `getCachedPerformanceCycleDetailPageData(orgId, cycleId)`
   - namespace: `campsite:hr:performance:cycle`
2. Rewired route to use one shared page-data loader while keeping route-local access checks.
3. Added invalidation coverage under performance invalidation path:
   - `invalidatePerformanceCyclesForOrg` now also clears `campsite:hr:performance:cycle`.

---

## Verification

- `npx eslint "src/app/(main)/admin/hr/performance/[cycleId]/page.tsx" "src/lib/hr/getCachedPerformanceCycleDetailPageData.ts" "src/lib/cache/cacheInvalidation.ts"` (pass)
- `cd apps/web && npx tsc --noEmit` (pass)
- `npm run routes:inventory` (pass)

New inventory artifact:

- `reports/route-audit/route-inventory-20260501-074905.csv`

Inventory delta for `/admin/hr/performance/[cycleId]`:

- `accessPattern`: `mixed` -> `shared page-data cache`
- `queryShape`: `fan-out` -> `bounded detail`
- `fallbackBehavior`: `timeout fallback` -> `none`
- `invalidationDependency`: `mixed` -> `shared invalidation`
- `directReadCount`: `1` -> `0`
- `rpcCount`: `1` -> `0`
- `sharedLoaderCount`: `1` -> `2`

---

## Stage G Counter Update

Using latest inventory:

- imbalance candidates: `39 -> 38`
- high-priority candidates: `14 -> 13`

This slice removes one additional high-priority hotspot from the global imbalance queue.
