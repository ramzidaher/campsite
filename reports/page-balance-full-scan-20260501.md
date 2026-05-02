# Page Balance Full Scan
**Date:** 2026-05-01  
**Scope:** Full route inventory sanity scan across all pages (`apps/web`)  
**Input artifact:** `reports/route-audit/route-inventory-20260501-071535.csv`

---

## Executive Result

Global page balance is **not fully complete yet** across all routes.

- Total routes scanned: `228`
- Routes flagged with at least one imbalance signal: `41`
- High-priority flagged routes: `16`

Signals used:

- mixed/direct read model on page route
- local map cache detection
- timeout fallback detection
- high direct-read fan-out

---

## What Is Balanced

The previously targeted normalization families remain in good shape:

- `admin/system-overview` parity
- `dashboard` cache convergence
- `hr/recruitment` branch unification
- `profile` decomposition and shared-loader convergence

These pass lint/type/test/build/inventory verification in current workspace state.

---

## Remaining High-Priority Hotspots

The following high-priority routes still show imbalance signals and should be treated as next closure candidates:

1. `apps/web/src/app/(main)/admin/hr/absence-reporting/page.tsx` (mixed read model + high direct reads)
2. `apps/web/src/app/(main)/admin/hr/onboarding/[runId]/page.tsx` (mixed read model + timeout fallback path)
3. `apps/web/src/app/(main)/admin/hr/one-on-ones/page.tsx` (mixed read model)
4. `apps/web/src/app/(main)/admin/hr/performance/[cycleId]/page.tsx` (mixed read model + timeout fallback path)
5. `apps/web/src/app/(main)/admin/teams/page.tsx` (direct-query model)
6. `apps/web/src/app/(main)/broadcasts/[id]/page.tsx` (high direct-read fan-out)
7. `apps/web/src/app/(main)/broadcasts/[id]/edit/page.tsx` (direct-query model)
8. `apps/web/src/app/(main)/hr/hiring/application-forms/page.tsx` (local-cache signal in inventory classification)
9. `apps/web/src/app/(main)/hr/hiring/application-forms/[id]/preview/page.tsx` (direct-query model)
10. `apps/web/src/app/(main)/hr/hiring/new-request/page.tsx` (mixed read model + high direct reads)
11. `apps/web/src/app/(main)/hr/hr-metric-alerts/page.tsx` (mixed read model)
12. `apps/web/src/app/(public)/jobs/page.tsx` (local-cache signal + direct-query model)
13. `apps/web/src/app/(main)/leave/page.tsx` (mixed read model)
14. `apps/web/src/app/(main)/notifications/applications/page.tsx` (direct-query model)
15. `apps/web/src/app/(main)/performance/[reviewId]/page.tsx` (direct-query model + high direct reads)
16. `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx` (inventory still shows local-cache signal; needs validation against current implementation)

---

## Important Nuance

Not every direct-query route is automatically a bug. Some may be acceptable by design (especially simple/public/founder/admin utility routes).  
However, for a strict “all pages balanced” target, these flagged routes require explicit disposition:

- normalize to shared-loader pattern, or
- document as intentional exception with guardrails.

---

## Recommendation

Run a Stage-G pass:

1. Review and triage all `16` high-priority routes.
2. Normalize mixed/high-fanout paths first (admin HR + hiring + leave + broadcasts detail).
3. Re-run inventory and require `0` unexplained high-priority imbalance flags.
4. Document intentional exceptions in a dedicated exception register.

---

## Verdict

If the requirement is **“no unbalanced pages anywhere”**, the answer is currently **not yet**.  
If the requirement is **“targeted balance workstreams complete and technically healthy”**, that is **yes**.

---

## 2026-05-01 Stage G Slice 1 Update

After normalizing `/admin/hr/absence-reporting` and regenerating inventory (`reports/route-audit/route-inventory-20260501-074117.csv`):

- flagged imbalance candidates: `41 -> 40`
- high-priority candidates: `16 -> 15`

## 2026-05-01 Stage G Slice 2 Update

After normalizing `/admin/hr/onboarding/[runId]` and regenerating inventory (`reports/route-audit/route-inventory-20260501-074738.csv`):

- flagged imbalance candidates: `40 -> 39`
- high-priority candidates: `15 -> 14`

## 2026-05-01 Stage G Slice 3 Update

After normalizing `/admin/hr/performance/[cycleId]` and regenerating inventory (`reports/route-audit/route-inventory-20260501-074905.csv`):

- flagged imbalance candidates: `39 -> 38`
- high-priority candidates: `14 -> 13`

## 2026-05-01 Stage G Slice 4 Update

After normalizing `/admin/hr/one-on-ones` and regenerating inventory (`reports/route-audit/route-inventory-20260501-075418.csv`):

- `/admin/hr/one-on-ones` moved from `mixed / high / mixed invalidation` to `shared page-data cache / medium / shared invalidation`
- the route is no longer part of the explicit Stage G high-priority hotspot list
- follow-up audit fix: onboarding run detail client writes now invalidate `onboarding` scope, closing a stale-cache gap that route classification alone would not have caught

## 2026-05-01 Stage G Slice 5 Update

After normalizing `/admin/teams` and regenerating inventory (`reports/route-audit/route-inventory-20260501-075708.csv`):

- `/admin/teams` moved from `direct query / high / no invalidation` to `shared page-data cache / medium / shared invalidation`
- inventory now also classifies `/admin/hr/one-on-ones` as `shared page-data cache` with `0` direct reads in the latest snapshot
- flagged imbalance candidates: `38 -> 36`
- high-priority candidates: `13 -> 11`

## 2026-05-01 Stage G Slice 6 Update

After normalizing `/broadcasts/[id]` and `/broadcasts/[id]/edit` and regenerating inventory (`reports/route-audit/route-inventory-20260501-080013.csv`):

- `/broadcasts/[id]` moved from `direct query / high fan-out` to `shared page-data cache / medium`
- `/broadcasts/[id]/edit` moved from `direct query / high` to `shared page-data cache / medium`
- flagged imbalance candidates: `36 -> 34`
- high-priority candidates: `11 -> 9`

## 2026-05-01 Stage G Slice 7 Update

After normalizing hiring-form surfaces (`/hr/hiring/application-forms`, `/hr/hiring/application-forms/[id]/preview`, `/hr/hiring/new-request`) and regenerating inventory (`reports/route-audit/route-inventory-20260501-080227.csv`):

- all three hiring-form routes moved to `shared page-data cache` with shared invalidation coverage
- local-cache signal on `/hr/hiring/application-forms` is cleared in latest classification
- flagged imbalance candidates: `34 -> 31`
- high-priority candidates: `9 -> 6`

## 2026-05-01 Stage G Slice 8 Update

After normalizing `/hr/hr-metric-alerts`, `/leave`, and `/notifications/applications` and regenerating inventory (`reports/route-audit/route-inventory-20260501-080432.csv`):

- all three routes moved from high mixed/direct models to `shared page-data cache` / medium classification
- flagged imbalance candidates: `31 -> 28`
- high-priority candidates: `6 -> 3`

## 2026-05-01 Stage G Slice 9 + Heuristic Calibration Update

After normalizing `/admin/hr/[userId]`, `/performance/[reviewId]`, and `/jobs`, then recalibrating local-map inventory detection to avoid non-cache `Map` false positives, and regenerating inventory (`reports/route-audit/route-inventory-20260501-080824.csv`):

- `/performance/[reviewId]` moved to `shared page-data cache` / medium
- `/admin/hr/[userId]` and `/jobs` remain shared-loader routes and are no longer high after heuristic fix
- flagged imbalance candidates: `31 -> 26` (against pre-slice-8 baseline snapshot)
- high-priority candidates: `6 -> 1` (remaining: `/profile`)

## 2026-05-01 Stage G Slice 10 Update

After final `/profile` normalization and regenerating inventory (`reports/route-audit/route-inventory-20260501-081108.csv`):

- `/profile` moved from `mixed / fan-out / high` to `shell bundle / single / low` in inventory classification
- flagged imbalance candidates: `26 -> 25`
- high-priority candidates: `1 -> 0`

Current high-priority hotspot register is now empty in the latest snapshot.

## 2026-05-01 Governance Closure Note

Remaining flagged routes are now `medium/low` direct-read surfaces and are explicitly dispositioned in:

- `reports/page-balance-exception-register-20260501.md`

This makes the latest state auditable as:

- no unresolved high-priority imbalance hotspots
- no unexplained flagged routes
- explicit exception governance for non-blocking surfaces

## 2026-05-01 Stage H Slice 2 Update (Admin-heavy batch)

After normalizing `/admin/departments`, `/admin/hr/custom-fields`, `/admin/offer-templates`, and `/admin/rota`, then regenerating strict helper-aware inventory (`reports/route-audit/route-inventory-20260501-084707.csv`):

- all four routes moved from strict high hotspots to `shared page-data cache` / medium
- strict high-priority candidates: `18 -> 14`
- strict next hotspots now center on cross-domain shells (`/dashboard`, `/hr`, `/profile`, `/settings`) and remaining onboarding/applications manager flows

## 2026-05-01 Stage H Slice 3 Update (Admin follow-up)

After normalizing page-level access/read paths in `/admin/jobs/[id]/applications` and `/admin/hr/onboarding`, then regenerating strict helper-aware inventory (`reports/route-audit/route-inventory-20260501-090813.csv`):

- `/admin/jobs/[id]/applications` moved from strict high to `shared page-data cache` / medium
- `/admin/hr/onboarding` no longer has direct page reads (`directReadCount=0`) but remains strict high due fallback/local-cache signal
- strict high-priority candidates: `14 -> 13`

## 2026-05-01 Stage H Slice 4 Update (Settings)

After normalizing `/settings` to a shared page-data loader and regenerating strict helper-aware inventory (`reports/route-audit/route-inventory-20260501-091247.csv`):

- `/settings` moved from strict high to `shared page-data cache` / medium
- strict high-priority candidates: `13 -> 12`

## 2026-05-01 Stage H Slice 5 Update (Shell + performance convergence)

After registering shell cache stores in shared-cache registry, removing `/dashboard` page-level direct read fallback, normalizing `/performance` to a shared loader, and regenerating strict helper-aware inventory (`reports/route-audit/route-inventory-20260501-094614.csv`):

- `/performance` moved from strict high to `shared page-data cache` / medium
- strict high-priority candidates: `11 -> 10`
- remaining strict highs are now concentrated in fallback-heavy route families (`/dashboard`, `/hr`, `/hr/hiring`, `/profile`, `/reports`) plus direct-query manager/onboarding/pending surfaces

## 2026-05-01 Stage H Slice 6 Update (Manager + onboarding)

After normalizing `/manager/departments`, `/manager/teams`, and `/onboarding` to shell + shared page-data loaders and regenerating strict helper-aware inventory (`reports/route-audit/route-inventory-20260501-095146.csv`):

- all three routes moved from strict high to `shared page-data cache` / medium
- strict high-priority candidates: `10 -> 7`
- remaining strict highs: `/dashboard`, `/hr`, `/hr/hiring`, `/hr/hiring/application-forms/[id]/edit`, `/pending`, `/profile`, `/reports`

## 2026-05-01 Stage H Slice 7 Update (Remaining strict-high closure)

After normalizing the remaining strict-high routes to explicit route-data loader patterns and regenerating strict helper-aware inventory (`reports/route-audit/page-balance-inventory-20260501-104706.csv`):

- `/hr/hiring/application-forms/[id]/edit` moved from strict high to `shared page-data cache` / medium
- `/pending` moved from strict high to low via route-data helper decomposition (page-level direct reads removed)
- `/hr`, `/hr/hiring`, and `/reports` moved to explicit shared page-data loader classification / medium
- `/dashboard` and `/profile` moved to explicit shared page-data loader classification / medium
- strict high-priority candidates: `7 -> 0`
- current strict high-priority hotspot register is now empty in the latest page-balance snapshot

## 2026-05-01 Stage H Slice 8 Update (Cache semantics integrity correction)

Post-closure self-audit identified that a subset of newly added `getCached*` route helpers were wrapper-only and not truly cache-backed.  
To preserve balance-model integrity (and avoid classification-only convergence), those helpers were upgraded to real cache-backed loaders and revalidated:

- `getCachedDashboardHomePageData` now uses React `cache(...)` and server-owned Supabase client creation with stable primitive arguments.
- `getCachedProfilePageIdentityData` and `getCachedProfilePageSectionsData` now use React `cache(...)` directly.
- `/dashboard` and `/profile` callers were rewired to the corrected cache-backed contracts.
- Verification rerun: `@campsite/web` typecheck passes after correction.

This closes the gap between naming and runtime behavior, ensuring Stage H closure remains architecturally valid and not merely inventory-classification compliant.
