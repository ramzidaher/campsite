# Page Layer Stage G  HR Metric Alerts, Leave, Notifications Normalization
**Date:** 2026-05-01  
**Owner:** Engineering  
**Scope:**  
- `apps/web/src/app/(main)/hr/hr-metric-alerts/page.tsx`  
- `apps/web/src/app/(main)/leave/page.tsx`  
- `apps/web/src/app/(main)/notifications/applications/page.tsx`

---

## Changes delivered

- Added shared loaders:
  - `apps/web/src/lib/hr/getCachedHrMetricAlertsPageData.ts`
  - `apps/web/src/lib/leave/getCachedLeavePageData.ts`
  - `apps/web/src/lib/recruitment/getCachedApplicationNotificationsPageData.ts`
- Rewired all three routes to shell + shared page-data cache pattern.
- Added invalidation coverage for:
  - `campsite:hr:metric-alerts`
  - `campsite:leave:page`
  - `campsite:recruitment:application-notifications`

---

## Verification

- `npx eslint` (targeted files): pass
- `npx tsc --noEmit`: pass
- Inventory refresh: `reports/route-audit/route-inventory-20260501-080432.csv`

---

## Inventory delta

- `/hr/hr-metric-alerts`: `high -> medium`
- `/leave`: `high -> medium`
- `/notifications/applications`: `high -> medium`
- high-priority candidates: `6 -> 3`
