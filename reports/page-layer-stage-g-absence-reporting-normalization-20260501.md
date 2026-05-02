# Page Layer Stage G Report — Absence Reporting Normalization
**Date:** 2026-05-01  
**Status:** COMPLETE (slice)  
**Workstream:** Stage G global page-balance closure

---

## Scope

Files changed:

- `apps/web/src/lib/hr/getCachedAbsenceReportingPageData.ts` (new)
- `apps/web/src/app/(main)/admin/hr/absence-reporting/page.tsx`
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## What Was Imbalanced

`/admin/hr/absence-reporting` was flagged as:

- mixed read model
- high direct reads (`4`)
- mixed invalidation dependency

The route performed direct RPC/query fan-out in-page.

---

## What Changed

1. Added shared loader:
   - `getCachedAbsenceReportingPageData(orgId, asOf)`
   - namespace: `campsite:hr:absence-reporting`
2. Rewired route to use one cached page-data load call.
3. Added org-scoped invalidation coverage for new namespace in:
   - `invalidateOrgMemberCachesForOrg`
   - `invalidateLeaveAttendanceCachesForOrg`
   - `invalidateAllKnownSharedCachesForOrg`

---

## Verification

- `npx eslint "src/app/(main)/admin/hr/absence-reporting/page.tsx" "src/lib/hr/getCachedAbsenceReportingPageData.ts" "src/lib/cache/cacheInvalidation.ts"` (pass)
- `cd apps/web && npx tsc --noEmit` (pass)
- `npm run routes:inventory` (pass)

New inventory artifact:

- `reports/route-audit/route-inventory-20260501-074117.csv`

Inventory delta for `/admin/hr/absence-reporting`:

- `accessPattern`: `mixed` -> `shared page-data cache`
- `queryShape`: `org-wide aggregate` -> `single`
- `invalidationDependency`: `mixed` -> `shared invalidation`
- `directReadCount`: `4` -> `0`
- `rpcCount`: `3` -> `0`
- `fromCount`: `1` -> `0`

---

## Stage G Counter Update

Using latest inventory:

- imbalance candidates: `41 -> 40`
- high-priority candidates: `16 -> 15`

This slice removes one high-priority hotspot from the global imbalance queue.
