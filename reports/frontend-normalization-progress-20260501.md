# Frontend Normalization Progress
**Date:** 2026-05-01  
**Goal:** Make frontend page styling and setup consistent across routes.

---

## Completed In This Pass

## Route-level wrapper/heading normalization
- `/hr`
- `/reports`
- `/settings`
- `/pending`
- `/admin/system-overview`
- `/admin/broadcasts`
- `/admin/recruitment`
- `/manager/org-chart`
- `/subscription-suspended`
- `/hr/hiring/application-forms/[id]/preview`
- `/hr/jobs/[id]/preview`
- `/admin/hr/[userId]` (limited-view branch)
- `/profile` (wrapper spacing + delayed-data banner tone)
- `/resources/[id]` (surface token alignment + archived-state tone)
- `ProfileSettings` status colors and danger zone treatment normalized
- `AppShell` degraded banner and attention badge normalized away from amber palette
- `DashboardHome` stale/partial banners normalized to shared warning surface
- Remaining alert banners normalized across additional frontend modules:
  - `PendingApprovalsClient`
  - `BroadcastComposer`
  - `AttendanceClockClient`
  - `TimesheetReviewClient`
  - `RotaClient`
  - `RotaRequestsPanel`
  - `ResourcesListClient`
  - `ResourceDetailClient`
  - `HrMetricAlertsSettingsClient`
  - `ManagerDashboardClient`
  - `HRDirectoryClient`
  - `/pending` page alerts
- Additional route-critical form/modal feedback normalized to shared status classes:
  - `AdminJobEditClient`
  - `GlobalActionFeedbackBridge`
  - `OfferSignClient`
  - `OfferTemplateFormClient`
  - `GenerateOfferModal`
  - `HiringApplicationFormEditorClient`
  - `AdminJobAdminLegalClient`
  - `JobPipelineClient`
  - `InterviewScheduleClient`
  - `ApplyJobFormClient`
  - `BroadcastsClient`

## Accessibility/brand consistency fixes
- `/admin/users`
  - Replaced low-contrast error text with accessible error treatment.
- `/pending`
  - Replaced amber verification banner with core neutral/paper style.
- `/register/done`
  - Replaced amber pending chip and icon surface with core neutral/paper style.
- `/subscription-suspended`
  - Removed amber link treatment; aligned with standard link/text style.
- `/profile`
  - Replaced amber delayed-data notices with core neutral warning surface.
- `/resources/[id]`
  - Replaced amber archived banner with core neutral warning surface.
- Shared
  - Added reusable status banner utility classes in `globals.css`:
    - `status-banner-success`
    - `status-banner-error`
    - `status-banner-warning`

## Setup consistency fixes
- `/finance`
  - Switched access resolution to shared shell-bundle pattern (`getCachedMainShellLayoutBundle` + `parseShellPermissionKeys`) for consistency with other main routes.
  - Kept existing finance layout width but normalized spacing class usage.

---

## Remaining High-Priority Work

1. **Shell first-paint jank**
   - `apps/web/src/components/AppShell.tsx`
   - Prevent desktop sidebar margin/width jump after hydration.

2. **Finance live update jank**
   - `apps/web/src/components/finance/FinanceHubClient.tsx`
   - Reduce full `load()` churn on realtime change events.

3. **Large page decomposition / contract hardening**
   - `/profile`
   - `/settings` (`ProfileSettings` component internals)
   - `/resources/[id]` vs resources list consistency

4. **Cross-route shared primitives**
   - Enforce one reusable page container + page header contract for all `(main)` routes.

5. **Tokenization pass**
   - Replace hardcoded literals with semantic/tokenized styling in high-traffic components.

---

## Notes

- This pass focused on practical, low-risk normalization across flagged routes.
- Broader “all pages fully identical” consistency requires a second pass to centralize page primitives and refactor large route components.
