# Page Layer Stage F Report  Profile Decomposition Slice 4
**Date:** 2026-04-30  
**Status:** COMPLETE (slice)  route-shape simplification after overview extraction  
**Workstream:** WS1.4 profile decomposition (in progress overall)

---

## Scope

Files changed:

- `apps/web/src/app/(main)/profile/page.tsx`

---

## What This Slice Addressed

After Slice 3, `profile/page.tsx` still used compatibility wrappers (`allowanceRow`, `annualApprovedRes`, `directReportsRes`) that mimicked previous Supabase response objects.

This slice removed those wrappers and switched the route to directly consume typed fields from `getCachedProfileOverviewData`.

---

## Implementation Notes

Updated:

- `apps/web/src/app/(main)/profile/page.tsx`

Changes:

- removed legacy local wrapper objects around overview data
- replaced references with direct typed values:
  - `annualEntitlementDays`
  - `toilBalanceDays`
  - `annualApprovedRequests`
  - `directReportRows`
- kept UI behavior unchanged (same counts, cards, percentages, lists)

---

## Verification

Ran:

```bash
cd apps/web && npx tsc --noEmit
```

Result:

- pass

Lint:

- targeted lints on changed file: clean

---

## Balance Impact

- Reduces profile route-local compatibility glue and improves readability/maintainability.
- Strengthens the decomposition outcome by aligning route rendering directly to normalized loader contracts.
