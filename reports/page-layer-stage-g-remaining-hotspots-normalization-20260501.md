# Page Layer Stage G — Remaining Hotspots Pass
**Date:** 2026-05-01  
**Owner:** Engineering  
**Scope:**  
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`  
- `apps/web/src/app/(main)/performance/[reviewId]/page.tsx`  
- `apps/web/src/app/(public)/jobs/page.tsx`  
- `scripts/route-inventory-and-probe.mjs`

---

## Changes delivered

- Added shared loaders:
  - `apps/web/src/lib/admin/getCachedAdminHrEmployeeLimitedProfileData.ts`
  - `apps/web/src/lib/performance/getCachedPerformanceReviewDetailPageData.ts`
  - `apps/web/src/lib/jobs/getCachedPublicJobsPageData.ts`
- Rewired:
  - `/performance/[reviewId]` to shell + shared review-detail loader.
  - `/admin/hr/[userId]` limited-view branch to shared limited-profile loader and shell user identity.
  - `/jobs` public listing route to shared jobs page-data loader.
- Added invalidation coverage for:
  - `campsite:performance:review-detail`
  - `campsite:admin:hr:employee:limited`
  - `campsite:public:jobs:list`
- Corrected inventory local-map heuristic in `scripts/route-inventory-and-probe.mjs` so operational `Map` usage is not misclassified as local cache islands.

---

## Verification

- `npx eslint` (targeted files): pass
- `npx tsc --noEmit`: pass
- Inventory refresh:
  - `reports/route-audit/route-inventory-20260501-080613.csv`
  - `reports/route-audit/route-inventory-20260501-080751.csv`
  - `reports/route-audit/route-inventory-20260501-080824.csv` (after heuristic fix)

---

## Inventory delta (latest baseline to latest snapshot)

- from `reports/route-audit/route-inventory-20260501-080227.csv`
- to `reports/route-audit/route-inventory-20260501-080824.csv`

Global signal counts:
- flagged imbalance candidates: `31 -> 26`
- high-priority candidates: `6 -> 1`

Remaining high-priority route:
- `/profile` (still classified as mixed due residual route-local reads and promise-all orchestration)
