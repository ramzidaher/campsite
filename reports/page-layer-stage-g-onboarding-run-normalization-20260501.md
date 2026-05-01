# Page Layer Stage G Report — Onboarding Run Detail Normalization
**Date:** 2026-05-01  
**Status:** COMPLETE (slice)  
**Workstream:** Stage G global page-balance closure

---

## Scope

Files changed:

- `apps/web/src/lib/hr/getCachedOnboardingRunPageData.ts` (new)
- `apps/web/src/app/(main)/admin/hr/onboarding/[runId]/page.tsx`
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## What Was Imbalanced

`/admin/hr/onboarding/[runId]` was flagged as:

- mixed read model
- timeout fallback signal in page layer
- mixed invalidation dependency

The route performed direct page-level run/task/employee/completer fan-out.

---

## What Changed

1. Added shared loader:
   - `getCachedOnboardingRunPageData(orgId, runId)`
   - namespace: `campsite:hr:onboarding:run`
2. Rewired route to use one cached page-data fetch call while keeping route-local auth/access checks intact.
3. Added invalidation coverage in onboarding invalidation path:
   - `invalidateOnboardingForOrg` now clears `campsite:hr:onboarding:run` by org/run prefix.

---

## Verification

- `npx eslint "src/app/(main)/admin/hr/onboarding/[runId]/page.tsx" "src/lib/hr/getCachedOnboardingRunPageData.ts" "src/lib/cache/cacheInvalidation.ts"` (pass)
- `cd apps/web && npx tsc --noEmit` (pass)
- `npm run routes:inventory` (pass)

New inventory artifact:

- `reports/route-audit/route-inventory-20260501-074738.csv`

Inventory delta for `/admin/hr/onboarding/[runId]`:

- `accessPattern`: `mixed` -> `shared page-data cache`
- `fallbackBehavior`: `timeout fallback` -> `none`
- `invalidationDependency`: `mixed` -> `shared invalidation`
- `directReadCount`: `1` -> `0`
- `fromCount`: `1` -> `0`
- `sharedLoaderCount`: `1` -> `2`

---

## Stage G Counter Update

Using latest inventory:

- imbalance candidates: `40 -> 39`
- high-priority candidates: `15 -> 14`

This slice removes one high-priority hotspot from the global imbalance queue.
