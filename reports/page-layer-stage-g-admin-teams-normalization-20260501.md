# Page Layer Stage G — Admin Teams Normalization
**Date:** 2026-05-01  
**Owner:** Engineering  
**Scope:** `apps/web/src/app/(main)/admin/teams/page.tsx`

---

## Why this slice

`/admin/teams` was still classified as a direct-query route in Stage G inventory, which left it outside the shared page-data cache pattern used across other normalized admin surfaces.

---

## Changes delivered

1. Added shared page-data loader:
   - `apps/web/src/lib/admin/getCachedAdminTeamsPageData.ts`
   - Namespace: `campsite:admin:teams`
   - Cache key: `org:${orgId}`
   - Load path delegates to `loadDepartmentsDirectory(...)` behind shared cache

2. Rewired route to shell + shared loader pattern:
   - `apps/web/src/app/(main)/admin/teams/page.tsx`
   - Replaced direct `createClient + getAuthUser + profiles + get_my_permissions` flow
   - Uses shell bundle access checks (`shellBundleOrgId`, status, permissions)
   - Loads department payload via `getCachedAdminTeamsPageData(orgId)`

3. Added invalidation coverage:
   - `apps/web/src/lib/cache/cacheInvalidation.ts`
   - Added `campsite:admin:teams` prefix invalidation in department-related and global invalidation paths

---

## Verification

- Targeted lint:
  - `npx eslint "src/app/(main)/admin/teams/page.tsx" "src/lib/admin/getCachedAdminTeamsPageData.ts" "src/lib/cache/cacheInvalidation.ts"`
  - Result: Pass
- Typecheck:
  - `npx tsc --noEmit`
  - Result: Pass
- Inventory refresh:
  - `npm run routes:inventory`
  - Output: `reports/route-audit/route-inventory-20260501-075708.csv`

---

## Inventory delta (from previous snapshot)

- `/admin/teams`:
  - `accessPattern`: `direct query -> shared page-data cache`
  - `directReadCount`: `1 -> 0`
  - `invalidationDependency`: `none -> shared invalidation`

- `/admin/hr/one-on-ones` also converged in this refresh:
  - `accessPattern`: `mixed -> shared page-data cache`
  - `directReadCount`: `1 -> 0`

Global signal counts:
- flagged imbalance candidates: `38 -> 36`
- high-priority candidates: `13 -> 11`

---

## Remaining high-priority route set (11)

- `/admin/hr/[userId]`
- `/broadcasts/[id]`
- `/broadcasts/[id]/edit`
- `/hr/hiring/application-forms`
- `/hr/hiring/application-forms/[id]/preview`
- `/hr/hiring/new-request`
- `/hr/hr-metric-alerts`
- `/jobs`
- `/leave`
- `/notifications/applications`
- `/performance/[reviewId]`
