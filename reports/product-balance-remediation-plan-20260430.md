# Product Balance Remediation Plan
**Date:** 2026-04-30  
**Objective:** Bring software to balanced, client-ready state across architecture, behavior, UX consistency, and release governance.

---

## Program Goal

Close remaining imbalance so that:

1. Related routes behave like one system.
2. Data completeness/fallback behavior is explicit and consistent.
3. Operational/debug posture is predictable.
4. Client-facing quality is stable under normal and stressed usage.

---

## Guiding Constraints

- Do not do a blind all-route rewrite.
- Keep security/permission correctness invariant.
- Favor small, verifiable route-family slices.
- Each slice must include:
  - implementation
  - invalidation check
  - type/lint verification
  - report update

---

## Workstreams

## WS1 — Route Model Normalization (Core)
**Purpose:** remove remaining architectural drift between sibling routes.

### WS1.1 Admin system overview parity
- Target:
  - `apps/web/src/app/(main)/admin/system-overview/page.tsx`
- Actions:
  - align to shell bundle access pattern
  - extract shared cached page-data loader
  - align with manager-system-overview structure
- Exit criteria:
  - no direct route-level profile + permission fetch
  - shared cache namespace + invalidation coverage

### WS1.2 Dashboard cache model convergence
- Target:
  - `apps/web/src/lib/dashboard/loadDashboardHome.ts`
  - `apps/web/src/app/(main)/dashboard/page.tsx`
- Actions:
  - replace local Map/stale-window island with shared cache utility namespace
  - preserve UX while standardizing freshness semantics
- Exit criteria:
  - no bespoke page-local cache island for dashboard home
  - invalidation path documented

### WS1.3 HR recruitment branch unification
- Target:
  - `apps/web/src/app/(main)/hr/recruitment/page.tsx`
- Actions:
  - unify cached/uncached branch behavior under one shared read model
- Exit criteria:
  - route family no longer splits core read strategy by branch

### WS1.4 Profile route decomposition
- Target:
  - `apps/web/src/app/(main)/profile/page.tsx`
- Actions:
  - extract layered shared loaders for core/profile tabs
  - reduce route-local orchestration complexity
- Exit criteria:
  - route is primarily access + orchestration shell; heavy data loaders live in `lib/`

---

## WS2 — Fallback & Completeness Governance (Non-Performance Critical)
**Purpose:** ensure degraded behavior is trustworthy and transparent.

### WS2.1 Fallback taxonomy
- Define allowed fallback classes:
  - `complete_stale_snapshot`
  - `explicit_partial_with_banner`
  - `hard_fail`
- Ban silent partial for critical workspace data.

### WS2.2 Route-family fallback audit
- High-touch families:
  - dashboard, profile, manager, admin HR, hiring/recruitment
- Output:
  - per-route fallback decision and UI signaling rule

### WS2.3 UX signaling standard
- If degraded/partial data path is used:
  - explicit visible state
  - internal reason remains logged
  - no ambiguous “normal looking but incomplete” screen

---

## WS3 — Quality & Release Balance Gate
**Purpose:** add explicit launch confidence checks for “balanced product”, not just code quality.

### WS3.1 Balance acceptance checklist (Stage F formalization)
Add a pre-release checklist requiring:
- route-family read model consistency
- no unjustified page-local cache islands
- shell access consistency where applicable
- fallback completeness compliance
- known invalidation path for shared datasets

### WS3.2 Inventory regeneration and drift detection
- Regenerate route inventory from scripts:
  - `npm run routes:inventory`
- Compare against previous inventory and record deltas in reports.

### WS3.3 Pre-client validation matrix
- Required:
  - lint/typecheck/test/build
  - route-family smoke checks
  - targeted load/latency sanity on top 10 routes
  - fallback behavior verification checklist

---

## WS4 — Intentional Exception Documentation
**Purpose:** avoid hidden special-cases.

### WS4.1 Founder surface decision
- Target:
  - `apps/web/src/app/(founders)/founders/page.tsx`
- Decision options:
  1. mark as intentional special back-office plane
  2. normalize with dedicated shared loader strategy
- Must be explicitly documented either way.

---

## Priority Order (Recommended)

1. WS1.1 admin system-overview parity
2. WS1.2 dashboard cache convergence
3. WS1.3 hr/recruitment branch unification
4. WS2 fallback governance across top route families
5. WS1.4 profile decomposition
6. WS4 founder exception decision
7. WS3 finalize release gate and launch checklist

---

## Definition of Done (Program)

Program is complete when all are true:

1. Remaining hotspot routes are normalized or explicitly exempted.
2. Fallback policy is enforced and documented for high-touch routes.
3. Route inventory is refreshed and trusted post-normalization.
4. Launch checklist includes balance gates and passes.
5. Product readiness audit can be reissued as **Green**.

---

## Suggested Cadence

- Daily: progress log update and blocker review
- Per slice: report artifact + verification
- Twice weekly: route consistency review
- Weekly: readiness score recalculation

---

## Owners / Tracking

Use the companion tracking document:

- `reports/product-balance-progress-log-20260430.md`

Each work item should track:
- status
- evidence links
- verification results
- risk notes
