# Page Balance Exception Register
**Date:** 2026-05-01  
**Purpose:** Explicitly classify remaining non-high inventory flags after Stage G closure.

---

## Current Status

- Latest inventory: `reports/route-audit/route-inventory-20260501-081108.csv`
- High-priority imbalance routes: `0`
- Remaining flagged routes: `25` (`medium/low` only)

These are treated as **intentional/simple direct-read surfaces** unless noted otherwise, and are not release blockers for the current balance objective.

---

## Medium Priority (18) — Disposition

All routes in this section are classified as **intentional direct-read** with bounded/simple query shape, no mixed read model, and no unresolved cache-invalidation dependency for critical high-touch closure scope.

- `/admin/broadcasts` — intentional direct-read admin utility surface
- `/admin/categories` — intentional direct-read admin utility surface
- `/admin/discount` — intentional direct-read admin utility surface
- `/admin/integrations` — intentional direct-read admin utility surface
- `/admin/notifications` — intentional direct-read admin utility surface
- `/admin/scan-logs` — intentional direct-read admin utility surface
- `/admin/settings` — intentional direct-read admin utility surface
- `/founders` — intentional founder plane exception (already documented)
- `/hr/jobs/[id]/preview` — bounded detail route; acceptable direct-read behavior
- `/finance` — single-query operational surface; acceptable direct-read behavior
- `/notifications/calendar` — single-query notification surface; acceptable direct-read behavior
- `/notifications/hr-metrics` — single-query notification surface; acceptable direct-read behavior
- `/notifications/leave` — single-query notification surface; acceptable direct-read behavior
- `/notifications/recruitment` — single-query notification surface; acceptable direct-read behavior
- `/one-on-ones` — single-query personal workspace surface; acceptable direct-read behavior
- `/one-on-ones/[meetingId]` — bounded detail personal workspace surface; acceptable direct-read behavior
- `/pending-approvals` — single-query action queue surface; acceptable direct-read behavior
- `/manager/org-chart` — single-query manager utility surface; acceptable direct-read behavior

---

## Low Priority (7) — Disposition

All routes in this section are **public/job-candidate surfaces** or root landing where direct reads are acceptable in the current model and are not part of Stage G high-touch enterprise consistency closure.

- `/jobs/[slug]`
- `/jobs/[slug]/apply`
- `/jobs/me`
- `/jobs/me/[applicationId]`
- `/jobs/offer-sign/[token]`
- `/jobs/status/[token]`
- `/`

---

## Guardrails

- Any route moving from `direct query` to `mixed` or `high` in future inventory must be treated as regression and added to a remediation slice.
- Any new page with fan-out + direct reads in `admin/hr/main/manager` surfaces must default to shared-loader pattern.
- Re-run inventory at each release candidate and compare against this register.

---

## Release Interpretation

Balance closure objective for critical route consistency is met with:

- `high-priority = 0`
- explicit exception register for remaining `medium/low` direct-read surfaces
- maintained lint/typecheck/inventory evidence for all Stage G slices
