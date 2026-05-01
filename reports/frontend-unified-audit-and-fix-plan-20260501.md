# Frontend Unified Audit And Fix Plan
**Date:** 2026-05-01  
**Prepared by:** Frontend audit consolidation  
**Sources merged:**
- `reports/frontend-style-setup-audit-20260501.md`
- `reports/frontend-ui-audit-20260501.md`
- `reports/frontend-comprehensive-style-jank-audit-20260501.md`

---

## Consolidated Conclusion

All three audits agree on the same core picture:

1. **Styling source-of-truth is split** (global CSS vars, org-brand vars, React theme context, and page-local style islands).
2. **Hardcoded hex colors dominate internal routes**, so org-branding is uneven.
3. **Route/page setup is inconsistent** (container width, spacing, heading hierarchy, loading behavior).
4. **A few key pages are janky by implementation**, not just by styling (notably shell hydration shift and finance realtime reload pattern).

This means we do not have a single enforceable frontend contract yet for page layout + color system + loading UX.

---

## Unified Findings (No Duplicates)

## A) Styling/Theming Architecture
- Theme and runtime color are split between:
  - `apps/web/src/app/globals.css`
  - `apps/web/src/components/ThemeRoot.tsx`
  - `packages/ui/src/ThemeProvider.tsx`
- `.campsite-paper` forces light-paper behavior while other parts still branch on dark conditions.
- Marketing landing defines its own token island (`--lp-*`) and dark handling.

## B) Branding Color Mismatch
- Many pages/components use literal colors (`#121212`, `#6b6b6b`, `#d8d8d8`, etc.) instead of semantic/tokenized vars.
- Off-brand semantic palettes (`amber-*`, `emerald-*`, mixed `red-*` shades) are used inconsistently across warnings/errors/success states.
- Notable accessibility risk: very low contrast error text on admin users page.

## C) Page Setup Mismatch
- Different route groups apply different wrapper contracts (`max-w`, `px`, `py`) with no single enforced standard.
- `workspace-fluid` overrides are used to normalize width behavior after the fact (brittle).
- Heading scale/spacing differs between comparable pages without clear semantic intent.

## D) Jank/Interaction Risk
- Sidebar width/margin state can shift after hydration in shell.
- Finance hub does full reload on realtime events and may churn under activity.
- Loading UX is inconsistent (`null` loaders in key shells/routes).

---

## Routes/Pages That Are Wrong (Deduped)

The list below is the merged “wrong pages” inventory requested, based on all three audits.  
Severity reflects combined impact (brand mismatch + setup mismatch + jank/accessibility risk).

## Critical

- `/admin/users`
  - Error fallback uses low-contrast red tone (accessibility failure risk).
  - Also participates in broader color/token inconsistency.

## High

- `/finance`
  - Route setup inconsistency vs shared shell-bundle permission pattern.
  - Finance surface is linked to janky realtime/full-reload behavior via `FinanceHubClient`.
- `/profile`
  - Oversized mixed-mode page architecture; visual and structural drift risk.
  - Inconsistent with shared page contract direction.
- `/settings`
  - Heavy UI concentrated in large monolith component (`ProfileSettings`) with mixed color/state conventions.
- `/admin/hr/org-chart`
  - Distinct dark/fullscreen visual mode diverges sharply from workspace styling contract.
- `/manager/org-chart`
  - Graph page setup and styling diverge from standard page rhythm and tokenized brand usage.
- `/resources/[id]`
  - Visual language diverges from resources list and wider workspace contract.
- `/` (landing)
  - Large style island with dedicated token system and standalone dark handling.

## Medium

- `/hr`
  - Wrapper/max-width consistency issue flagged.
  - Typography/wrapper setup deviates from normalized page contract.
- `/reports`
  - Included in route family with inconsistent wrapper/heading setup.
- `/pending`
  - Included in warning-state and heading/padding consistency issues.
- `/admin/system-overview`
  - Full-screen style mode lacks consistency with surrounding admin page structure.
- `/admin/broadcasts`
  - Missing/weak standard page wrapper contract (component-driven layout drift risk).
- `/admin/recruitment`
  - Missing/weak standard page wrapper contract (component-driven layout drift risk).
- `/hr/hiring/application-forms/[id]/preview`
  - Structural/semantic setup issue (nested main landmarks in shell context).
- `/hr/jobs/[id]/preview`
  - Structural/semantic setup issue (nested main landmarks in shell context).

## Low

- `/admin/hr/[userId]`
  - Border/heading style inconsistencies vs main standards.
- `/admin/hr/absence-reporting`
  - Included in cross-page status/error styling inconsistency.
- `/subscription-suspended`
  - Off-brand amber treatment inconsistent with warning/error conventions.
- `/register/done`
  - Pending-state visual language differs from admin pending conventions.

---

## Route Groups That Should Be Treated As “Wrong By Contract”

In addition to explicit pages above, the merged audits consistently indicate these **route groups** are inconsistent and should be normalized together:

- Main workspace hubs: `/hr`, `/finance`, `/reports`, `/settings`, `/profile`, manager/admin hubs
- Admin family pages that hand-roll headers/wrappers instead of shared primitives
- Marketing/public surfaces where local style tokens diverge from product-level contracts

---

## Fix Plan (Frontend Execution Plan)

## Phase 0 (Immediate, 1 day)
1. Fix critical accessibility color on `/admin/users`.
2. Standardize warning/error/success color usage to one semantic mapping.
3. Remove obvious wrapper/heading inconsistencies on `/hr`, `/reports`, `/settings`, `/pending`.

## Phase 1 (Stability + Jank, 2-3 days)
1. Remove shell hydration layout jump (pre-hydration sidebar state strategy).
2. Refactor finance realtime refresh path to avoid full reload churn:
   - debounce / in-flight dedupe
   - patch row updates where possible
3. Standardize loading UX on key route shells (replace null loaders where needed).

## Phase 2 (Design System Enforcement, 3-5 days)
1. Introduce/enforce one page container primitive for `(main)` pages.
2. Introduce/enforce one page header primitive for hub/sub pages.
3. Migrate top-traffic routes from hardcoded hex to semantic tokens/org-brand vars.

## Phase 3 (Route Family Normalization, 1-2 weeks incremental)
1. Normalize `/profile` and `/settings` architecture (split large components, align tokens).
2. Align org chart pages with declared “tool mode” or standard page mode (choose one and enforce).
3. Reconcile landing style island with shared branding/theming model.

---

## Recommended Implementation Order (Route-first)

1. `/admin/users` (critical fix)
2. `/hr`, `/reports`, `/settings`, `/pending` (quick contract cleanup)
3. `/finance` and finance sub-surfaces (jank/stability)
4. `/profile` (decomposition)
5. `/admin/hr/org-chart` + `/manager/org-chart` (mode normalization)
6. `/resources/[id]` (align with resources family)
7. `/` landing (token/theming reconciliation)

---

## Done Criteria

- All priority routes above use unified wrapper/header contract.
- Error/warning/success states use one approved semantic mapping.
- No visible shell layout jump on first paint.
- Finance route remains stable under realtime changes.
- Brand token/org-brand var usage is default for updated routes (not literal hex-first).
