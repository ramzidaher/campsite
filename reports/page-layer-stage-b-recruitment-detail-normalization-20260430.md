# Page Layer Stage B Report  Recruitment Detail Normalization Slice 3
**Date:** 2026-04-30
**Status:** COMPLETE  recruitment detail route moved to shared cached loader
**Follow-up to:** `reports/page-layer-stage-b-recruitment-normalization-20260430.md`

---

## Scope

This slice covered:

- `apps/web/src/app/(main)/admin/recruitment/[id]/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/requests/[id]/page.tsx`

The HR route was verified first and re-exports the admin route, so one admin-route fix improved both surfaces.

---

## What Was Verified First

### 1. Recruitment detail route was still a direct detail read path

Before this slice, `admin/recruitment/[id]/page.tsx` directly loaded:

- recruitment request detail
- request status events
- organisation slug
- linked job listings

That was a straightforward detail-page read model, but it was still bypassing the shared cache layer entirely.

### 2. This route had a clean candidate shape for a dedicated cached detail loader

Unlike the heavier jobs detail pages, this route:

- already had a single clear entity key (`requestId`)
- had no panelist-only branch
- had no filter-state divergence

That made it a good Stage B detail-route normalization target.

### 3. Recruitment invalidation needed to know about detail variants

Once a dedicated request-detail cache exists, org-level recruitment writes must clear:

- queue cache entries
- request-detail cache entries

That invalidation support was added in the same slice.

---

## What Changed

### 1. Added a dedicated cached recruitment request detail loader

New file:

- `apps/web/src/lib/recruitment/getCachedRecruitmentRequestDetailPageData.ts`

It now loads and caches:

- request detail record
- request status events
- linked job listing summary
- organisation slug

Cache key shape:

- `org:${orgId}:request:${requestId}`

Cache namespace:

- `campsite:jobs:recruitment:detail`

### 2. `admin/recruitment/[id]` now uses the shared loader

File:

- `apps/web/src/app/(main)/admin/recruitment/[id]/page.tsx`

Change:

- removed direct route-level data fetching
- switched to `withServerPerf(..., getCachedRecruitmentRequestDetailPageData(orgId, id), 700)`

Result:

- recruitment detail route now follows the same shared cache strategy as the queue route

### 3. Recruitment invalidation now clears both queue and detail caches

File:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Change:

- recruitment invalidation now clears by org prefix in:
  - `campsite:jobs:recruitment`
  - `campsite:jobs:recruitment:detail`

Result:

- queue and request-detail views stay in sync after recruitment writes

---

## Files Changed

- `apps/web/src/app/(main)/admin/recruitment/[id]/page.tsx`
- `apps/web/src/lib/recruitment/getCachedRecruitmentRequestDetailPageData.ts`
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## Verification

Ran:

```bash
cd apps/web && npx tsc --noEmit
```

Result:

- passed cleanly

---

## What This Slice Improved

1. Recruitment detail route family no longer bypasses the shared cache layer.
2. HR alias detail route benefits automatically.
3. Recruitment write invalidation now covers both queue and detail cache variants.
4. This route family is now more internally consistent than it was at the start of Stage B.

---

## What Remains Open

Still open in Stage B:

- `apps/web/src/app/(main)/admin/jobs/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/admin/jobs/[id]/applications/page.tsx`

Still open in Stage C:

- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/admin/users/page.tsx`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`
- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`

---

## Recommended Next Move

Pause before touching the remaining jobs detail routes and verify them carefully.

They are heavier than the recruitment detail route because they include:

- permission-dependent behavior
- panelist access behavior
- multiple related datasets
- more complex fallback logic

That makes them a good boundary between the lighter Stage B list/detail normalization work and the heavier Stage C people/manager cleanup.
