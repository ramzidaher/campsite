# Page Layer Stage F Report — Profile Decomposition Slice 3
**Date:** 2026-04-30  
**Status:** COMPLETE (slice) — extracted profile overview/core reads into shared loader  
**Workstream:** WS1.4 profile decomposition (in progress overall)

---

## Scope

Files changed:

- `apps/web/src/lib/profile/getCachedProfileOverviewData.ts` (new)
- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## What This Slice Addressed

After previous WS1.4 slices, `profile/page.tsx` still directly orchestrated core overview queries:

- leave-year org settings and timezone
- leave allowance and approved annual leave usage
- user departments
- direct reports
- onboarding active-count (conditional)
- probation alerts RPC

This slice moved that bundle into one shared loader with explicit fallback labeling.

---

## Implementation Notes

### 1) New shared loader for profile overview/core data

Added:

- `getCachedProfileOverviewData(orgId, userId, needsOnboardingCount)`

File:

- `apps/web/src/lib/profile/getCachedProfileOverviewData.ts`

Namespace:

- `campsite:profile:overview`

Returns:

- leave-year metadata (`profileLeaveYearKey`, start month/day)
- allowance + annual-used aggregates
- annual approved leave rows
- department names
- direct report labels + direct report rows
- onboarding active flag
- probation items
- `partialSections`

### 2) Profile route integration

Updated:

- `apps/web/src/app/(main)/profile/page.tsx`

Changes:

- removed direct overview query fan-out and timeout wrapper plumbing from route
- replaced with one cached overview loader call
- kept existing render behavior by adapting returned data into existing route structures
- merged overview `partialSections` into route fallback banner signal set

### 3) Invalidation coverage

Updated:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Added:

- `campsite:profile:overview` invalidation under:
  - `invalidateProfileSurfaceForOrg`
  - `invalidateAllKnownSharedCachesForOrg`

---

## Verification

Ran:

```bash
cd apps/web && npx tsc --noEmit
```

Result:

- pass

Lint:

- targeted lints on changed files: clean

---

## Balance Impact

- Further reduces route-local orchestration in `/profile`.
- Moves another heavy read cluster to shared cache pattern for cross-instance consistency.
- Preserves explicit degraded-state signaling via loader timeout labels.

---

## Remaining WS1.4 Work

- Continue extracting residual profile route-local data shaping where it meaningfully reduces complexity.
- Reassess readiness delta once remaining WS1.4 slices are complete.
