# Page Layer Stage G Report — One-on-One Compliance Normalization
**Date:** 2026-05-01  
**Status:** COMPLETE (slice)  
**Workstream:** Stage G global page-balance closure

---

## Scope

Files changed:

- `apps/web/src/lib/hr/getCachedHrOneOnOneCompliancePageData.ts` (new)
- `apps/web/src/app/(main)/admin/hr/one-on-ones/page.tsx`
- `apps/web/src/lib/cache/cacheInvalidation.ts`
- `apps/web/src/lib/cache/clientInvalidate.ts`
- `apps/web/src/app/api/cache/invalidate/route.ts`
- `apps/web/src/components/one-on-one/OneOnOnesHubClient.tsx`
- `apps/web/src/components/one-on-one/OneOnOneMeetingDetailClient.tsx`
- `apps/web/src/components/admin/hr/onboarding/OnboardingRunClient.tsx`

---

## What Was Verified First

### 1. `/admin/hr/one-on-ones` was still a real page-layer hotspot

In the pre-slice inventory (`reports/route-audit/route-inventory-20260501-074905.csv`), the route was still classified as:

- `accessPattern`: `mixed`
- `invalidationDependency`: `mixed`
- `priority`: `high`

The page still pulled its initial compliance dataset with a direct route-level RPC even though the surrounding admin HR detail routes had already been normalized.

### 2. One-on-one write flows did not invalidate an HR compliance cache

Before this slice, there was no dedicated one-on-one invalidation scope or namespace coverage for an HR compliance page dataset. That meant normalizing the route without also wiring client write invalidation would have created a new TTL-only stale-data pocket.

### 3. The onboarding detail route had a follow-up stale-data gap

`/admin/hr/onboarding/[runId]` was already normalized to a shared loader, but `OnboardingRunClient` still relied only on `router.refresh()` after task/run writes. Under Redis, that could serve cached pre-mutation detail data until TTL expiry.

---

## What Changed

### 1. Added a shared cached loader for HR one-on-one compliance

New loader:

- `getCachedHrOneOnOneCompliancePageData(orgId, filter)`

Namespace:

- `campsite:hr:one-on-ones:compliance`

Key shape:

- `org:${orgId}:filter:${filter}`

The loader encapsulates the initial `hr_one_on_one_compliance_list` RPC and returns a stable `{ rows, errorMessage }` payload for the route.

### 2. Rewired `/admin/hr/one-on-ones` to the shared-loader pattern

The route now:

- reuses shell bundle access state
- loads initial compliance data through the shared loader
- no longer performs direct route-level Supabase RPC reads

Because `/hr/one-on-ones` re-exports the admin route, both paths benefit from the same normalization.

### 3. Added one-on-one compliance invalidation coverage

New invalidation helper:

- `invalidateOneOnOneComplianceForOrg(orgId)`

Wired into:

- `invalidateOrgMemberCachesForOrg`
- `invalidateAllKnownSharedCachesForOrg`

This ensures org/member churn can clear the cached compliance dataset.

### 4. Added a client invalidation scope for one-on-one writes

New client/API scope:

- `one-on-ones`

Permission guard allows callers who can legitimately mutate/view one-on-one data:

- `one_on_one.view_own`
- `one_on_one.view_all_checkins`
- `one_on_one.manage_direct_reports`
- `hr.view_records`

The following write paths now invalidate the compliance cache:

- `OneOnOnesHubClient` after `one_on_one_meeting_upsert`
- `OneOnOneMeetingDetailClient` after `one_on_one_meeting_update_doc`
- `OneOnOneMeetingDetailClient` after `one_on_one_meeting_sign`
- `OneOnOneMeetingDetailClient` after `one_on_one_meeting_set_status`

### 5. Closed the onboarding run detail invalidation gap

`OnboardingRunClient` now invalidates `onboarding` scope after:

- task status updates
- run cancellation
- run task creation

That keeps the already-normalized onboarding run detail cache honest after client-side writes.

---

## Verification

- `cd apps/web && npx tsc --noEmit --pretty false` (pass)
- targeted `eslint` across the changed route/loader/invalidation/client files (pass)
- `npm run routes:inventory -- --pagesOnly true` (pass)
- `npm run routes:inventory` (pass)

New inventory artifacts:

- `reports/route-audit/page-balance-inventory-20260501-075306.csv`
- `reports/route-audit/route-inventory-20260501-075418.csv`

Inventory delta for `/admin/hr/one-on-ones`:

- `accessPattern`: `mixed` -> `shared page-data cache`
- `invalidationDependency`: `mixed` -> `shared invalidation`
- `priority`: `high` -> `medium`
- `directReadCount`: `1` -> `0`
- `rpcCount`: `1` -> `0`
- `sharedLoaderCount`: `1` -> `2`

This removes `/admin/hr/one-on-ones` from the explicit Stage G high-priority hotspot list.

---

## Recommended Next Slice

The next strongest remaining Stage G closure targets are still:

1. `/broadcasts/[id]`
2. `/broadcasts/[id]/edit`
3. `/admin/teams`
4. `/hr/hiring/new-request`
5. `/performance/[reviewId]`

Those routes still need the same audit-first treatment:

- verify current classification against fresh inventory
- normalize only where the route is still genuinely mixed/direct-heavy
- wire invalidation at the same time when introducing shared page-data caching
