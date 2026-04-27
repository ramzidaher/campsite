# CampSite SaaS - Full Audit Master TODO

Last updated: 2026-04-26
Owner: Product + Engineering + QA
Scope: All known features/routes/modules in the monorepo

## How to use this checklist

- Status key: `[ ]` not started, `[~]` in progress, `[x]` done, `[!]` blocked
- Priority key: `P0` critical (security/data/release blockers), `P1` required for production completeness, `P2` hardening/quality, `P3` polish
- Do not mark a feature complete unless code + tests + auth + ops checks are all complete

---

## Global Release Gates (must pass for the whole SaaS)

### P0 Security/Authz

- [ ] Run a full authz audit per API route (read/write/delete/export/schedule paths)
- [ ] Verify every route enforces org scoping and role checks server-side
- [ ] Verify no user can access cross-org data by URL, report ID, or pin/schedule ID tampering
- [ ] Verify all sensitive mutations have explicit API checks (not only implicit DB constraints)
- [ ] Validate RLS coverage against all active tables and RPCs used by app routes

### P0 Data Integrity/Migrations

- [ ] Confirm all database behavior changes exist in migration files (no dashboard-only SQL)
- [ ] Validate migration ordering and idempotency patterns
- [ ] Push migrations in a clean linked environment and record output
- [ ] Validate TypeScript permission/types are aligned with migration-defined permissions

### P1 Testing Baseline

- [ ] Add API integration tests for every core domain (admin/hr/attendance/reports/hiring)
- [ ] Add authz tests for role matrix (Admin, HR, Manager, Finance, Employee, Candidate)
- [ ] Add end-to-end smoke tests for top critical journeys
- [ ] Add unit tests for core business logic libraries (report engine, gating logic, calculations)
- [ ] Enforce minimum test coverage threshold in CI for changed modules

### P1 Performance/Reliability

- [ ] Add timing instrumentation to known hot paths (reports runs, home dashboards, large lists)
- [ ] Validate no high-frequency path introduces unnecessary writes
- [ ] Verify pagination/limits exist for all potentially large result sets
- [ ] Add safe fallbacks and timeouts where non-critical data should fail-open
- [ ] Run controlled before/after checks for any performance-sensitive changes

### P1 Ops/Observability

- [ ] Define standard structured logs for API errors and slow requests
- [ ] Add monitorable run states for scheduled jobs/background processes
- [ ] Add error budget/SLO definitions for critical workflows
- [ ] Verify alerting coverage for auth failures, schedule failures, and export failures

---

## Cross-cutting Platform / App Shell

### P1 Navigation, gating, route consistency

- [ ] Audit all route entries in shell nav for correct permission gating and visibility
- [ ] Verify no dead nav links or inaccessible pages for allowed roles
- [ ] Validate canonical route usage (no legacy duplicates unless intentionally redirected)
- [ ] Ensure manager/hr/admin workspaces have consistent page-level access enforcement

### P2 UX and accessibility consistency

- [ ] Run accessibility sweep beyond top bar (landmarks, labels, keyboard, contrast)
- [ ] Normalize empty states/error states/loading states across workspaces
- [ ] Ensure keyboard navigation works in all dense data tables and forms

---

## Reports Module (critical in-flight area)

### P0 Security and correctness

- [ ] Harden `POST /api/reports` payload schema validation
- [ ] Harden `PATCH /api/reports/[id]` with field-level restrictions by role/scope
- [ ] Add explicit ownership/scope checks in `POST/DELETE /api/reports/pins`
- [ ] Verify run/export/schedule routes reject unauthorized report IDs and cross-org access

### P1 Functional completeness

- [ ] Add report edit UI end-to-end
- [ ] Add report archive/unarchive UI and flows
- [ ] Add share UI + role targeting UX and validations
- [ ] Add schedule management UI (create/edit/pause/delete/list status)
- [ ] Add run history UI with status, duration, and error details
- [ ] Add pinned/recent/scheduled widgets with production UX quality

### P1 Engine behavior

- [ ] Implement `groupBy` behavior in report engine
- [ ] Implement `quickFilters` behavior in report engine
- [ ] Validate multi-sort and filter operator behavior with deterministic tests
- [ ] Add server-side limits and safeguards against oversized config payloads

### P1 Schedule execution/ops

- [ ] Implement schedule executor (cron/worker/RPC trigger path)
- [ ] Add retry/backoff and failure states for scheduled runs
- [ ] Persist and expose `last_run_at`/`next_run_at` accurately
- [ ] Add ops logging/metrics for schedule execution

### P2 Export and scale

- [ ] Replace placeholder/simple PDF generation with production export path
- [ ] Add export size limits/timeouts + user-facing failure messages
- [ ] Push expensive filtering/grouping toward SQL/RPC where appropriate
- [ ] Add pagination/chunking strategy for heavy run/export paths

### P1 Tests for Reports

- [ ] API tests: create, update, pin, run, export, schedule, authz failure cases
- [ ] Engine tests: filters, sort, projection, groupBy, quickFilters, scoping
- [ ] UI tests: report creation, run preview, schedule forms, run history

---

## Live Org Chart + Presence

### P1 Functional completion

- [ ] Validate org chart data freshness behavior under normal and idle user states
- [ ] Confirm presence heartbeat and stale timeout handling are correct
- [ ] Ensure manager/admin gating behaves correctly for org chart route + API

### P2 Reliability/performance

- [ ] Measure polling impact under concurrent users
- [ ] Add guardrails for polling frequency and backoff on errors
- [ ] Add telemetry for presence touch failures and latency

### P1 Tests

- [ ] Add integration tests for `/api/org-chart/live`
- [ ] Add integration tests for `/api/presence/touch`
- [ ] Add role/scoping tests for org chart auth helper

---

## Admin Workspace

### Users, roles, teams, departments

- [ ] Verify full CRUD parity and permission boundaries for users/teams/departments/roles
- [ ] Confirm role override behavior is deterministic and auditable
- [ ] Verify all admin write paths generate audit events where expected

### System/admin operations

- [ ] Validate settings/integrations pages have proper error handling and retry UX
- [ ] Ensure admin-only routes cannot be loaded by manager/hr roles via direct URL
- [ ] Confirm all admin table pages have pagination/sort/search safeguards

### Tests

- [ ] Add API and UI tests for core admin mutation workflows
- [ ] Add regression tests for permission override panel behavior

---

## HR Workspace

### Core HR (records, custom fields, leave, one-on-ones, performance)

- [ ] Validate all HR routes enforce canonical HR permissions
- [ ] Ensure records/profile views obey department/org visibility constraints
- [ ] Confirm performance review flows have complete state transitions and guards
- [ ] Validate one-on-ones privacy boundaries by role/participant

### Hiring/recruitment/onboarding

- [ ] Validate request -> job -> application -> interview -> offer lifecycle end-to-end
- [ ] Verify template flows (offer templates, onboarding templates/runs) are complete
- [ ] Ensure no publish flow allows placeholder or invalid required content

### Tests

- [ ] Add role-matrix tests for HR routes and APIs
- [ ] Add integration tests for hiring funnel transitions and onboarding runs

---

## Manager Workspace

### P1 Role and scope enforcement

- [ ] Verify managers only access their allowed departments/teams/sub-teams
- [ ] Validate manager routes mirror backend scoping logic and cannot be bypassed
- [ ] Test manager recruitment/org-chart/system-overview access boundaries

### P2 Experience quality

- [ ] Ensure manager dashboards show scoped metrics only
- [ ] Add empty/error state consistency for manager pages

---

## Finance Workspace

### P1 Functional verification

- [ ] Validate finance page, timesheets, wagesheets, attendance settings role boundaries
- [ ] Verify payroll-adjacent calculations and totals against source data
- [ ] Confirm finance exports/reporting are permission-safe and accurate

### P2 Quality

- [ ] Add tests for finance summary calculations and edge cases
- [ ] Add performance checks for large timesheet/wagesheet datasets

---

## Attendance / Timesheets / Wagesheets / Rota

### P1 Correctness and integrity

- [ ] Validate clock in/out edge cases (timezone, duplicate taps, offline/retry)
- [ ] Verify timesheet approval/rejection and resubmission flows end-to-end
- [ ] Confirm wagesheet generation reflects approved timesheets and settings
- [ ] Validate rota imports and conflict handling

### P1 Security

- [ ] Verify employee cannot mutate another employee attendance/timesheet data
- [ ] Verify manager/finance/admin write rights are exactly as intended

### P2 Performance

- [ ] Add pagination and query constraints for large attendance/timesheet tables
- [ ] Instrument heavy list and aggregate endpoints for latency visibility

### Tests

- [ ] Add integration tests for attendance clock + timesheet lifecycle
- [ ] Add calculation tests for wagesheets and overtime rules

---

## Calendar / Events / Notifications

### Calendar

- [ ] Replace "Google Calendar sync is coming soon" stub with real integration flow
- [ ] Add connected/disconnected/syncing/error states and reconnection behavior
- [ ] Validate RSVP/manual events behavior and permission boundaries

### Notifications

- [ ] Verify notifications pages map to real backend event sources
- [ ] Ensure unread/read state behavior is consistent and persisted correctly
- [ ] Validate notification scoping by role and by org

### Tests

- [ ] Add tests for event creation/editing/RSVP and calendar filters
- [ ] Add notification delivery and visibility tests

---

## Broadcasts / Resources

### Broadcasts

- [ ] Validate create/edit/reply flows and permission boundaries
- [ ] Verify edit permissions and moderation controls are enforced server-side
- [ ] Add tests for list/detail/edit lifecycle

### Resources

- [ ] Validate create/list/detail access controls and attachments safety
- [ ] Add tests for permissions and content visibility

---

## Public Site / Marketing / Legal / Candidate Portal

### P1 Public UX completeness

- [ ] Replace all `href="#"` placeholder links with real destinations or remove them
- [ ] Ensure cookie/privacy/legal links point to valid implemented legal routes
- [ ] Verify cookie consent visibility/state logic is actually active and persisted

### Candidate portal (public jobs)

- [ ] Validate candidate auth, apply flow, profile, status, offer sign flows end-to-end
- [ ] Confirm tokenized routes expire and reject invalid/used tokens correctly
- [ ] Add abuse/rate-limit checks for public apply/auth flows

### Tests

- [ ] Add end-to-end tests for job listing -> apply -> status -> offer sign
- [ ] Add legal/cookie route tests and link integrity checks

---

## Auth / Session / Account

### P1 Security

- [ ] Validate login/register/password reset/set-password/session-choice/callback flows
- [ ] Ensure session invalidation/logout behavior is consistent across tabs/devices
- [ ] Verify all protected routes reject unauthenticated access server-side

### P2 Quality

- [ ] Add regression tests for auth edge cases and redirect loops
- [ ] Validate role bootstrapping and pending/trial/subscription gating pages

---

## Subscription / Billing / Org State

### P1 Functional correctness

- [ ] Validate org-locked, maintenance, trial-ended, subscription-suspended route behavior
- [ ] Ensure billing state transitions propagate correctly to route access and UI
- [ ] Add tests for each org state transition and expected user experience

---

## Permissions System (shared type safety + defaults)

### P0 Consistency

- [ ] Reconcile any mismatch between `packages/types` permission keys and default permission seed maps
- [ ] Confirm all new permissions are reflected in migrations, DB catalogs, and TypeScript enums/unions
- [ ] Add compile-time and runtime guardrails to prevent unknown permission keys

### P1 Tests

- [ ] Add tests proving default permission packs match canonical permission definitions
- [ ] Add migration verification scripts/tests for permission catalog drift

---

## Database / RLS / RPC Hygiene

### P0 Security integrity

- [ ] Audit RLS policies for every table read/write by app APIs
- [ ] Verify RPCs enforce caller context and never bypass org boundaries
- [ ] Review security definer functions for strict input validation and least privilege

### P1 Data lifecycle

- [ ] Finalize deletion/soft-delete/retention approach where still partial
- [ ] Align naming conventions and constraints where docs mark partial/missing
- [ ] Confirm indexes match real query patterns on high-traffic tables

---

## QA, CI, and Definition of Done

### P1 CI quality gates

- [ ] Ensure lint/typecheck/test run on every PR and block on failure
- [ ] Add targeted integration suites for high-risk domains (reports, auth, attendance)
- [ ] Add smoke test workflow for critical user journeys

### P1 Release checklist

- [ ] Require release candidate checklist sign-off: security, tests, performance, migrations
- [ ] Record production validation evidence before marking any major feature complete

---

## Suggested execution order (fastest path to production confidence)

1. **P0:** Reports authz hardening + permissions consistency + RLS audit
2. **P1:** Reports functional gaps + schedule executor + tests
3. **P1:** Attendance/Timesheets/Finance correctness + tests
4. **P1:** HR/Admin manager scope tests and route hardening
5. **P1:** Public candidate/legal/cookie/link completeness
6. **P2:** Performance hardening and observability across heavy paths
7. **P2/P3:** UX polish/accessibility consistency

---

## Ownership template (fill in)

- Reports: _owner_ / _deadline_
- Org chart + presence: _owner_ / _deadline_
- Admin: _owner_ / _deadline_
- HR + hiring + onboarding: _owner_ / _deadline_
- Attendance/timesheets/wagesheets/rota: _owner_ / _deadline_
- Finance: _owner_ / _deadline_
- Calendar + notifications: _owner_ / _deadline_
- Public jobs + legal + cookie: _owner_ / _deadline_
- Auth/session: _owner_ / _deadline_
- Permissions + DB/RLS: _owner_ / _deadline_
- QA + CI + release ops: _owner_ / _deadline_
