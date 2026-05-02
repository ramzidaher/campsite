# Page Layer Stage F Report — Profile Decomposition Slice
**Date:** 2026-04-30  
**Status:** COMPLETE (slice) — extracted profile “other tab” heavy reads into shared loader  
**Workstream:** WS1.4 profile decomposition (in progress overall)

---

## Scope

Files changed:

- `apps/web/src/lib/profile/getCachedProfileOtherTabData.ts` (new)
- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## What This Slice Addressed

Previously, `profile/page.tsx` directly orchestrated a large fan-out for the “other” tab data (documents, dependants, payroll/tax records, employment history, case/medical logs, custom fields, training records).

This slice:

- extracted that heavy read block into a shared cached loader in `lib/profile`
- reduced route-local query orchestration complexity in `profile/page.tsx`
- preserved explicit partial-data signaling by propagating timeout fallback section labels from the new loader

---

## Implementation Notes

### 1) New shared loader

Added:

- `getCachedProfileOtherTabData(orgId, userId)` in `apps/web/src/lib/profile/getCachedProfileOtherTabData.ts`

Namespace:

- `campsite:profile:other-tab`

Loader returns:

- normalized “other tab” datasets
- `partialSections` metadata for timeout fallback activations

### 2) Profile route integration

Updated:

- `apps/web/src/app/(main)/profile/page.tsx`

Changes:

- replaced route-level fan-out block with one cached loader call when `needsOtherTabData`
- mapped returned datasets into existing clients/components
- merged loader `partialSections` into route degraded-state banner logic

### 3) Invalidation coverage

Updated:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Added namespace invalidation for:

- `campsite:profile:other-tab`

under:

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

- Reduces profile route orchestration complexity (step toward WS1.4 end-state).
- Improves route-family consistency by shifting heavy read logic to shared `lib` loader.
- Maintains explicit fallback signaling contract while decomposing.

---

## Remaining WS1.4 Work

- continue decomposing remaining profile heavy blocks (personal/time-off/reporting clusters)
- move additional non-trivial route-local fetch chains into dedicated shared loaders
