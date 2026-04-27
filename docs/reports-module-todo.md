# Reports Module TODO + Feature Check

Last updated: 2026-04-26

## Priority TODOs

### P0 - Security / correctness blockers

- [ ] Enforce org ownership validation for pin/unpin in `apps/web/src/app/api/reports/pins/route.ts` before insert/delete.
- [ ] Re-validate and enforce cross-domain guardrails (`hr` + `finance`) on report update in `apps/web/src/app/api/reports/[id]/route.ts` (PATCH path).
- [ ] Ensure non-manage viewers cannot expand report scope via PATCH (`visibility`, `domains`, `shared_role_keys`, config shape).
- [ ] Apply department scoping consistently in `apps/web/src/app/api/reports/home/route.ts` metrics (not only headcount).
- [ ] Add defensive runtime validation for report config payloads (`fields`, `filters`, `sort`, `groupBy`, `quickFilters`) on create/update.

### P1 - Feature completeness

- [ ] Implement actual `groupBy` behavior in `apps/web/src/lib/reports/engine.ts`.
- [ ] Implement actual `quickFilters` behavior in `apps/web/src/lib/reports/engine.ts`.
- [ ] Add report edit/archive/share UX in `apps/web/src/components/reports/ReportsHomeClient.tsx`.
- [ ] Add schedule management UX (create/pause/resume/edit) wired to `/api/reports/[id]/schedule`.
- [ ] Render pinned reports, recent runs, and upcoming schedules from `/api/reports/home`.
- [ ] Add run-history panel wired to `/api/reports/[id]/runs`.

### P1 - Performance / scalability

- [ ] Move heavy filter/sort/group logic from in-memory merge to SQL/RPC-driven execution.
- [ ] Add pagination/limits in report run output model (server-side cursor or page token).
- [ ] Reduce large fan-out reads in `runReport` (currently multi-table bulk reads + in-memory joins).
- [ ] Add lightweight timing instrumentation around report run and export endpoints.

### P2 - Export quality and operations

- [ ] Replace placeholder PDF generation in `apps/web/src/app/api/reports/[id]/export/route.ts` with robust renderer/template.
- [ ] Add schedule execution mechanism (cron/worker/job) to process due rows in `report_schedules`.
- [ ] Add export/run operational visibility (status, failures, retry path).

### P2 - Testing and verification

- [ ] Add API authz tests for create/update/delete/run/export/pin/schedule endpoints.
- [ ] Add engine unit tests for filters, sorting, projection, and scoped-view behavior.
- [ ] Add tests for department-scoped viewers vs org-wide viewers.
- [ ] Add integration tests for live org chart APIs (`/api/org-chart/live`, `/api/presence/touch`).
- [ ] Run `npm run supabase:db:push` and verify migrations apply cleanly in local linked project.

## Feature Check (Current State)

### Reports foundation

- **Permissions (`reports.view`, `reports.manage`)**: Implemented
- **DB schema + RLS for reports/runs/schedules/exports/pins**: Implemented
- **Reports list/create API (`/api/reports`)**: Implemented, needs stronger validation hardening
- **Report CRUD (`/api/reports/[id]`)**: Implemented, PATCH needs stricter guardrails
- **Run API (`/api/reports/[id]/run`)**: Implemented
- **Runs history API (`/api/reports/[id]/runs`)**: Implemented
- **Schedule API (`/api/reports/[id]/schedule`)**: Implemented (CRUD-level only)
- **Export API (`/api/reports/[id]/export`)**: Implemented (CSV solid, PDF placeholder-grade)
- **Pins API (`/api/reports/pins`)**: Implemented, needs org ownership check in handler
- **Home API (`/api/reports/home`)**: Implemented, partial scope consistency

### Reports UI

- **Reports page route (`/reports`)**: Implemented
- **Builder (name/domain/fields + save)**: Implemented (basic)
- **Saved reports list + run + export buttons**: Implemented
- **Preview panel**: Implemented
- **Edit/delete/share UI**: Missing
- **Schedule UI**: Missing
- **Runs history UI**: Missing
- **Pinned/recent/scheduled widgets visible in UI**: Partial (API returns data, UI not fully surfaced)

### Engine behavior

- **Config normalization**: Implemented
- **Filter operators**: Implemented
- **Sort (single primary sort)**: Implemented
- **Field projection**: Implemented
- **Group by**: Missing (defined in type only)
- **Quick filters**: Missing (defined in type only)
- **Scalable query strategy**: Partial (works, but in-memory heavy)

### Live org chart + presence

- **Presence heartbeat column + RPC (`touch_last_seen`)**: Implemented
- **Live org chart RPC (`org_chart_live_nodes`)**: Implemented
- **Live org chart API (`/api/org-chart/live`)**: Implemented
- **Presence touch API (`/api/presence/touch`)**: Implemented
- **Interactive client graph + polling + modal quick view**: Implemented
- **Hard verification under production-like load**: Pending

## Suggested Execution Order

1. Close P0 authz/scope gaps.
2. Complete missing engine behavior (`groupBy`, `quickFilters`) and tighten validation.
3. Finish end-user feature surface (edit/share/schedule/runs widgets).
4. Address performance bottlenecks with SQL/RPC-first execution path.
5. Add tests, then run migration + endpoint verification loop.
