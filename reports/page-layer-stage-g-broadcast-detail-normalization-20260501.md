# Page Layer Stage G  Broadcast Detail Route Normalization
**Date:** 2026-05-01  
**Owner:** Engineering  
**Scope:** `apps/web/src/app/(main)/broadcasts/[id]/page.tsx`, `apps/web/src/app/(main)/broadcasts/[id]/edit/page.tsx`

---

## Why this slice

Both broadcast detail routes were still high-priority direct-query hotspots:

- `/broadcasts/[id]`: fan-out reads (`directReadCount=8`)
- `/broadcasts/[id]/edit`: direct query with route-local access checks

This was a mismatch versus shared-loader balance patterns used across normalized route families.

---

## Changes delivered

1. Added shared page-data loaders:
   - `apps/web/src/lib/broadcasts/getCachedBroadcastDetailPageData.ts`
   - `apps/web/src/lib/broadcasts/getCachedBroadcastEditPageData.ts`
   - Namespaces:
     - `campsite:broadcasts:detail`
     - `campsite:broadcasts:edit`
   - Keys include org + viewer + broadcast id to avoid cross-user permission leakage.

2. Rewired route access model:
   - Both pages now use shell bundle access checks.
   - Route fan-out Supabase reads were removed from page files.
   - Data is loaded through shared cached loaders with bounded `withServerPerf(...)` wrappers.

3. Added invalidation coverage:
   - `apps/web/src/lib/cache/cacheInvalidation.ts`
   - Added `invalidateBroadcastCachesForOrg(...)`
   - Wired into org-member and global cache invalidation flows.

---

## Verification

- Targeted lint:
  - `npx eslint "src/app/(main)/broadcasts/[id]/page.tsx" "src/app/(main)/broadcasts/[id]/edit/page.tsx" "src/lib/broadcasts/getCachedBroadcastDetailPageData.ts" "src/lib/broadcasts/getCachedBroadcastEditPageData.ts" "src/lib/cache/cacheInvalidation.ts"`
  - Result: Pass
- Typecheck:
  - `npx tsc --noEmit`
  - Result: Pass
- Inventory refresh:
  - `npm run routes:inventory`
  - Output: `reports/route-audit/route-inventory-20260501-080013.csv`

---

## Inventory delta

- `/broadcasts/[id]`:
  - `accessPattern`: `direct query -> shared page-data cache`
  - `directReadCount`: `8 -> 0`
  - `priority`: `high -> medium`

- `/broadcasts/[id]/edit`:
  - `accessPattern`: `direct query -> shared page-data cache`
  - `directReadCount`: `1 -> 0`
  - `priority`: `high -> medium`

Global signal counts:
- flagged imbalance candidates: `36 -> 34`
- high-priority candidates: `11 -> 9`

---

## Remaining high-priority route set (9)

- `/admin/hr/[userId]`
- `/hr/hiring/application-forms`
- `/hr/hiring/application-forms/[id]/preview`
- `/hr/hiring/new-request`
- `/hr/hr-metric-alerts`
- `/jobs`
- `/leave`
- `/notifications/applications`
- `/performance/[reviewId]`
