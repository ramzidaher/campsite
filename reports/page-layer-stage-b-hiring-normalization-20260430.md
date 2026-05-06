# Page Layer Stage B Report  Hiring Route Normalization Slice 1
**Date:** 2026-04-30
**Status:** COMPLETE  first hiring/admin list normalization slice
**Follow-up to:** `reports/page-layer-stage-a-route-inventory-20260430.md`

---

## Scope

This slice covered the first two route families we had already verified as mixed:

- `apps/web/src/app/(main)/admin/jobs/page.tsx`
- `apps/web/src/app/(main)/admin/applications/page.tsx`

HR-facing aliases covered automatically:

- `apps/web/src/app/(main)/hr/hiring/jobs/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/applications/page.tsx`

Those HR routes were verified before changes and they simply re-export the admin routes, so fixing the admin routes fixes both surfaces.

---

## What Was Verified First

### 1. Jobs route had mixed behavior inside one screen

`admin/jobs/page.tsx` used:

- shared cached page data for `jobs.view`
- direct uncached Supabase reads for panelist-only access

That meant the same screen family had different latency and consistency characteristics depending on user role.

### 2. Applications route had mixed behavior by filter state

`admin/applications/page.tsx` used:

- shared cached page data for unfiltered state
- direct uncached Supabase reads for filtered state

That meant the same screen changed read strategy based on query params.

### 3. Invalidation would have been incomplete if cache variants were added

Before this slice:

- jobs invalidation cleared only `campsite:jobs:listings:org:${orgId}`
- applications invalidation cleared only `campsite:jobs:applications:org:${orgId}`

That was fine for one exact key, but it would not clear:

- panelist-specific jobs cache keys
- filtered applications cache keys

So invalidation had to be widened at the same time.

---

## What Changed

### 1. `admin/jobs` now uses shared cache in both branches

File:

- `apps/web/src/app/(main)/admin/jobs/page.tsx`

Support loader added in:

- `apps/web/src/lib/jobs/getCachedAdminJobsPageData.ts`

Change:

- added `getCachedPanelJobsPageData(orgId, profileId)`
- panelist-only branch now uses `withServerPerf(..., getCachedPanelJobsPageData(...))`
- removed direct per-request panelist job fetches from the route

Result:

- both major jobs-page branches now use the shared Redis-backed cache layer
- the route no longer has a direct-read role-based fallback branch

### 2. `admin/applications` now uses cached variants for filtered states

Files:

- `apps/web/src/app/(main)/admin/applications/page.tsx`
- `apps/web/src/lib/jobs/getCachedAdminApplicationsPageData.ts`

Change:

- added `AdminApplicationsFilters`
- added normalized filtered cache keys under the same shared namespace
- route now always calls `getCachedAdminApplicationsPageData(orgId, filters)`
- filtered states no longer drop to raw route-level Supabase queries

Result:

- unfiltered and filtered states now share one core caching strategy
- repeated filter requests can hit Redis/L1 instead of re-querying every time

### 3. Jobs and applications invalidation now clears cache variants

File:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Change:

- jobs invalidation switched from exact key invalidation to prefix invalidation
- applications invalidation switched from exact key invalidation to prefix invalidation

Result:

- panelist jobs cache variants clear correctly on job-related writes
- filtered applications cache variants clear correctly on application/interview-related writes

---

## Files Changed

- `apps/web/src/app/(main)/admin/jobs/page.tsx`
- `apps/web/src/app/(main)/admin/applications/page.tsx`
- `apps/web/src/lib/jobs/getCachedAdminJobsPageData.ts`
- `apps/web/src/lib/jobs/getCachedAdminApplicationsPageData.ts`
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

1. Jobs route family is more consistent across user roles.
2. Applications route family is more consistent across filtered and unfiltered states.
3. Shared invalidation still matches the new cache key shapes.
4. HR aliases benefit automatically because they re-export the admin routes.

---

## What This Slice Did Not Cover

Still open in Stage B:

- `apps/web/src/app/(main)/admin/interviews/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/requests/page.tsx`
- jobs/applications detail/edit routes such as:
  - `apps/web/src/app/(main)/admin/jobs/[id]/edit/page.tsx`
  - `apps/web/src/app/(main)/admin/jobs/[id]/applications/page.tsx`
  - `apps/web/src/app/(main)/admin/recruitment/[id]/page.tsx`

Still open in Stage C:

- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/admin/users/page.tsx`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`
- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`

---

## Notes For The Next Agent

- Do not assume the remaining hiring routes need the exact same implementation as this slice.
- Re-verify `admin/interviews` and `hr/hiring/requests` before applying similar cache variant patterns.
- The new applications variant keys intentionally trade a small amount of cache cardinality for route-family consistency.
- Because invalidation is now prefix-based for jobs/applications, any future key additions in those namespaces should stay under `org:${orgId}...` for correct clearing.

---

## Recommended Next Move

Continue Stage B with:

- `apps/web/src/app/(main)/admin/interviews/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/requests/page.tsx`

Then move to the people/manager normalization batch from Stage C.
