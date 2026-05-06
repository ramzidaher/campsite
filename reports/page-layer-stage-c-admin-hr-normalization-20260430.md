# Page Layer Stage C Report  Admin HR Detail Normalization Slice 4
**Date:** 2026-04-30
**Status:** COMPLETE  admin HR employee detail fan-out moved into shared cached loader
**Follow-up to:** `reports/page-layer-stage-c-manager-normalization-20260430.md`

---

## Scope

This slice covered:

- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`

---

## What Was Verified First

### 1. Admin HR detail route still owned heavy route-level fan-out

Before this slice, `admin/hr/[userId]/page.tsx`:

- handled large multi-wave data loading directly in the route
- mixed core + optional datasets with timeout fallbacks in route code
- built changer/uploader name joins inline

That made it one of the remaining Stage C heavyweight page-local data orchestration paths.

### 2. Access-control behavior had to remain route-local

Permission checks and limited-profile behavior are request-sensitive and remained in the route.

---

## What Changed

### 1. Added shared cached loader for admin HR employee page data

New file:

- `apps/web/src/lib/admin/getCachedAdminHrEmployeePageData.ts`

The loader now encapsulates and caches:

- leave-year context
- employee HR file base row
- sick score
- document, dependant, payroll, tax, history, case, medical datasets
- custom field definitions/values and category data
- related applications
- audit/event rows
- changer/uploader display-name maps

It also preserves existing non-critical timeout behavior for applicable queries.

Cache namespace:

- `campsite:admin:hr:employee`

Key shape:

- `org:${orgId}:user:${userId}:sensitive:${0|1}`

The sensitivity variant keeps payload shape safe when sensitive-case permissions differ.

### 2. Admin HR detail route now consumes shared loader payload

File:

- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`

Change:

- replaced route-local multi-wave fan-out block with:
  - `withServerPerf(..., getCachedAdminHrEmployeePageData(orgId, userId, canViewSensitiveCaseData), 900)`
- kept route-local authz checks and rendering logic unchanged

Result:

- route is significantly more consistent with normalized page-layer strategy
- core read model now sits behind shared cache utilities instead of inline route orchestration

### 3. Invalidation coverage added for new admin HR namespace

File:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Added prefix invalidation for `campsite:admin:hr:employee` in:

- `invalidateOrgMemberCachesForOrg`
- `invalidateProfileSurfaceForOrg`
- `invalidateAllKnownSharedCachesForOrg`

Result:

- org-level member/profile updates can clear admin HR detail cache variants correctly.

---

## Files Changed

- `apps/web/src/lib/admin/getCachedAdminHrEmployeePageData.ts`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`
- `apps/web/src/lib/cache/cacheInvalidation.ts`

---

## Verification

Ran:

```bash
cd apps/web && npx tsc --noEmit
```

Result:

- passed cleanly

Lints:

- targeted lint checks on changed files are clean.

---

## Stage C Closure

Completed Stage C route set:

- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/admin/users/page.tsx`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`
- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`

All now have normalized shared-cache coverage on their previously identified cache-island or heavy fan-out paths, with invalidation wired for newly introduced namespaces.

---

## Recommended Next Move

Begin post-Stage-C validation sweep:

- rerun route-family inventory diff
- confirm no remaining page-local cache islands in high-traffic tenant-facing routes
- run focused before/after latency checks on manager, profile, and admin HR surfaces
- document acceptance against Stage F criteria from `page-layer-balance-audit-20260430.md`
