# Page Layer Stage A Report  Route Inventory
**Date:** 2026-04-30
**Status:** COMPLETE
**Follow-up to:** `reports/page-layer-balance-audit-20260430.md`

---

## What Was Done

Stage A focused on building a route inventory we can trust before changing more pages.

Completed work:

- extended `scripts/route-inventory-and-probe.mjs`
- added page-balance classification fields to the inventory output
- generated a fresh page-only inventory for the current tree

Generated artifact:

- `reports/route-audit/page-balance-inventory-20260430-163407.csv`

The inventory now includes:

- `surfaceOwner`
- `accessPattern`
- `queryShape`
- `fallbackBehavior`
- `invalidationDependency`
- `priority`
- objective flags/counts such as:
  - `directReadCount`
  - `rpcCount`
  - `fromCount`
  - `sharedLoaderCount`
  - `shellBundleCount`
  - `promiseAllCount`
  - `withServerPerfCount`
  - `hasLocalMapCache`
  - `hasTimeoutFallback`
  - `hasStaleWindow`

---

## Important Guardrail

This inventory is a **first-pass source-level classifier**, not a full semantic proof of each route.

That means:

- direct `supabase.from()` / `supabase.rpc()` calls are counted explicitly
- shared cached loaders are counted explicitly
- helper-driven routes that fetch through imported loaders or `withServerPerf(...)` wrappers are classified as `indirect/unclear`
- any route marked `indirect/unclear` still requires manual file review before changing it

This is intentional. It is safer than pretending every hidden helper path is fully understood from static regex alone.

---

## Verified Inventory Counts

From `reports/route-audit/page-balance-inventory-20260430-163407.csv`:

- total `page.tsx` routes: `148`
- priority split:
  - `high: 36`
  - `medium: 26`
  - `low: 86`

- access pattern split:
  - `direct query: 35`
  - `mixed: 14`
  - `shared page-data cache: 5`
  - `shell bundle: 7`
  - `indirect/unclear: 15`
  - `none: 72`

- query shape split:
  - `fan-out: 29`
  - `org-wide aggregate: 7`
  - `bounded detail: 7`
  - `single: 29`
  - `indirect/unclear: 4`
  - `none: 72`

- fallback behavior split:
  - `none: 138`
  - `manual local cache: 5`
  - `timeout fallback: 2`
  - `timeout fallback + manual local cache: 1`
  - `stale data + manual local cache: 1`
  - `timeout fallback + stale data + manual local cache: 1`

---

## Surface Breakdown

High-priority routes by surface:

- `admin: 17`
- `main: 8`
- `hr: 6`
- `manager: 4`
- `public: 1`

This confirms the next normalization work should focus on the tenant-facing admin, people, and manager layers first.

---

## Verified High-Priority Route Families

### 1. Hiring and recruitment list surfaces

Confirmed high-priority routes:

- `/admin/applications`
- `/admin/jobs`
- `/admin/jobs/[id]/applications`
- `/admin/jobs/[id]/edit`
- `/admin/recruitment/[id]`
- `/hr/recruitment`
- `/hr/hiring/new-request`

Why they are high:

- mixed cached and uncached behavior
- fan-out query shape
- some still rely on page-local cache behavior

### 2. People and profile surfaces

Confirmed high-priority routes:

- `/profile`
- `/admin/users`
- `/admin/hr/[userId]`

Why they are high:

- bespoke page-local caches
- timeout or stale fallback logic
- route-local fan-out

### 3. Manager workspace surfaces

Confirmed high-priority routes:

- `/manager`
- `/manager/departments`
- `/manager/system-overview`
- `/manager/teams`

Why they are high:

- direct or helper-driven heavy reads
- org-wide aggregate patterns
- inconsistent read strategy versus the cached HR list pages

### 4. Aggregate admin and HR routes

Confirmed high-priority routes:

- `/admin/hr/absence-reporting`
- `/admin/hr/onboarding`
- `/admin/hr/onboarding/[runId]`
- `/admin/hr/performance/[cycleId]`
- `/admin/system-overview`
- `/admin/departments`
- `/admin/teams`

Why they are high:

- org-wide aggregate or fan-out behavior
- helper-driven data paths that still need manual verification
- some mix shell reuse with additional direct reads

---

## Known Strong Examples From Manual Verification

These were not only script-classified; they were manually read and confirmed earlier in the audit:

- `apps/web/src/app/(main)/admin/jobs/page.tsx`
  - cached branch for `jobs.view`
  - direct-read panelist branch

- `apps/web/src/app/(main)/admin/applications/page.tsx`
  - cached unfiltered branch
  - direct query filtered branch

- `apps/web/src/app/(main)/profile/page.tsx`
  - shell reuse plus direct reads
  - timeout fallback
  - stale window
  - local `Map` cache

- `apps/web/src/app/(main)/manager/page.tsx`
  - direct fan-out across multiple manager dashboard reads

- `apps/web/src/app/(main)/manager/system-overview/page.tsx`
  - helper-driven aggregate loading path

- `apps/web/src/app/(main)/admin/users/page.tsx`
  - bespoke local cache island

- `apps/web/src/app/(founders)/founders/page.tsx`
  - separate multi-RPC back-office read plane

---

## What This Stage Proves

1. The app is no longer failing under the original Phase 1 incident pattern.
2. The page layer is still uneven enough that users can feel different quality levels across route families.
3. The imbalance is concentrated, not universal.
4. We do **not** need to refactor all `148` pages blindly.
5. We **do** need a normalization pass across the high-priority route families.

---

## What Needs To Be Done Next

### Stage B  Normalize hiring and recruitment list routes

Start with:

- `apps/web/src/app/(main)/admin/jobs/page.tsx`
- `apps/web/src/app/(main)/admin/applications/page.tsx`
- `apps/web/src/app/(main)/admin/interviews/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/jobs/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/applications/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/requests/page.tsx`

Goal:

- remove mixed cached/uncached behavior within the same route family
- make filtered vs unfiltered states feel like one system

### Stage C  Normalize people and manager surfaces

Start with:

- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`
- `apps/web/src/app/(main)/admin/users/page.tsx`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`

Goal:

- reduce page-local caches
- reduce timeout-driven special-case behavior
- align shell, permission, and route data strategy

### Stage D  Separate special back-office routes explicitly

Review:

- `apps/web/src/app/(founders)/founders/page.tsx`

Goal:

- decide whether founder routes remain intentionally special-case
- if not, give them their own shared loader strategy

---

## What Not To Do

- do not treat `none` as “safe” without reading the route
- do not assume helper-driven routes are cheap just because direct query count is zero
- do not merge founder-only route decisions into tenant-facing route decisions
- do not optimize low-frequency pages before normalizing the mixed high-traffic route families

---

## Recommended Next Move

Begin Stage B with the hiring/admin list surfaces first.

That is the cleanest place to improve consistency fastest, because:

- we already verified real mixed behavior there
- those routes are user-visible and frequently visited
- the read-model mismatch is concrete, not hypothetical
