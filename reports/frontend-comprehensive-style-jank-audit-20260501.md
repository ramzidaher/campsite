# Frontend Comprehensive Style And Jank Audit
**Date:** 2026-05-01  
**Auditor:** Senior Frontend Engineer (code-level review)  
**Scope:** Frontend only (`apps/web`, plus relevant shared frontend packages like `packages/ui`)  
**Focus:** Styling mismatches, page setup inconsistencies, janky implementation patterns, and org-brand color fidelity

---

## Executive Readout

The frontend has a strong base (token definitions, org-branding engine, shared shell), but real usage is fragmented across multiple styling models. The biggest product-facing problems are:

1. **No single source of truth for theme/rendered colors** (CSS vars vs React theme context vs page-local style islands).
2. **Large internal surfaces bypass org branding** with hardcoded hex values.
3. **Layout contracts differ by route group/page**, causing inconsistent width/padding/rhythm.
4. **Some pages are structurally janky** because they reload too much data, reflow after hydration, or use bespoke styling islands.

Result: the product feels polished in some areas and disconnected in others, even though everything sits under one shell.

---

## Audit Method

- Reviewed core style foundations:
  - `apps/web/src/app/globals.css`
  - `apps/web/src/components/ThemeRoot.tsx`
  - `packages/ui/src/ThemeProvider.tsx`
  - `apps/web/src/lib/orgBranding.ts`
- Reviewed shell and page setup contracts:
  - `apps/web/src/components/AppShell.tsx`
  - route layouts under `apps/web/src/app/(main)/**/layout.tsx`
  - loading contracts (`apps/web/src/app/(main)/loading.tsx`, `dashboard/loading.tsx`)
- Reviewed known high-variance pages:
  - `apps/web/src/components/marketing/LandingPage.tsx`
  - `apps/web/src/components/finance/FinanceHubClient.tsx`
  - HR preview pages and shell wrapper behavior
- Performed codebase scans for color patterns and token usage to identify systemic drift.

---

## High Severity Findings

## 1) Theme and color source-of-truth is split

**Files:**
- `apps/web/src/app/globals.css`
- `apps/web/src/components/ThemeRoot.tsx`
- `packages/ui/src/ThemeProvider.tsx`

**Evidence:**
- `globals.css` defines runtime visual tokens (`--campsite-*`).
- `ThemeRoot` derives scheme from `matchMedia` and feeds `ThemeProvider`.
- `ThemeProvider` keeps tokens in React context but does not drive the CSS vars most pages actually use.
- `.campsite-paper` hard-locks light paper tokens, which can diverge from context-level theme state.

**Impact:**
- Theme behavior can appear inconsistent at runtime.
- Dark-mode/theming changes are harder to reason about.
- Components and page chrome can drift because they do not share one definitive runtime token pipeline.

---

## 2) Brand system exists but much of the app bypasses it

**Files (representative):**
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/components/dashboard/DashboardHome.tsx`
- `apps/web/src/components/finance/FinanceHubClient.tsx`
- `apps/web/src/components/admin/ManagerDashboardClient.tsx`
- broad usage across `apps/web/src/components/**` and `apps/web/src/app/**`

**Evidence:**
- Widespread hardcoded classes such as `text-[#121212]`, `text-[#6b6b6b]`, `border-[#d8d8d8]`, `bg-[#faf9f6]`.
- Scan results show many files with literal hex usage, while `org-brand-*` usage appears in far fewer files.

**Impact:**
- Tenant branding is not consistently represented across core authenticated flows.
- Color updates require wide manual edits instead of token updates.
- Different route families feel like different products.

---

## 3) Shell can shift after hydration (visible layout jump)

**File:**
- `apps/web/src/components/AppShell.tsx`

**Evidence:**
- Sidebar open/closed state is loaded from local storage in `useEffect`.
- Layout margin changes between `md:ml-[58px]` and `md:ml-[240px]` after mount.

**Impact:**
- Users can observe first-paint jank (content “jump” when desktop nav state is hydrated).
- Perceived performance and polish are reduced on frequent routes.

---

## 4) Finance hub is likely to feel janky under activity

**File:**
- `apps/web/src/components/finance/FinanceHubClient.tsx`

**Evidence:**
- Realtime listeners call full `load()` on each relevant table change.
- `load()` executes multiple queries and nested per-week loops, then reconstructs full row lists.
- Frequent full-list recomputation and re-render can happen during active updates.

**Impact:**
- Jittery table updates and UI churn.
- Higher frontend and backend load.
- Noticeably unstable UX during operational periods.

---

## Medium Severity Findings

## 5) Route-level container contract is inconsistent

**Files:**
- `apps/web/src/app/(main)/manager/layout.tsx`
- `apps/web/src/app/(main)/finance/layout.tsx`
- `apps/web/src/app/(main)/hr/layout.tsx`
- plus many page-level wrappers in `apps/web/src/app/(main)/**/page.tsx`

**Evidence:**
- `manager` layout adds concrete shell spacing.
- `finance` layout only sets typography/color wrapper.
- HR routes use `HrWorkspaceShell`, with conditional width behavior.
- Pages then add their own `max-w`, `mx-auto`, `px`, and `py` combinations.

**Impact:**
- Inconsistent horizontal rhythm and content density across adjacent nav sections.
- Page-to-page “wobble” in visual structure.

---

## 6) Global width override is brittle

**File:**
- `apps/web/src/app/globals.css`

**Evidence:**
- `.workspace-fluid` and `.public-fluid` force reset of certain `.mx-auto max-w-*` wrappers via structure-dependent selectors.

**Impact:**
- Layout behavior depends on DOM shape and nesting depth.
- Small markup changes can unexpectedly alter width behavior.

---

## 7) Marketing landing is a style island

**File:**
- `apps/web/src/components/marketing/LandingPage.tsx`

**Evidence:**
- Large inline `style jsx global` block defines extensive `--lp-*` tokens and custom color/dark logic.
- Uses `body.dark .landing-page` branch distinct from app shell theming model.

**Impact:**
- High maintenance overhead.
- Branding/theming behavior can diverge from the rest of the product.
- Makes cross-surface style consistency harder.

---

## 8) Loading experience is inconsistent (blank vs explicit)

**Files:**
- `apps/web/src/app/(main)/loading.tsx`
- `apps/web/src/app/(main)/dashboard/loading.tsx`

**Evidence:**
- Both currently return `null` by design.

**Impact:**
- Some transitions can appear as “nothing happening”.
- Inconsistency vs routes/components that do render loading feedback.

---

## 9) Nested `<main>` semantics in some pages

**Files:**
- `apps/web/src/app/(main)/hr/hiring/application-forms/[id]/preview/page.tsx`
- `apps/web/src/app/(main)/hr/jobs/[id]/preview/page.tsx`
- shell root already provides `<main id="main-content">` in `AppShell.tsx`

**Evidence:**
- Page roots in those routes are additional `<main>` elements.

**Impact:**
- Semantic/accessibility inconsistency.
- Not typically visual jank, but still an implementation quality issue.

---

## Janky Page Watchlist

These pages/components are most likely to feel visually or behaviorally unstable:

1. **`/finance` surfaces (`FinanceHubClient`)**  
   Heavy, full refresh loops + realtime triggers can cause churn and responsiveness issues.

2. **All shell pages on first load (`AppShell`)**  
   Sidebar width/margin state applies post-hydration, causing a noticeable layout shift.

3. **Landing page (`LandingPage`)**  
   Large isolated styling contract with page-local variables and dark handling separate from the rest of the app.

4. **Cross-route transitions between manager/finance/HR/admin pages**  
   Container and spacing contracts vary; this creates subtle but repeatable visual discontinuity.

---

## Branding Mismatch Summary

- Branding infrastructure is solid (`orgBranding` resolution and CSS var generation), but not uniformly consumed.
- The shell root applies brand vars, yet many high-visibility UI elements still use fixed hex colors.
- Internal route families are less brand-driven than some public surfaces.

Bottom line: branding quality is uneven because token adoption is partial, not because the brand system is missing.

---

## Priority Fix Plan (Recommended Order)

## P0  Stabilize UX and source of truth
1. **Unify theme pipeline**: ensure runtime CSS vars and UI theme context are synchronized from one source.
2. **Prevent shell first-paint jump**: initialize desktop sidebar state without post-hydration margin reflow.
3. **Throttle finance realtime refresh**: debounce/in-flight dedupe and update only changed rows where possible.

## P1  Normalize design system adoption
4. **Tokenize hardcoded colors** in shell and top-level hubs first (dashboard, manager, finance, reports, settings).
5. **Define a single page container contract** (`max-width`, `px`, `py`) for `(main)` route groups.
6. **Replace brittle width override dependence** with explicit page wrapper primitives.

## P2  Reduce long-term drift
7. **Extract landing style contract** into maintainable shared tokens/components where feasible.
8. **Standardize loading behavior** for key routes with lightweight skeletons (not full blank/null).
9. **Fix semantic inconsistencies** like nested `<main>` in page components.

---

## Acceptance Criteria For “Frontend Consistency Fixed”

- New pages use shared container/header primitives by default.
- New and updated components use semantic tokens (or `org-brand-*`) rather than raw hex values.
- No visible shell layout jump occurs on desktop first paint.
- High-traffic pages (finance, dashboard, manager) remain visually stable under live updates.
- Route-to-route transitions across main workspaces preserve consistent width, spacing, and title rhythm.

---

## Final Assessment

The frontend is not broken, but it is **architecturally inconsistent** in exactly the areas users perceive as polish: color fidelity, layout rhythm, and interaction stability. The strongest remediation is not one-off CSS cleanup; it is enforcing one runtime theming contract and one page setup contract across all internal route families.
