# Page Layer Stage F Report  Profile Decomposition Slice 2
**Date:** 2026-04-30  
**Status:** COMPLETE (slice)  extracted profile personal/time-off support reads into shared loader  
**Workstream:** WS1.4 profile decomposition (in progress overall)

---

## Scope

Files changed:

- `apps/web/src/lib/profile/getCachedProfilePersonalTabData.ts` (new)
- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## What This Slice Addressed

After Slice 1 extracted the “other” tab heavy data path, `profile/page.tsx` still contained direct orchestration for:

- upcoming holiday periods used in personal/time-off views
- role assignment + role label lookup used in profile role chips

This slice moved those paths into a shared loader and reduced additional route-local query branching.

---

## Implementation Notes

### 1) New shared loader for personal/time-off support data

Added:

- `getCachedProfilePersonalTabData(orgId, userId, needsUpcomingData, needsRoleData)`

File:

- `apps/web/src/lib/profile/getCachedProfilePersonalTabData.ts`

Namespace:

- `campsite:profile:personal-tab`

Returns:

- `upcomingHolidayPeriods`
- `ownRoleLabelsRaw`
- `partialSections` (timeout fallback labels)

### 2) Profile route integration

Updated:

- `apps/web/src/app/(main)/profile/page.tsx`

Changes:

- removed direct route-level holiday/role-assignment/role-resolution query chain
- replaced with one cached loader call
- merged loader partial labels into route degraded-state signaling

### 3) Invalidation coverage

Updated:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Added:

- `campsite:profile:personal-tab` prefix invalidation under:
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

- Further reduces profile route orchestration complexity and direct fan-out.
- Improves consistency by moving another profile data cluster into shared `lib` loader pattern.
- Keeps explicit degraded-state behavior via propagated fallback labels.

---

## Remaining WS1.4 Work

- Extract remaining profile heavy blocks (core personal/job/reporting if beneficial)
- Reassess whether route complexity is sufficiently reduced for WS1.4 closure
