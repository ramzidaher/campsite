# Page Layer Stage E Report  Dashboard Fallback Signaling Patch
**Date:** 2026-04-30  
**Status:** COMPLETE  explicit partial-data signaling added for dashboard timeout fallback paths  
**Related workstream:** WS2.2 remediation backlog (`WS2.2-A`)

---

## Scope

Files changed:

- `apps/web/src/lib/dashboard/loadDashboardHome.ts`
- `apps/web/src/components/dashboard/DashboardHome.tsx`

---

## Problem

Dashboard already showed a stale-cache banner, but timeout-partial fallback paths could still return substitute data without guaranteed explicit partial-data signaling.

---

## Change

### 1) Timeout fallback activation tracking in dashboard loader

In `loadDashboardHome.ts`:

- extended `resolveWithTimeout(...)` with optional `onTimeout` callback
- captured timeout-activated sections via `fallbackLabels` set
- exposed metadata in page model:
  - `dashboardPartialData`
  - `dashboardPartialSections`

### 2) Explicit UI signaling for partial dashboard data

In `DashboardHome.tsx`:

- added visible amber banner when `dashboardPartialData === true`
- message clearly indicates sections may be delayed/partially loaded

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

- Converts dashboard timeout fallback behavior from potentially silent partial to explicit partial signaling.
- Aligns dashboard behavior with WS2 fallback taxonomy requirements.
