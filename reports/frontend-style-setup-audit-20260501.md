# Frontend Style And Page Setup Audit
**Date:** 2026-05-01  
**Scope:** `apps/web`, shared frontend packages (`packages/ui`, `packages/theme`), and the separate `New Landing Page` app.  
**Out of scope:** mobile app behavior, backend correctness, and pixel-perfect browser QA. This is a code-structure and styling-system audit.

---

## Executive Summary

The frontend has a **good brand foundation** but not a single enforced page contract.

The strongest part of the codebase is the **public jobs / candidate surface**. That family consistently resolves organisation branding, applies CSS variables per tenant, and reads like one designed subsystem.

The weakest part of the codebase is the **authenticated workspace**. Most internal pages still use hard-coded Campsite colors, hand-rolled headers, and route-local layout patterns. The result is that the shell looks branded, but a lot of pages still behave like separate mini-apps living inside it.

The biggest architectural mismatch is this:

- there is a shared theme system in `packages/theme`
- there is a CSS-variable branding system in `apps/web/src/lib/orgBranding.ts`
- there is a React theme context in `packages/ui/src/ThemeProvider.tsx`
- there is a separate marketing dark-mode implementation in both `apps/web` and `New Landing Page`

Those systems are not fully converged, so the product currently has **multiple sources of truth for color, page chrome, and theme behavior**.

---

## Audit Snapshot

- Route scan snapshot: `148` `page.tsx` routes in `apps/web/src/app`
- Family split: `125` main app routes, `11` public jobs routes, `4` auth routes, `7` root routes, `1` founders route
- Static code scan result: `11/11` public jobs routes reference `var(--org-brand-...)`
- Static code scan result: only `1/125` main-app routes references `var(--org-brand-...)` directly, and that route is `/profile`
- Static code scan result: `33/148` page routes contain literal hex colors
- Component/package scan snapshot: `142/198` frontend component or UI files contain literal hex colors, while only `14/198` reference `var(--org-brand-...)`
- Largest frontend hotspots in this audit:
  - `apps/web/src/components/ProfileSettings.tsx` - `2250` lines
  - `apps/web/src/components/resources/ResourcesListClient.tsx` - `1720` lines
  - `apps/web/src/app/(main)/profile/page.tsx` - `1453` lines
  - `apps/web/src/components/marketing/LandingPage.tsx` - `410` lines
  - `apps/web/src/components/resources/ResourceDetailClient.tsx` - `404` lines

These numbers matter because the current inconsistency is not just visual; it is structural.

---

## What Is Working Well

- `apps/web/src/lib/orgBranding.ts` is a solid base. It has preset handling, sanitisation, contrast enforcement, and CSS variable generation. That is a strong system to build on.
- `apps/web/src/components/AppShell.tsx` correctly applies brand variables to the authenticated app root and gives the workspace a unified chrome entry point.
- The public jobs family is the cleanest implementation of tenant branding in the repo. `apps/web/src/app/(public)/jobs/page.tsx` and the related candidate pages resolve branding up front and use CSS vars consistently.
- The shell also has thoughtful accessibility support in `apps/web/src/app/globals.css`.

If we want a reference implementation for future internal pages, the best starting point is:

- shell chrome from `AppShell`
- brand resolution from `orgBranding.ts`
- public jobs variable usage
- a shared page-header / toolbar contract that the main app currently does not enforce

---

## Core Findings

## 1. The repo has three theme systems, not one

This is the biggest frontend setup mismatch.

- `packages/theme/src/tokens.ts` and `packages/theme/src/themePresets.ts` define a reusable theme token and accent system.
- `apps/web/src/components/ThemeRoot.tsx` mounts `ThemeProvider` with `accent="midnight"` every time, so the shared theme layer is effectively locked to one accent.
- `packages/ui/src/ThemeProvider.tsx` stores theme data in React context only. It does not push those values onto the DOM as CSS variables.
- `apps/web/src/app/globals.css` defines the actual CSS tokens the app visually uses.
- `apps/web/src/lib/orgBranding.ts` defines a second, separate CSS-variable system for tenant branding.

Impact:

- shared UI primitives and page-level styling are not guaranteed to use the same source of truth
- a component can be "themed" in React context while the page around it still uses unrelated literal hex classes
- tenant branding is only partially connected to the UI package layer

This is why the app feels branded in some places and generic Campsite-only in others.

---

## 2. The shell is branded, but the main workspace pages are mostly not

The internal product is only partially using the organisation brand system.

- `AppShell` applies `brandVars` at the shell root, but the sidebar itself still uses a hard-coded black/white palette and fixed role-dot colors.
- `globals.css` defines the Campsite paper surface and org-brand variables, but many pages never consume the org-brand variables directly.
- The public jobs family does consume them consistently.
- Internal shared helpers such as `packages/ui/src/web/campusTokens.ts` still centralise literal hex values instead of brand variables.

Impact:

- tenant branding is strongest on public recruitment pages and weakest on the internal product
- the user sees different branding quality depending on which route family they are in
- fixed green/orange/blue accents continue to appear even when the organisation brand system exists

In plain terms: the brand engine exists, but the authenticated product still largely renders as a hard-coded Campsite theme.

---

## 3. Shared page primitives exist, but the app is not actually using them

There is a page system on paper, but not in practice.

- `packages/ui/src/web/PageHeader.tsx` exists as a shared primitive.
- Repo search in this audit found no real page usage of `PageHeader`; it is effectively unused.
- `packages/ui/src/web/SectionNav.tsx` exists, but it is only being used by the HR hiring hub via `apps/web/src/app/(main)/hr/hiring/HiringHubTabNav.tsx`.
- Pages such as `/finance`, `/hr`, `/reports`, `/settings`, `/manager/org-chart`, and many admin routes all hand-roll nearly the same header block with slightly different spacing, border, copy width, and action alignment.

Impact:

- title hierarchy is visually close but not actually consistent
- action placement is page-specific instead of predictable
- spacing drift keeps reappearing because there is no enforced wrapper/header pattern
- every new page can accidentally invent its own "almost the same" version

This is a classic frontend drift pattern: the design system exists, but the pages do not depend on it.

---

## 4. Layout consistency is being enforced by global override selectors instead of by page structure

`apps/web/src/app/globals.css` contains a broad `workspace-fluid` / `public-fluid` rule that strips `mx-auto max-w-*` wrappers and forces them to fill available width.

That tells us the pages were not built to a consistent layout contract, so the shell is correcting them after the fact.

Impact:

- page authors can think a route has its own width contract when the shell is actually overriding it
- width bugs become harder to reason about
- layout consistency depends on global CSS magic rather than explicit page composition

This is not immediately user-visible on every page, but it is definitely part of why page setup feels uneven.

---

## 5. Dark mode and theme-state behavior are split and partly dead

There is visible setup drift around theme state.

- `apps/web/src/app/globals.css` defines `:root` dark-mode token swaps.
- `.campsite-paper` then forces the authenticated app back to a light paper surface.
- `apps/web/src/components/marketing/LandingPage.tsx` contains a full `body.dark .landing-page` branch.
- The main app does not set `body.dark`; `ThemeRoot` only updates React state.
- The separate `New Landing Page` app does set `body.dark` in `New Landing Page/src/app/ClientBody.tsx` and ships its own token file in `New Landing Page/src/app/globals.css`.

Impact:

- some theme code in `apps/web` looks live but is not actually driven by the current theme mechanism
- there are now two different marketing theme implementations in the repo
- future frontend work can easily pick the wrong theming pattern

This is a setup issue, not just a color issue.

---

## 6. Several important pages feel like standalone mini-products

The following routes are the most "janky" from a frontend setup perspective because they bypass normal page patterns, ship bespoke styling islands, or mix multiple visual modes in one implementation.

### `/profile`

Why it stands out:

- `apps/web/src/app/(main)/profile/page.tsx` is very large and contains both a classic profile UI and an interactive "orbit" mode in the same file.
- it duplicates content concepts across tabs, especially leave/reporting cards
- it mixes brand-variable usage with large amounts of fixed neutral styling
- it behaves like a self-contained micro-app more than a standard shell page

Why this matters:

- high risk of visual drift between tabs
- hard to keep spacing, cards, and content priorities consistent
- future changes to profile UX will be slower and more error-prone than they should be

### `/settings`

Why it stands out:

- `apps/web/src/app/(main)/settings/page.tsx` is thin, but it hands almost everything to `apps/web/src/components/ProfileSettings.tsx`
- `ProfileSettings.tsx` is the largest frontend component in the audit
- it carries its own tab system, visual language, and many hard-coded palette decisions

Why this matters:

- settings is effectively another mini-app inside the shell
- visual consistency depends on one very large component staying disciplined by hand
- it will be difficult to align settings with the rest of the product without decomposition

### `/admin/hr/org-chart`

Why it stands out:

- `apps/web/src/app/(main)/admin/hr/org-chart/page.tsx` hard-switches to a full-screen dark canvas surface
- `apps/web/src/components/admin/hr/OrgChartClient.module.css` defines a completely different visual language from the main workspace

Why this matters:

- strong contrast with the rest of the HR/admin product
- feels more like a specialist visualization tool than a page inside the same brand system
- likely to create "why does this page look like another product?" reactions

### `/manager/org-chart`

Why it stands out:

- it sits closer to normal shell spacing than the HR org chart, but `apps/web/src/components/reports/LiveOrgChartClient.tsx` and its CSS module still use fixed card widths, fixed node spacing, absolute positioning, and hard-coded status colors
- it does not use org-brand variables for its overall palette

Why this matters:

- it is easier to use than the HR org chart, but it still reads as a custom widget rather than a branded system page
- the fixed graph layout is prone to overflow-heavy behavior and can feel "diagram first, page second"

### `/resources/[id]`

Why it stands out:

- `apps/web/src/app/(main)/resources/[id]/page.tsx` swaps into a different type stack and a custom stone background
- `apps/web/src/components/ResourceDetailClient.tsx` uses a bespoke aesthetic
- the list page `apps/web/src/components/resources/ResourcesListClient.tsx` is much more aligned with org-brand variables than the detail page is

Why this matters:

- the detail experience and the list experience do not feel like the same subsystem
- users moving from library list to detail view hit an unnecessary visual mode change

### `/`

Why it stands out:

- `apps/web/src/components/marketing/LandingPage.tsx` contains a very large inline `style jsx global` block
- it defines a lot of one-off visual tokens and a dark-mode branch that is not wired the same way as the rest of the app

Why this matters:

- the main marketing page is not built from the same styling architecture as the rest of the frontend
- maintaining or re-theming it will stay expensive until the styling model is simplified

### `New Landing Page/`

Why it stands out:

- this is a completely separate frontend surface with its own layout, tokens, dark-mode mechanism, and interaction language

Why this matters:

- it creates immediate duplication risk for brand direction
- any future marketing refresh now has two implementation baselines to reconcile

---

## Route Families That Are Most Consistent

These are the strongest current references:

- **Public jobs / candidate portal**
  - strongest org-brand adoption
  - clear tenant-specific variable setup
  - consistent headers, cards, inputs, and CTA usage

- **Resource library list**
  - not perfect structurally because the component is large
  - but visually it is one of the better internal examples of org-brand variables being applied across controls and cards

- **App shell chrome**
  - structurally solid as the main wrapper
  - the content pages are the part that need normalization

---

## Branding Mismatches Worth Calling Out Explicitly

- The org-brand system is sophisticated, but most internal pages still read from hard-coded Campsite neutrals instead of tenant brand variables.
- The shell background can be branded while the left rail remains fixed black, so the most visible persistent chrome still ignores tenant identity.
- Shared internal helper tokens in `campusTokens.ts` lock in literal colors like `#121212`, `#6b6b6b`, `#d8d8d8`, and `#008B60`.
- The public jobs family proves the product can support brand-driven theming well, but that approach has not been spread across the authenticated app.
- Two separate landing implementations mean branding can drift before it even reaches the app shell.

---

## Recommended Remediation Order

### 1. Unify the theme contract before doing page-by-page polish

- Decide that **org-brand CSS variables** are the runtime source of truth for web surfaces.
- Make `packages/ui` web primitives consume CSS variables instead of hard-coded hex helpers.
- Either connect `ThemeProvider` to DOM variables or reduce its responsibility so there is only one real theming path.

### 2. Turn `PageHeader` into a real contract

- Normalize `/hr`, `/finance`, `/reports`, `/settings`, `/manager/org-chart`, and the main admin surfaces onto one header primitive.
- Fold common page wrapper spacing into a shared page layout component instead of relying on `workspace-fluid` overrides.

### 3. Create an "internal page surface" token layer

- Replace `campusTokens.ts` hard-coded values with CSS-variable-backed classes.
- Keep semantic statuses like success/warning/danger, but stop using literal product-brand substitutes in random pages.

### 4. Break down the three biggest frontend debt hotspots

- Split `/profile` into route-level sections or subcomponents with a shared header and card primitives
- Split `ProfileSettings.tsx` by tab or domain
- Split `ResourcesListClient.tsx` into page shell, folder strip, list/grid, and modal subtrees

### 5. Pick one marketing frontend

- Either keep `apps/web` landing and retire `New Landing Page`, or migrate intentionally in the other direction
- do not keep both as active design baselines

### 6. Normalize the outlier special surfaces

- bring `/resources/[id]` back toward the resource-library visual system
- decide whether org charts are intentionally "tool mode" or should be brought back into brand
- if they stay special, make that decision explicit and reusable instead of one-off

---

## Practical Priority List

If I were sequencing this as a frontend lead, I would do it in this order:

1. Theme and token convergence
2. Shared page header / wrapper contract
3. Internal route-family normalization for `hr`, `finance`, `reports`, `settings`
4. Decompose `/profile` and `ProfileSettings`
5. Normalize resource detail vs resource list
6. Resolve duplicate marketing app strategy
7. Decide whether org charts stay intentionally "special mode"

---

## Bottom Line

The frontend is **not visually random**, but it **is structurally fragmented**.

The app already has enough good pieces to feel very cohesive:

- a strong shell
- a solid org-brand engine
- a good public jobs implementation

What is missing is enforcement.

Right now the system allows too many pages to opt out of the shared styling/setup path, so brand consistency depends on manual discipline. That is why some pages feel polished and others feel janky even though they live in the same product.
