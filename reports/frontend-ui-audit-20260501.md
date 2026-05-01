# Frontend UI Audit — CampSite Web App
**Date:** 2026-05-01  
**Scope:** All pages under `apps/web/src/app/(main)/`, `(auth)/`, and key shared components  
**Pages surveyed:** ~120 page files, ~90 component files  
**Auditor:** Senior Frontend Engineer review

---

## Executive Summary

The app has a well-designed brand token system defined in `globals.css`, but it is almost entirely bypassed in practice — components hardcode the same hex values the tokens represent, creating a brittle, unmaintainable styling layer. There are also significant inconsistencies in page layout widths, heading scales, vertical padding, error state colours, and duplicated utility logic across multiple files. The issues range from minor visual jank to accessibility-level problems (`text-red-300` on white).

---

## 1. Brand Colour System — Defined but Not Used

### What exists (correct)

`apps/web/src/app/globals.css` defines a complete set of CSS custom properties:

```css
:root {
  --campsite-bg:             #faf9f6;   /* cream page background */
  --campsite-surface:        #f5f4f1;   /* slightly darker surface */
  --campsite-text:           #121212;   /* near-black primary text */
  --campsite-text-secondary: #6b6b6b;   /* mid-grey secondary text */
  --campsite-text-muted:     #9b9b9b;   /* light-grey muted text */
  --campsite-border:         #d8d8d8;   /* standard border */
  --campsite-warning:        #b91c1c;   /* brand red / error */
  --campsite-success:        #15803d;   /* brand green */
  --campsite-accent:         #121212;   /* primary CTA colour */
}
```

Dark mode variants are defined under `@media (prefers-color-scheme: dark)`. The `.campsite-paper` class locks the main app chrome to always-light. Tailwind maps these to `campsite.*` utilities in `tailwind.config.ts`.

### The problem

**Virtually no component uses these tokens.** Instead, every component hardcodes the raw hex values. A survey of the codebase finds:

| Pattern | Example usage | Occurrence |
|---|---|---|
| `text-[#121212]` | Primary text | ~200+ instances |
| `text-[#6b6b6b]` | Secondary text | ~150+ instances |
| `text-[#9b9b9b]` | Muted text | ~100+ instances |
| `border-[#d8d8d8]` | Standard border | ~120+ instances |
| `bg-[#f5f4f1]` | Surface colour | ~60+ instances |
| `bg-[#faf9f6]` | Page background | ~40+ instances |

The **only place** where `var(--org-brand-*)` is used correctly is a single heading in [profile/page.tsx:476](apps/web/src/app/(main)/profile/page.tsx#L476):

```tsx
className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[var(--org-brand-text,#121212)]"
```

Everything else skips the token layer entirely. This means:
- Any future rebrand requires a global find-and-replace across 200+ files
- Dark mode, high-contrast, and theming cannot be toggled at the token level
- The token system investment is wasted

---

## 2. Error & Status Colour Chaos

This is the most inconsistent area in the codebase. At least **five different red/error patterns** coexist:

### 2a. `text-red-300` — Accessibility Failure
**File:** [admin/users/page.tsx:39](apps/web/src/app/(main)/admin/users/page.tsx#L39)

```tsx
return <p className="text-sm text-red-300">{err instanceof Error ? err.message : 'Failed to load members'}</p>;
```

`text-red-300` is a very light pink-red on a white/cream background. It fails WCAG AA contrast (approximately 2.4:1 against white, needs 4.5:1). This is the page-level error fallback for the entire Users admin page — it would be nearly invisible to most users and completely invisible to users with colour vision deficiency.

**Fix:** `text-[#b91c1c]` (brand warning) or the red-800/900 pattern used elsewhere.

### 2b. `border-red-200 bg-red-50 text-red-9xx` — Consistent but Off-Brand
The majority of inline error banners use this Tailwind semantic pattern:

```tsx
className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900"
```

Found in: [BroadcastComposer.tsx:718](apps/web/src/components/broadcasts/BroadcastComposer.tsx#L718), [RotaClient.tsx:1383](apps/web/src/components/rota/RotaClient.tsx#L1383), [AttendanceClockClient.tsx:185](apps/web/src/components/attendance/AttendanceClockClient.tsx#L185), [FinanceHubClient.tsx:716](apps/web/src/components/finance/FinanceHubClient.tsx#L716), and ~20 more locations.

These are internally consistent but use Tailwind's semantic red palette rather than the brand `--campsite-warning` token. The visual result is slightly warmer red than the brand red.

### 2c. `text-[#b91c1c]` — Correct Brand Usage
Used correctly in some places:

- [AdminOverviewView.tsx:123](apps/web/src/components/admin/AdminOverviewView.tsx#L123) — pending count display
- [admin/hr/absence-reporting/page.tsx:93](apps/web/src/app/(main)/admin/hr/absence-reporting/page.tsx#L93) — error message

### 2d. Mixed shades in the same file
[ProfileSettings.tsx](apps/web/src/components/ProfileSettings.tsx) uses `text-red-500`, `text-red-800`, `text-red-950`, `border-red-200`, and `bg-red-50` — five different red shade variants in a single component.

### 2e. Stale/warning state uses Amber instead of brand colour
Dashboard stale data banners ([DashboardHome.tsx:97-106](apps/web/src/components/dashboard/DashboardHome.tsx#L97)):

```tsx
<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
  Refreshing dashboard data...
</div>
```

Also: [AppShell.tsx:1330](apps/web/src/components/AppShell.tsx#L1330), [profile/page.tsx:470](apps/web/src/app/(main)/profile/page.tsx#L470), [pending/page.tsx:93](apps/web/src/app/(main)/pending/page.tsx#L93).

Amber is not part of the brand palette. The brand system has `--campsite-warning` for error and no dedicated amber/warning-only token.

### 2f. Success states use Emerald instead of brand success
[InterviewScheduleClient.tsx:204](apps/web/src/app/(main)/admin/interviews/InterviewScheduleClient.tsx#L204), [JobPipelineClient.tsx:721](apps/web/src/app/(main)/admin/jobs/%5Bid%5D/applications/JobPipelineClient.tsx#L721), [AttendanceSettingsClient.tsx:95](apps/web/src/components/attendance/AttendanceSettingsClient.tsx#L95), [OfferSignClient.tsx:140](apps/web/src/app/(public)/jobs/offer-sign/%5Btoken%5D/OfferSignClient.tsx#L140):

```tsx
className="border-emerald-200 bg-emerald-50 text-emerald-950"
```

The brand has `--campsite-success: #15803d`. These components bypass it in favour of Tailwind's `emerald` semantic palette.

### Off-brand Tailwind semantic colour count summary

| Colour family | Instances | Where |
|---|---|---|
| `red-xxx` (not brand red) | ~55 | Error banners, badges, buttons |
| `amber-xxx` | ~15 | Warning banners, degraded state, register |
| `emerald-xxx` | ~12 | Success banners, status indicators |
| `green-xxx` | ~5 | Success indicators |
| Total | **~87** | Across 30+ files |

---

## 3. Role Badge Duplication

`roleBadgeClass` is defined **twice** with near-identical content:

**[AdminOverviewView.tsx:10-22](apps/web/src/components/admin/AdminOverviewView.tsx#L10):**
```tsx
function roleBadgeClass(role: string): string {
  const m: Record<string, string> = {
    org_admin:      'bg-[#1a1a1a] text-[#faf9f6]',
    super_admin:    'bg-[#1a1a1a] text-[#faf9f6]',
    manager:        'bg-[#14532d] text-[#86efac]',
    coordinator:    'bg-[#3b0764] text-[#d8b4fe]',
    administrator:  'bg-[#431407] text-[#fdba74]',
    duty_manager:   'bg-[#292524] text-[#e7e5e4]',
    csa:            'border border-[#d8d8d8] bg-[#f5f4f1] text-[#6b6b6b]',
    society_leader: 'bg-[#fef3c7] text-[#92400e]',
  };
  return m[role] ?? 'border border-[#d8d8d8] bg-[#f5f4f1] text-[#6b6b6b]';
}
```

**[AdminUsersClient.tsx:36-48](apps/web/src/components/admin/AdminUsersClient.tsx#L36)** (named `rolePillClass`):
```tsx
function rolePillClass(role: string): string {
  const m: Record<string, string> = {
    unassigned:     'bg-[#fef3c7] text-[#92400e]',  // ← extra role not in overview
    org_admin:      'bg-[#1a1a1a] text-[#faf9f6]',
    manager:        'bg-[#14532d] text-[#86efac]',
    // ... identical for all other roles
  };
}
```

**Issues:**
1. The `unassigned` role in `AdminUsersClient` maps to `bg-[#fef3c7] text-[#92400e]` — the exact same colour as `society_leader`. If both appear together in a user list they are visually indistinguishable.
2. `AdminOverviewView` has `super_admin` but `AdminUsersClient` does not.
3. Any new role requires editing two files. This has already drifted once.

---

## 4. Duplicated Utility Logic

Three pure utility functions are copy-pasted across files:

### `statFillPct`
- [DashboardHome.tsx:12-15](apps/web/src/components/dashboard/DashboardHome.tsx#L12)
- [AdminOverviewView.tsx:5-8](apps/web/src/components/admin/AdminOverviewView.tsx#L5)

Identical function: `(value, cap) => Math.min(100, Math.max(10, Math.round((value / cap) * 100)))`.

### `initials`
- [AppShell.tsx:44-49](apps/web/src/components/AppShell.tsx#L44)
- [AdminUsersClient.tsx:75-80](apps/web/src/components/admin/AdminUsersClient.tsx#L75)

Identical function for generating 1-2 character initials from a full name.

### Stat tile styles
- [DashboardHome.tsx:28-29](apps/web/src/components/dashboard/DashboardHome.tsx#L28): `const statTileClass = 'rounded-xl border border-[#d8d8d8] bg-white px-5 py-[18px] transition-[box-shadow,transform]...'`
- [AdminOverviewView.tsx:31-32](apps/web/src/components/admin/AdminOverviewView.tsx#L31): `StatShell` component with the same classes

The dashboard and admin overview implement the same visual card component independently.

---

## 5. Page Max-Width Fragmentation

There is no agreed max-width for pages. Seven distinct values are in use:

| Max-width | Approx px | Pages |
|---|---|---|
| `max-w-6xl` | 1152px | Admin Overview, Admin Users, Offer Templates, Application Forms, Pending Approvals — **main standard** |
| `max-w-[90rem]` | 1440px | Finance, Reports, Wagesheets, Timesheets, Attendance Settings |
| `max-w-[96rem]` | 1536px | Manager Org Chart (full view) |
| `max-w-7xl` | 1280px | Profile page |
| `max-w-5xl` | 1024px | Absence Reporting, HR Jobs Preview, HR sub-pages |
| `max-w-4xl` | 896px | HR Custom Fields, Settings |
| `max-w-3xl` | 768px | Attendance, HR Employee limited view, Offer preview |
| `max-w-2xl` | 672px | Pending (error states), HR Org-chart placeholder |
| `max-w-lg` | 512px | Pending approval/waiting states |

The Finance section (`max-w-[90rem]`) sits next to Admin pages (`max-w-6xl`) in the same navigation — switching between them produces a noticeable content-width jump on large screens.

The Profile page (`max-w-7xl`) is significantly wider than the surrounding admin pages.

---

## 6. Vertical Padding Inconsistency

Pages use at least four different top/bottom padding patterns:

| Pattern | Pages |
|---|---|
| `py-7` (28px) | Admin Overview, Offer Templates, Application Forms, Pending Approvals — main standard |
| `py-8` (32px) | Finance, Reports, HR pages, Attendance, Manager pages, Admin HR |
| `py-10` (40px) | Pending error states, HR Org-chart placeholder |
| `pt-6 pb-10` | Settings page (asymmetric) |

Within the `Finance` sub-section all pages consistently use `py-8` — but this means switching from an Admin page to a Finance page shifts the content down by 4px instantly.

---

## 7. H1 Heading Scale Inconsistency

Three different heading sizes are used for primary page titles with no clear semantic reason for the difference:

| Size | Used on |
|---|---|
| `text-[28px]` | Dashboard, People (HR), Finance, Reports, Manager Org Chart, Hiring Workspace, all Finance sub-pages, Job Preview |
| `text-[26px]` | Admin Overview, Attendance, Offer Templates, Applications, Job Pipeline, Interview Schedule, Application Forms |
| `text-[22px]` | Settings, Pending Approvals, Pending error states |

The `text-[22px]` pages also use `tracking-tight` instead of `tracking-[-0.03em]` (the pattern used everywhere else), making these headings visually looser.

Additionally, [admin/hr/[userId]/page.tsx:62](apps/web/src/app/(main)/admin/hr/%5BuserId%5D/page.tsx#L62) uses `text-[26px] leading-tight text-[#121212]` with **no `tracking` at all** — the only h1 heading missing the tracking class.

---

## 8. Pages With No Layout Wrapper

Several pages render their client components directly without a page-level layout div. This is intentional for some (full-screen graphs) but inconsistent for others:

### `/hr/page.tsx` — Missing max-width constraint
```tsx
return (
  <div className="font-sans text-[#121212]">
    <div className="mb-7">
      <h1 className="font-authSerif text-[28px]...">People</h1>
      ...
    </div>
    <HrOverviewSnapshotClient ... />
  </div>
);
```

No `mx-auto max-w-*` wrapper. Content width is entirely determined by the `workspace-fluid` class on the parent. The `font-sans` is also redundant — it is already the body default.

### `/admin/system-overview/page.tsx` — Intentional full-screen
Renders `SystemOverviewGraphClient` with no wrapper. This is appropriate for a graph canvas, but there is no visual transition or header that matches surrounding pages — arriving from any other Admin page gives a jarring layout shift.

### `/admin/broadcasts/page.tsx`, `/admin/recruitment/page.tsx` — No wrapper
These render their client components bare. The client components own their layout, which can lead to drift if the client component's header ever gets removed or changed.

---

## 9. Border Colour Inconsistency

Standard border across the app: `#d8d8d8` (matches `--campsite-border`).

**Exception:** [admin/hr/[userId]/page.tsx:61](apps/web/src/app/(main)/admin/hr/%5BuserId%5D/page.tsx#L61):
```tsx
<div className="rounded-2xl border border-[#e8e8e8] bg-white p-6">
```

`#e8e8e8` is lighter than the standard `#d8d8d8`. This card will have a visibly thinner/softer border than every other card in the application.

---

## 10. `bg-white` vs `bg-[#faf9f6]` — Card Background Tension

Stat tiles and content cards use `bg-white` (pure `#ffffff`):
- [AdminOverviewView.tsx:32](apps/web/src/components/admin/AdminOverviewView.tsx#L32): `bg-white`
- [DashboardHome.tsx:29](apps/web/src/components/dashboard/DashboardHome.tsx#L29): `bg-white`

The page background is `--campsite-bg: #faf9f6` (warm cream). On most screens the difference between pure white and `#faf9f6` is subtle but noticeable — cards pop slightly against the cream background. This is likely intentional, but some components use `bg-[#faf9f6]` as card backgrounds (e.g. the dashed preview box in [application-forms/[id]/preview/page.tsx:50](apps/web/src/app/(main)/hr/hiring/application-forms/%5Bid%5D/preview/page.tsx#L50)), making the surface treatment inconsistent.

---

## 11. Subscription-Suspended Page — Orphan Styling

[subscription-suspended/page.tsx](apps/web/src/app/(main)/subscription-suspended/page.tsx):
```tsx
<Link href="/login" className="text-amber-400/90 underline-offset-4 hover:underline">
```

This uses `text-amber-400/90` — bright yellow-amber text, presumably on a dark background. It is a state page with unique styling, but `amber-400` is not in the brand palette at all. The page likely renders on a dark background (implied by the route name) but this is the only place in the whole app using `amber-400`.

---

## 12. Register Done Page — Amber for "Pending" State

[register/done/page.tsx:66-78](apps/web/src/app/(auth)/register/done/page.tsx#L66):
```tsx
<div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-amber-100 text-[32px]">
<span className="mb-6 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11.5px] font-medium text-amber-900">
  ⏳ Awaiting approval
</span>
```

The post-registration "pending" screen uses amber to communicate waiting state. The Admin Overview uses `text-[#b91c1c]` (brand red) for pending counts. These two views of the same concept — "awaiting approval" — use completely different colours.

---

## 13. `finance/page.tsx` — Inconsistent Routing Pattern

[finance/page.tsx](apps/web/src/app/(main)/finance/page.tsx) fetches permissions with a direct Supabase call (`supabase.from('profiles').select(...)`) rather than through `getCachedMainShellLayoutBundle()` + `parseShellPermissionKeys()` — the pattern used by every other page in the admin section.

This is an architecture inconsistency that means the Finance page:
- Does not benefit from the shared shell bundle cache
- Makes a redundant DB call (org_id/status already available from shell bundle)
- Is the only admin-area page that bypasses `getCachedMainShellLayoutBundle`

This is not a visual issue but it directly affects page load performance and code consistency.

---

## 14. `font-sans` Explicit Declaration Inconsistency

Some pages explicitly add `font-sans` to their root div despite it being set as the `body` default:
- [hr/page.tsx:11](apps/web/src/app/(main)/hr/page.tsx#L11): `<div className="font-sans text-[#121212]">`
- [manager/org-chart/page.tsx:11](apps/web/src/app/(main)/manager/org-chart/page.tsx): `font-sans text-[#121212]`
- [reports/page.tsx:11](apps/web/src/app/(main)/reports/page.tsx#L11): `font-sans text-[#121212]`

These are redundant. The rest of the app does not set `font-sans` explicitly on page wrappers, so these pages have an extra class that does nothing and introduces maintenance confusion.

---

## 15. AppShell Amber Badge — Nav Notification Count

[AppShell.tsx:123](apps/web/src/components/AppShell.tsx#L123):
```tsx
className="min-w-[18px] rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[10px] font-semibold text-amber-950"
```

Navigation badge counters (e.g. pending approval count in the sidebar) use `bg-amber-400`. This is the only amber element in the shell chrome. The brand would suggest using the warning red (`#b91c1c`) for urgent counts, or the accent black (`#121212`) for neutral counts. `bg-amber-400` creates a bright yellow dot in the navigation that does not match any other element in the interface.

---

## Issue Severity Matrix

| # | Issue | Severity | File(s) | Effort to fix |
|---|---|---|---|---|
| 1 | `text-red-300` error text — fails WCAG contrast | **Critical** | admin/users/page.tsx:39 | Trivial |
| 2 | Role badge function duplicated + `unassigned`/`society_leader` colour clash | **High** | AdminOverviewView + AdminUsersClient | Small |
| 3 | Error banner colours inconsistent (red-200/50, brand red, red-300) | **High** | ~30 files | Medium |
| 4 | No page uses CSS custom properties (token bypass) | **High** | All pages | Large |
| 5 | Amber off-brand: warning banners, nav badge, register, subscription page | **High** | ~15 files | Medium |
| 6 | Emerald off-brand: success states in interviews, pipeline, attendance | **Medium** | ~10 files | Medium |
| 7 | Page max-width fragmentation (7 different values, no declared standard) | **Medium** | Finance, Reports, Profile, etc. | Small |
| 8 | H1 heading size inconsistency (22/26/28px, no standard) | **Medium** | Settings, pending, admin sections | Small |
| 9 | `statFillPct` and `initials` duplicated across components | **Medium** | Dashboard + AdminOverview + AppShell | Small |
| 10 | Vertical padding inconsistency (py-7/8/10, asymmetric settings) | **Medium** | ~20 pages | Small |
| 11 | HR page missing max-width wrapper + redundant `font-sans` | **Medium** | hr/page.tsx | Trivial |
| 12 | Border colour `#e8e8e8` vs standard `#d8d8d8` | **Low** | admin/hr/[userId]/page.tsx | Trivial |
| 13 | Stat tile style duplicated (DashboardHome vs AdminOverviewView) | **Low** | 2 components | Small |
| 14 | `font-sans` explicit on some page wrappers, absent on others | **Low** | hr, manager, reports pages | Trivial |
| 15 | `finance/page.tsx` bypasses shell bundle cache for permissions | **Low** | finance/page.tsx | Small |
| 16 | System Overview: no visual header matching surrounding admin pages | **Low** | admin/system-overview/page.tsx | Small |
| 17 | Amber "pending" on register/done vs red on Admin Overview for same concept | **Low** | register/done/page.tsx | Trivial |

---

## Recommended Fix Order

### Phase 1 — Quick wins (1–2 hours total)
1. Fix `text-red-300` → `text-[#b91c1c]` in [admin/users/page.tsx:39](apps/web/src/app/(main)/admin/users/page.tsx#L39)
2. Fix `border-[#e8e8e8]` → `border-[#d8d8d8]` in [admin/hr/[userId]/page.tsx:61](apps/web/src/app/(main)/admin/hr/%5BuserId%5D/page.tsx#L61)
3. Remove redundant `font-sans` from hr/page.tsx, manager/org-chart, reports
4. Add `mx-auto max-w-6xl px-5 py-7 sm:px-7` wrapper to hr/page.tsx to match standard
5. Standardise `tracking-[-0.03em]` on h1 headings that use `tracking-tight`

### Phase 2 — Colour standardisation (half day)
6. Extract `roleBadgeClass` to `lib/roleBadgeClass.ts`, fix `unassigned`/`society_leader` colour clash
7. Extract `statFillPct` to `lib/format/statFillPct.ts`
8. Extract `initials` to `lib/format/initials.ts`
9. Establish a standard error banner component to unify `border-red-200 bg-red-50` vs `text-[#b91c1c]`
10. Replace `bg-amber-400` nav badge with brand-consistent colour

### Phase 3 — Layout standardisation (half day)
11. Document the intended max-width standard for each section (admin=6xl, finance=90rem) in a CLAUDE.md note
12. Standardise H1 sizes to two values: `text-[28px]` for main hubs, `text-[26px]` for sub-pages
13. Standardise vertical padding to `py-7` for admin/standard pages, `py-8` for wide finance/report pages

### Phase 4 — Token adoption (ongoing, per-component)
14. Migrate components to use `campsite.*` Tailwind utilities or CSS vars rather than hardcoded hex (start with the most-visited components: DashboardHome, AdminOverviewView, AdminUsersClient)

---

## Brand Colour Reference (for quick fixes)

| Semantic role | Correct class | Token |
|---|---|---|
| Primary text | `text-[#121212]` | `--campsite-text` |
| Secondary text | `text-[#6b6b6b]` | `--campsite-text-secondary` |
| Muted text | `text-[#9b9b9b]` | `--campsite-text-muted` |
| Border | `border-[#d8d8d8]` | `--campsite-border` |
| Surface | `bg-[#f5f4f1]` | `--campsite-surface` |
| Page background | `bg-[#faf9f6]` | `--campsite-bg` |
| Error / warning | `text-[#b91c1c]` | `--campsite-warning` |
| Success | `text-[#15803d]` | `--campsite-success` |
| Primary CTA bg | `bg-[#121212]` | `--campsite-accent` |
| Primary CTA text | `text-[#faf9f6]` | inverse of accent |
