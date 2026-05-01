# Page Layer Balance Audit & Normalization Plan
**Date:** 2026-04-30
**Status:** OPEN — Phase 1 is complete, but the page layer is still uneven
**Follow-up to:** `reports/phase1-production-validation-stage-report.md`
**Related source:** `reports/architecture-findings-20260429.md`
**Stage A inventory:** `reports/page-layer-stage-a-route-inventory-20260430.md`
**Stage B slice 1:** `reports/page-layer-stage-b-hiring-normalization-20260430.md`
**Stage B slice 2:** `reports/page-layer-stage-b-recruitment-normalization-20260430.md`
**Stage B slice 3:** `reports/page-layer-stage-b-recruitment-detail-normalization-20260430.md`

---

## Purpose

This report exists because the app now survives the original production failure mode, but there is still a strong route-level imbalance in how pages fetch data.

The goal here is not to reopen Phase 1. The goal is to define the next cleanup and normalization pass so we do not keep fixing isolated pages while the wider system stays inconsistent.

This report is intentionally strict about one rule:

**Do not assume a page needs the same fix as another page just because they are in the same area. Verify the route first.**

---

## What Was Verified

The audit was done directly against `apps/web/src/app`.

- Total `page.tsx` routes found: `148`
- Page routes containing direct `createClient()` / `supabase.from()` / `supabase.rpc()` reads: `98`
- Page routes clearly referencing shared cached helpers such as `getCachedMainShellLayoutBundle()` or `getCached*PageData()`: `26`

Important note:

- These counts are **not mutually exclusive**
- Some pages use the shell bundle correctly and still do heavy direct reads afterward
- The imbalance is therefore architectural, not just “cached pages vs uncached pages”

---

## Honest Conclusion

The app is now **stable**, but it is **not yet balanced**.

What Phase 1 solved:

- shell meltdown under concurrent load
- distributed thundering herd on the hottest shared paths
- major write-path invalidation gaps

What still remains:

- different pages in the same product area use different read strategies
- some pages have both cached and uncached branches inside the same route
- some large pages still own bespoke timeout, stale-data, or local cache behavior
- this inconsistency is likely a real contributor to the “cheap” or uneven feel

---

## Verified Imbalance Examples

### 1. Hiring pages do not use one consistent read model

`apps/web/src/app/(main)/admin/jobs/page.tsx`

- If the user has `jobs.view`, the page uses `getCachedAdminJobsPageData()`
- If the user is only a panelist, the page bypasses the shared loader and performs direct table reads
- Same product surface, different latency and cache characteristics

`apps/web/src/app/(main)/admin/applications/page.tsx`

- Unfiltered view uses `getCachedAdminApplicationsPageData()`
- Filtered view switches to direct Supabase queries
- Same route, different behavior depending on query params

This is a concrete imbalance and should be treated as a normalization target.

### 2. The profile page is still a special-case subsystem

`apps/web/src/app/(main)/profile/page.tsx`

- Reuses shell data where possible, which is good
- Also defines its own timeout constants, stale window, and local `Map` cache for `hr_employee_file`
- Has a large amount of route-local orchestration and fallback behavior

This is one of the strongest candidates for perceived inconsistency.

### 3. Manager routes still do route-local heavy reads

`apps/web/src/app/(main)/manager/page.tsx`

- Does profile lookup
- Calls `getMyPermissions()`
- Loads department scope
- Fans out multiple direct queries for departments, members, broadcasts, shifts, calendar events, and aggregates

`apps/web/src/app/(main)/manager/system-overview/page.tsx`

- Owns its own profile lookup, permission fetch, workspace scope resolution, and departments directory load

These routes are not wrong, but they do not follow the same shared page-data pattern used in the cached HR/hiring pages.

### 4. Admin users is another bespoke cache island

`apps/web/src/app/(main)/admin/users/page.tsx`

- Defines its own local cache and stale window inside the page module
- Builds its payload via several RPCs and direct table reads
- Does not reuse the shared Redis-backed cache utility used elsewhere

This increases maintenance cost and makes the route family harder to reason about.

### 5. Founder back-office uses its own separate read plane

`apps/web/src/app/(founders)/founders/page.tsx`

- Fires seven platform RPCs in one `Promise.all()`
- Then performs additional profile and settings reads

This may be acceptable as a founder-only surface, but it should be treated explicitly as a special back-office path, not as part of the “balanced” main app path by default.

---

## What Should Not Be Assumed To Be A Bug

This matters because the next pass should stay disciplined.

- Not every direct-read page needs Redis or a shared page bundle
- Low-frequency detail pages can stay direct if they are bounded and consistent
- Founder-only tools do not necessarily need the same optimization level as the main tenant-facing routes
- A page using direct reads is not automatically bad; the real issue is inconsistency, repeated heavy fan-out, or partial-data fallback behavior

---

## What Needs To Be Done

### Stage A — Build a route inventory that is actually useful

Create a route inventory for all `page.tsx` files with these columns:

- route path
- surface owner: `main`, `manager`, `admin`, `hr`, `founders`, `public`
- access pattern: `shell bundle`, `shared page-data cache`, `direct query`, `mixed`
- query shape: `single`, `bounded detail`, `fan-out`, `org-wide aggregate`
- fallback behavior: `none`, `timeout fallback`, `stale data`, `partial data`, `manual local cache`
- invalidation dependency: `none`, `TTL-only`, `shared invalidation`, `unclear`
- priority: `high`, `medium`, `low`

Do not start by editing everything. Start by making the route inventory trustworthy.

### Stage B — Normalize the shared list surfaces first

These routes are the highest-value normalization targets because users hit them often and they already show mixed behavior:

- `apps/web/src/app/(main)/admin/jobs/page.tsx`
- `apps/web/src/app/(main)/admin/applications/page.tsx`
- `apps/web/src/app/(main)/admin/interviews/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/requests/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/jobs/page.tsx`
- `apps/web/src/app/(main)/hr/hiring/applications/page.tsx`

Goal:

- same route family should use one consistent read model
- filtered and unfiltered states should not feel like two different systems

Possible outcome:

- create shared “base dataset + filtered view” loaders where appropriate
- or clearly separate “cached list page” vs “search/detail query page” behavior if one shared path is not realistic

### Stage C — Normalize the people and manager surfaces

Priority routes:

- `apps/web/src/app/(main)/profile/page.tsx`
- `apps/web/src/app/(main)/manager/page.tsx`
- `apps/web/src/app/(main)/manager/system-overview/page.tsx`
- `apps/web/src/app/(main)/admin/users/page.tsx`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`

Goal:

- reduce bespoke page-local cache logic
- reduce route-local fan-out where it repeats common access patterns
- align permission and shell usage across related pages

Specific rules:

- if a route needs a cache, prefer the shared cache utilities over a page-local `Map`
- if a route only needs shell-derived profile and permissions, do not re-fetch them differently without a strong reason
- if a route uses fallback logic, prefer stale-but-complete data over partial primary datasets

### Stage D — Explicitly label special back-office surfaces

Routes to treat separately:

- `apps/web/src/app/(founders)/founders/page.tsx`
- any related founder-only detail pages

Goal:

- decide whether these pages are allowed to remain special-case
- if yes, document that they are intentionally outside the main tenant-facing route model
- if no, give them their own shared loader strategy instead of leaving them as ad hoc multi-RPC pages

### Stage E — Audit fallback behavior for completeness, not just speed

This is important because the original user concern was not only load time but also the “cheap feel” from partial or degraded data.

For high-traffic routes, verify:

- whether timeout fallback hides primary data instead of preserving a complete stale snapshot
- whether different tabs within the same area return different completeness levels
- whether loading states are explicit or silently degraded

Primary rule:

**Do not silently return partial primary datasets for main workspace pages unless the UI clearly communicates it.**

### Stage F — Add route-family acceptance criteria before more optimization work

Before calling the page layer “balanced,” each major route family should meet these checks:

- same route family uses the same core read strategy
- no bespoke page-local caches unless justified in the report
- shell-derived auth/profile/permission data reused consistently where applicable
- fallback behavior is explicit and complete, not partially missing data
- write invalidation path is known for any shared cached dataset

---

## Recommended Execution Order

This is the order that currently makes the most sense.

1. Inventory all page routes and classify them
2. Normalize hiring list routes with mixed cached/uncached branches
3. Normalize `profile`, `manager`, and `admin/users`
4. Verify `admin/hr/[userId]` and other heavy people detail pages
5. Decide whether founders is intentionally special-case or needs its own loader model
6. Re-run route validation after each stage instead of waiting until the end

---

## Deliverables For The Next Agent

The next agent working this area should produce:

- a route inventory markdown or CSV with classifications
- a shortlist of route families that need shared loaders
- a list of pages where local caches should be replaced by shared cache utilities
- a fallback-behavior audit for high-traffic tenant-facing routes
- a stage report after each normalization batch

Rules to follow:

- verify each route before changing it
- do not generalize fixes across a whole area without checking each page
- keep founder-only surfaces separate unless explicitly included
- prefer consistency across route families over one-off “clever” optimizations

---

## Final Call

The system does **not** need a blind refactor of all `148` routes.

It **does** need a deliberate normalization pass across the route families that still mix:

- shared cached loaders
- direct heavy reads
- bespoke local caches
- partial or timeout-driven fallback behavior

That is the real next step if the goal is to make the app feel balanced rather than merely “not on fire.”
