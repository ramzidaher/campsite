# Page Layer Stage D Report — HR Recruitment Branch Unification Slice 3
**Date:** 2026-04-30  
**Status:** COMPLETE — `/hr/recruitment` unified under shared cached page read model  
**Follow-up to:** `reports/product-balance-readiness-audit-20260430.md`

---

## Scope

This slice covered:

- `apps/web/src/app/(main)/hr/recruitment/page.tsx`

And supporting changes:

- `apps/web/src/lib/recruitment/getCachedHrRecruitmentPageData.ts` (new)
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## What Was Verified First

Before this slice, the route used split branch behavior:

- queue-capable viewers (`canViewQueue`) used a shared cached loader
- raise-only viewers used direct route-level Supabase fan-out (departments, hierarchy, request list)

That branch split left route-family read strategy inconsistent.

---

## What Changed

### 1. Added shared cached HR recruitment page loader

New file:

- `apps/web/src/lib/recruitment/getCachedHrRecruitmentPageData.ts`

Loader behavior:

- single shared cache namespace for page-data orchestration:
  - `campsite:hr:recruitment:page`
- key includes org, user, and capability flags:
  - `org:${orgId}:user:${userId}:...`
- returns discriminated result:
  - `mode: 'queue'` with queue rows
  - `mode: 'manager'` with managed departments and initial requests

### 2. Route now uses one cached page-data fetch path

File:

- `apps/web/src/app/(main)/hr/recruitment/page.tsx`

Change:

- removed route-level fan-out query block in manager branch
- replaced with single `withServerPerf(...getCachedHrRecruitmentPageData(...))`
- route now branches only for rendering (queue UI vs manager UI), not for read-strategy style

### 3. Invalidation coverage for new namespace

File:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Added `campsite:hr:recruitment:page` invalidation in:

- `invalidateRecruitmentQueueForOrg`
- `invalidateProfileSurfaceForOrg`
- `invalidateAllKnownSharedCachesForOrg`

---

## Verification

Ran:

```bash
cd apps/web && npx tsc --noEmit
```

Result:

- passed cleanly

Lint:

- targeted lints on changed files: clean

---

## Balance Impact

- Removes the remaining uncached route-level branch in a key hiring surface.
- Makes `/hr/recruitment` behavior consistent with normalized route-family cache strategy.
- Improves predictability for incident/debug and future invalidation reasoning.

---

## Recommended Next Move

Start WS2 fallback governance:

1. WS2.1 fallback taxonomy policy artifact
2. WS2.2 route-family fallback audit against policy
