# Page Layer Stage G  Hiring Forms Surfaces Normalization
**Date:** 2026-05-01  
**Owner:** Engineering  
**Scope:**  
- `apps/web/src/app/(main)/hr/hiring/application-forms/page.tsx`  
- `apps/web/src/app/(main)/hr/hiring/application-forms/[id]/preview/page.tsx`  
- `apps/web/src/app/(main)/hr/hiring/new-request/page.tsx`

---

## Why this slice

The hiring-form surfaces were still part of the high-priority imbalance set:

- `/hr/hiring/application-forms` (indirect/local-cache signal)
- `/hr/hiring/application-forms/[id]/preview` (direct query)
- `/hr/hiring/new-request` (mixed + high direct reads)

---

## Changes delivered

1. Added shared loader for application-forms list page:
   - `apps/web/src/lib/recruitment/getCachedHiringApplicationFormsPageData.ts`
   - Namespace: `campsite:hiring:application-forms:page`
   - Key: `org:${orgId}`

2. Added shared loader for application-form preview page:
   - `apps/web/src/lib/recruitment/getCachedHiringApplicationFormPreviewPageData.ts`
   - Namespace: `campsite:hiring:application-forms:preview`
   - Key: `org:${orgId}:form:${formId}`

3. Rewired routes to shell + shared loader pattern:
   - `application-forms/page.tsx` now uses shell bundle permissions + shared page-data loader
   - `application-forms/[id]/preview/page.tsx` now uses shell bundle permissions + shared preview loader
   - `new-request/page.tsx` now reuses `getCachedHrRecruitmentPageData(...)` instead of route-local fan-out

4. Added invalidation coverage:
   - `apps/web/src/lib/cache/cacheInvalidation.ts`
   - Recruitment invalidation now also clears:
     - `campsite:hiring:application-forms:page`
     - `campsite:hiring:application-forms:preview`

---

## Verification

- Targeted lint:
  - `npx eslint "src/app/(main)/hr/hiring/application-forms/page.tsx" "src/app/(main)/hr/hiring/application-forms/[id]/preview/page.tsx" "src/app/(main)/hr/hiring/new-request/page.tsx" "src/lib/recruitment/getCachedHiringApplicationFormsPageData.ts" "src/lib/recruitment/getCachedHiringApplicationFormPreviewPageData.ts" "src/lib/cache/cacheInvalidation.ts"`
  - Result: Pass
- Typecheck:
  - `npx tsc --noEmit`
  - Result: Pass
- Inventory refresh:
  - `npm run routes:inventory`
  - Output: `reports/route-audit/route-inventory-20260501-080227.csv`

---

## Inventory delta

- `/hr/hiring/application-forms`:
  - `accessPattern`: `indirect/unclear -> shared page-data cache`
  - `hasLocalMapCache`: `true -> false`
  - `priority`: `high -> medium`

- `/hr/hiring/application-forms/[id]/preview`:
  - `accessPattern`: `direct query -> shared page-data cache`
  - `directReadCount`: `1 -> 0`
  - `priority`: `high -> medium`

- `/hr/hiring/new-request`:
  - `accessPattern`: `mixed -> shared page-data cache`
  - `directReadCount`: `5 -> 0`
  - `priority`: `high -> medium`

Global signal counts:
- flagged imbalance candidates: `34 -> 31`
- high-priority candidates: `9 -> 6`

---

## Remaining high-priority route set (6)

- `/admin/hr/[userId]`
- `/hr/hr-metric-alerts`
- `/jobs`
- `/leave`
- `/notifications/applications`
- `/performance/[reviewId]`
