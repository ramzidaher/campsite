# Phase 1 Stage Report — Code-Side Closure
**Date:** 2026-04-30
**Follow-up to:** `reports/phase1-production-hardening-stage-report.md`
**Status:** CODE-SIDE COMPLETE — production validation still required before Phase 1 can be called fully done

---

## What Was Verified First

- Founder back-office mutations were still outside the invalidation pass:
  - `app/(founders)/founders/platform-actions.ts`
  - org deactivate / governance / member delete / permanent org delete / founder-driven profile status changes

- Founder HQ still had a direct browser-side organisation update path:
  - `components/founders/FounderHqApp.tsx`
  - org settings save was writing to `organisations` directly with no cache invalidation

- Tenant admin org settings still had direct writes that affect shell-facing data:
  - `components/admin/OrgSettingsClient.tsx`
  - branding
  - logo changes
  - celebration overrides
  - timezone / org settings saves
  - deactivation request

- Celebration settings are not cosmetic-only in this codebase:
  - `org_celebration_modes` is folded into the shell structural payload
  - shell caches must be invalidated when celebration settings change

---

## What Changed

### 1. Shared invalidation helpers now cover org-settings and explicit user shells

`apps/web/src/lib/cache/cacheInvalidation.ts`

Added:

- `invalidateOrgSettingsCachesForOrg(...)`
  - invalidates the shell bundles for the org
  - invalidates the shared jobs page cache so slug-dependent job URLs refresh immediately

- `invalidateShellCachesForUsers(...)`
  - explicit shell invalidation for user ID lists
  - needed for founder workflows that detach or delete users after their `org_id` is already gone

- `invalidateAllKnownSharedCachesForOrg(...)`
  - broad full-org wipe used for permanent org deletion flows

### 2. Founder back-office mutations now invalidate end-user caches

`apps/web/src/app/(founders)/founders/platform-actions.ts`

Patched:

- `deactivatePlatformOrg(...)`
  - now invalidates org shell caches

- `deletePlatformOrgUser(...)`
  - now invalidates org member caches plus the deleted user shell cache

- `permanentlyDeletePlatformOrg(...)`
  - now invalidates all known shared org caches plus all detached/deleted member shell caches
  - also invalidates after partial destructive progress if the flow fails after users were already detached

- `updateOrganisationGovernance(...)`
  - now invalidates org shell caches after governance changes

- `setFounderProfileStatus(...)`
  - now invalidates org member caches plus the target user shell cache

- new `updatePlatformOrgSettings(...)`
  - server-side founder org settings save
  - invalidates org-settings caches instead of relying on founder browser writes

### 3. Founder HQ org settings no longer bypass the server-side invalidation path

`apps/web/src/components/founders/FounderHqApp.tsx`

- `saveOrgSettings()` now calls `updatePlatformOrgSettings(...)`
- founder edits to org name / slug / logo / active status now go through the same invalidation model as the rest of Phase 1

### 4. Cache invalidation route supports org-settings explicitly

Updated:

- `apps/web/src/app/api/cache/invalidate/route.ts`
- `apps/web/src/lib/cache/clientInvalidate.ts`

Added client/API scope:

- `org-settings`

Permission gate:

- `org.settings.manage`

Scope effect:

- invalidates org shell bundles
- invalidates the shared jobs page cache for org slug changes

### 5. Invalidation route permissions are now aligned with write-capable flows

`apps/web/src/app/api/cache/invalidate/route.ts`

Tightened non-self scopes so read-only users cannot trigger shared cache evictions for write surfaces:

- `jobs` no longer accepts `jobs.view`
- `applications` no longer accepts `applications.view`
- `recruitment` no longer accepts `recruitment.view`
- `interviews` no longer accepts `interviews.view`
- `onboarding` no longer accepts `onboarding.complete_own_tasks`
- `hr-records` now requires `hr.manage_records`

Self-service scopes remain intentionally broad enough for the real writers that use them:

- `profile-self`
- `attendance-self`
- `leave-attendance`

### 6. Tenant admin org settings now invalidate shell-facing caches immediately

`apps/web/src/components/admin/OrgSettingsClient.tsx`

Added invalidation after successful writes for:

- branding save
- logo lookup save
- logo upload save
- logo removal
- branding reset
- general org settings save
- deactivation request
- celebration settings save
- custom celebration removal

These now call `invalidateClientCaches({ scopes: ['org-settings'] })` before `router.refresh()`.

---

## Re-Audit Result After This Stage

The remaining direct org/profile writes that still exist are **not currently known Phase 1 shared-cache blockers**:

- `components/founders/FounderHqApp.tsx`
  - org create (`insert`) only
  - creates a brand-new tenant; there is no existing org cache key to invalidate yet

- `components/admin/AdminNotificationDefaultsClient.tsx`
  - updates `default_notifications_enabled`
  - not currently proven to feed the Redis-backed shared caches or shell bundle

- `components/admin/AdminUsersClient.tsx`
  - direct profile status writes remain
  - already covered by existing `invalidateOrgMemberViews(...)`

- `components/ProfileSettings.tsx`
  - self deactivation remains
  - already covered by `profile-self` invalidation

No additional unpatched founder/back-office org membership or shell-facing org settings mutations were found in the current codebase after this pass.

---

## Verification

- `cd apps/web && npx tsc --noEmit`
- Result: **passes clean**

---

## Honest Phase 1 Status After This Stage

### Code-side status

Phase 1 is now **code-side complete** in the local repo:

- Redis shared caching
- shell Redis L2
- L1 + Redis invalidation foundation
- major mutation coverage
- production hardening on the invalidation API
- founder/back-office cache correctness
- org settings / shell-facing branding + celebration invalidation

### What still prevents Phase 1 from being fully complete

- These local changes still need to be pushed/deployed if they are not already in production
- Production validation has still not been rerun after the latest hardening:
  - Upstash key activity / hit behaviour
  - fresh degraded-shell monitoring
  - prod route-thrash repro

Until that validation is done on the deployed build, Phase 1 should be described as:

**code-complete, validation-pending**

---

## Recommended Next Step

Do not start Phase 2 yet.

1. Deploy the current Phase 1 code if this local work is not live yet
2. Run the production validation pass

Suggested command:

```bash
npm run probe:prod:routes -- --maxUsers 6 --concurrency 3 --tabsPerUser 3 --iterationsPerUser 12
```

Prerequisites already verified locally:

- `.env` contains `NEXT_PUBLIC_SUPABASE_URL`
- `.env` contains a public Supabase key
- default users CSV exists at `scripts/ussu-provision-output/ussu-password-import.csv`

3. If the route-thrash repro and shell monitoring are clean, mark Phase 1 complete
4. Only then move to Phase 2 read-replica / materialized-view work
