# Page Layer Stage C Report — Admin Users Normalization Slice 1
**Date:** 2026-04-30
**Status:** COMPLETE — `admin/users` moved off page-local cache island
**Follow-up to:** `reports/page-layer-stage-b-jobs-detail-normalization-20260430.md`

---

## Scope

This slice covered:

- `apps/web/src/app/(main)/admin/users/page.tsx`

---

## What Was Verified First

### 1. Route had a bespoke page-local cache implementation

`admin/users/page.tsx` contained:

- local `Map` cache state
- route-local stale/fresh windows
- background refresh logic

This was the exact Stage C anti-pattern called out in the balance audit.

### 2. Route was also using direct profile + permissions fetch style

Before this slice:

- route fetched profile directly
- route called `getMyPermissions()`

instead of reusing the shell-bundle access path that other normalized surfaces use.

---

## What Changed

### 1. Added shared cached loader for admin users page data

New file:

- `apps/web/src/lib/admin/getCachedAdminUsersPageData.ts`

It now loads and caches:

- assignable roles
- role filter options
- manager choices
- initial filtered member rows
- department filter options
- org metadata and member count
- permission-derived capability flags

Cache namespace:

- `campsite:admin:users`

Key shape:

- `org:${orgId}:user:${userId}:status:...:role:...:dept:...:q:...`

Per-user keying is intentional to keep permission/RLS-sensitive payloads isolated.

### 2. `admin/users` route now uses shell bundle + shared loader

File:

- `apps/web/src/app/(main)/admin/users/page.tsx`

Change:

- removed page-local `Map` stale cache machinery
- switched access checks to:
  - `getCachedMainShellLayoutBundle()`
  - `shellBundleOrgId(...)`
  - `parseShellPermissionKeys(...)`
  - `shellBundleProfileStatus(...)`
- switched payload load to:
  - `withServerPerf(..., getCachedAdminUsersPageData(...), 700)`

Result:

- route is no longer a bespoke caching island
- access and read strategy align with normalized page-layer patterns

### 3. Invalidation now covers admin users namespace

File:

- `apps/web/src/lib/cache/cacheInvalidation.ts`

Change:

- added prefix invalidation for `campsite:admin:users` in:
  - `invalidateOrgMemberCachesForOrg`
  - `invalidateAllKnownSharedCachesForOrg`

Result:

- member/profile-related writes can clear admin users cached variants by org prefix.

---

## Files Changed

- `apps/web/src/app/(main)/admin/users/page.tsx`
- `apps/web/src/lib/admin/getCachedAdminUsersPageData.ts`
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

## Remaining Stage C Targets

- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`
- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`

---

## Recommended Next Move

Continue Stage C with `profile/page.tsx` next, because it still contains route-local cache state and heavy bespoke timeout/fallback orchestration.
