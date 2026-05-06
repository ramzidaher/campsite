# Page Layer Stage B Report  Jobs Detail Normalization Slice 4
**Date:** 2026-04-30
**Status:** COMPLETE  jobs detail edit + applications routes moved to shared cached loaders
**Follow-up to:** `reports/page-layer-stage-b-recruitment-detail-normalization-20260430.md`

---

## Scope

This slice covered:

- `apps/web/src/app/(main)/admin/jobs/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/admin/jobs/[id]/applications/page.tsx`

HR-facing aliases for the same route families benefit automatically where applicable.

---

## What Was Verified First

### 1. Both routes still used direct route-level Supabase read paths

Before this slice:

- `admin/jobs/[id]/edit` loaded job/org/forms/settings/metrics directly in the route.
- `admin/jobs/[id]/applications` loaded job/applications/aggregates/profiles directly in the route.

Both bypassed the shared cache layer used by the normalized list routes.

### 2. Permission logic had to remain route-local

Both routes include access control that is per-request and user-specific:

- shell permission checks
- panelist assignment checks for applications pipeline

Those checks were preserved outside cache loaders.

### 3. New detail cache namespaces required invalidation coverage

Once detail loaders were introduced, job-related writes needed to clear:

- list-level cache keys
- detail edit cache keys
- detail applications cache keys

---

## What Changed

### 1. Added cached loader for job edit detail page

New file:

- `apps/web/src/lib/jobs/getCachedJobEditPageData.ts`

It now caches:

- job edit record (including extended/fallback column compatibility)
- organisation slug
- application form options
- optional HR equality category options (permission-scoped key variant)
- public funnel metrics for live jobs

Cache namespace:

- `campsite:jobs:detail:edit`

Key shape:

- `org:${orgId}:job:${jobId}:hr:${0|1}`

### 2. `admin/jobs/[id]/edit` now uses shared shell + cached loader

File:

- `apps/web/src/app/(main)/admin/jobs/[id]/edit/page.tsx`

Change:

- replaced direct profile/permission/data fetch chain with:
  - `getCachedMainShellLayoutBundle()` access gate
  - `getCachedJobEditPageData(orgId, id, canHrSettings)` wrapped in `withServerPerf`

Result:

- edit route now aligns with shared caching strategy while preserving permission behavior.

### 3. Added cached loader for job applications pipeline page

New file:

- `apps/web/src/lib/jobs/getCachedJobApplicationsPipelinePageData.ts`

It now caches:

- job header data (with offer-template fallback compatibility)
- applications list
- screening aggregates merged into application rows
- active panel profile list
- requested interview schedule

Cache namespace:

- `campsite:jobs:detail:applications`

Key shape:

- `org:${orgId}:job:${jobId}`

### 4. `admin/jobs/[id]/applications` now uses the shared cached loader

File:

- `apps/web/src/app/(main)/admin/jobs/[id]/applications/page.tsx`

Change:

- kept panelist/non-panelist access checks in-route
- replaced direct multi-query route loading with:
  - `getCachedJobApplicationsPipelinePageData(orgId, id)` wrapped in `withServerPerf`

Result:

- pipeline detail route no longer bypasses shared caching for its read model.

### 5. Job-related invalidation now clears detail cache namespaces

File:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Change:

- added prefix invalidation for:
  - `campsite:jobs:detail:edit`
  - `campsite:jobs:detail:applications`

in:

- `invalidateJobRelatedCachesForOrg`
- `invalidateAllKnownSharedCachesForOrg`

Result:

- list + detail cache surfaces stay coherent after job-related writes.

---

## Files Changed

- `apps/web/src/app/(main)/admin/jobs/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/admin/jobs/[id]/applications/page.tsx`
- `apps/web/src/lib/jobs/getCachedJobEditPageData.ts`
- `apps/web/src/lib/jobs/getCachedJobApplicationsPipelinePageData.ts`
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

1. Completed the remaining Stage B jobs detail normalization targets.
2. Removed route-level direct read bottlenecks for edit + pipeline detail pages.
3. Preserved per-user access gates while moving reusable read models behind shared caching.
4. Extended invalidation so new detail namespaces clear correctly.

---

## Remaining Work

Still open in Stage C:

- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/admin/users/page.tsx`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`
- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`

---

## Recommended Next Move

Begin Stage C by re-verifying the people/manager surfaces for:

- mixed shell-bundle vs direct read behavior
- missing shared cache loaders
- invalidation gaps for any newly introduced cache namespaces
