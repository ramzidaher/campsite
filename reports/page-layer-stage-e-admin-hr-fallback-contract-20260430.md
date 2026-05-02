# Page Layer Stage E Report — Admin HR Fallback Contract Pass
**Date:** 2026-04-30  
**Status:** COMPLETE — explicit partial-data signaling added for admin HR timeout fallback paths  
**Related workstream:** WS2.2 remediation backlog (`WS2.2-C`)

---

## Scope

Files changed:

- `apps/web/src/lib/perf/resolveWithTimeout.ts`
- `apps/web/src/lib/admin/getCachedAdminHrEmployeePageData.ts`
- `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx`

---

## Problem

Admin HR employee detail used timeout fallbacks for selected non-critical subqueries, but route UI did not explicitly signal partial-data state when those fallbacks activated.

---

## Change

### 1) Timeout helper now supports optional timeout callback

In `resolveWithTimeout.ts`:

- added optional `onTimeout` callback parameter
- preserves existing behavior for all existing 3-argument call sites

### 2) Admin HR loader tracks fallback activations

In `getCachedAdminHrEmployeePageData.ts`:

- added `timeoutFallbackLabels` tracking in loader
- wrapped timeout-fallbacked queries with labeled helper
- exposed metadata:
  - `partialData`
  - `partialSections`

### 3) Admin HR route now displays explicit degraded banner

In `admin/hr/[userId]/page.tsx`:

- added visible warning banner when `partialData` is true
- includes short delayed-area summary from `partialSections`
- applied in both interactive and classic render paths

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

- Removes silent partial behavior for admin HR timeout-fallbacked segments.
- Aligns admin HR route with fallback taxonomy policy (`explicit_partial_with_banner` for non-critical degraded paths).
