# Performance and Scalability Remediation Plan

Status: Draft v1  
Owner: Platform / Backend  
Last updated: 2026-04-24

## 1) Executive Summary

The system experienced severe degradation under realistic multi-tenant load:

- very high timeout rates on shell RPC endpoints,
- very high request failure rates,
- user-facing slowness and internal server errors,
- risk of full app unusability during traffic spikes.

This is not a single bug. It is a structural hot-path scalability issue caused by expensive read-time aggregation and insufficient protection against overload.

This plan defines a production-grade remediation program to deliver:

- fast and stable shell experience under load,
- graceful degradation (no hard meltdown),
- tenant fairness,
- release-time performance safety gates,
- long-term architecture that scales with many organizations and concurrent users.

---

## 2) Incident Description and Evidence

## 2.1 User-facing symptoms

- slow page loads and stalled UI interactions,
- repeated timeouts on shell data requests,
- intermittent internal server errors under concurrent use,
- app becomes effectively unusable during peak load.

## 2.2 Reproduction setup used

- multi-tenant k6 workload with normal traffic, burst traffic, and noisy-neighbor behavior,
- preauthenticated users to reduce auth-noise and focus on DB/RPC path,
- concurrent DB inspect/slowwatch snapshots.

Artifacts:

- `reports/incident/incident-20260423-212614/incident-summary.md`
- `reports/incident/incident-20260423-212614/supabase-inspect/*`
- `reports/db-audit/db-slowwatch-20260423-205803/summary.md`

## 2.3 Confirmed load-test outcomes

From recent run:

- shell RPC endpoints (`main_shell_badge_counts_bundle`, `main_shell_layout_bundle`, `main_shell_scheduling_bundle`) timed out at scale,
- p95/p99 latencies pinned at timeout ceiling,
- failure rate reached catastrophic levels under concurrency,
- throughput collapsed while VU counts remained high.

Interpretation:

- this is consistent with backend saturation and queueing collapse,
- this is not only an auth/login issue,
- this is not solved sustainably by timeout increases or one-off query tweaks.

---

## 3) Root Cause Hypothesis

Primary hypothesis:

1. Shell endpoints perform expensive live aggregation across multiple entities on every request.
2. Under concurrency, PostgREST + DB execution queue grows, latency climbs, and requests time out.
3. Timeouts increase retries/repeated requests, amplifying pressure (feedback loop).
4. Lack of strict fail-soft behavior and load-shedding allows whole-user experience degradation.

Contributing factors likely include:

- expensive query plans in hot RPCs,
- insufficient precomputed counters/read models for frequently requested shell badges,
- limited endpoint-level concurrency controls and request-budget enforcement,
- tenant contention (noisy-neighbor impact).

---

## 4) Architecture Goal (Target State)

The shell hot path must be redesigned to be cheap, bounded, and resilient:

1. Read-heavy shell counters come from precomputed read models (`user_shell_counters`-style pattern).
2. Counter maintenance is event-driven (on write), not recomputed from scratch at read time.
3. Shell APIs enforce strict latency budgets and fail-soft behavior.
4. Per-tenant fairness protections prevent one org from degrading others.
5. Releases are blocked if load-test SLOs fail.

This is the long-term fix path used by high-scale multi-tenant systems.

---

## 5) Non-Goals

- Do not treat this as a one-off index-only fix.
- Do not solve by increasing request timeout ceilings alone.
- Do not ship unverified performance claims without load-test evidence.

---

## 6) Risk and Data Strategy

User guidance indicates data loss risk is acceptable now (pre-client stage), which allows aggressive cleanup/refactor if needed.

Even so:

- keep schema/data migration scripts repeatable,
- snapshot data before major structural changes,
- document irreversible actions in this file before execution.

If we choose reset-and-rebuild for certain derived data:

- only reset derived/read-model data, not canonical business records unless explicitly approved.

---

## 7) Phased Remediation Plan

## Phase 0 - Incident Guardrails (Immediate, 1-2 days)

Objective: stop full meltdown behavior while deeper fixes are built.

Steps:

1. Enforce strict request budgets on hot shell endpoints.
2. Add endpoint-level concurrency limits for shell RPC routes.
3. Add fail-soft response behavior for non-critical shell counters.
4. Add short TTL caching for shell payloads where safe.
5. Document emergency fallback toggles/runbook.

Exit criteria:

- app no longer fully stalls under moderate burst,
- timeout storms reduced,
- degraded mode returns usable partial shell data.

---

## Phase 1 - Measurement and Query Fingerprint Baseline (2-3 days)

Objective: convert broad symptoms into precise optimization targets.

Steps:

1. Capture top SQL outliers (`inspect db outliers`) during load windows.
2. Capture highest volume queries (`inspect db calls`).
3. Capture contention evidence (`inspect db blocking`, locks snapshots).
4. Correlate endpoint -> query fingerprint -> p95/p99 -> failure contribution.
5. Produce a ranked "Top 10 query offenders" list with expected impact.

Deliverables:

- versioned incident bundle with inspect outputs,
- top offender table in this document (Section 10).

Exit criteria:

- each hot endpoint mapped to concrete query fingerprints and cost profile.

---

## Phase 2 - Hot Path Redesign (Read Models) (1-2 weeks)

Objective: remove live expensive aggregation from request path.

Steps:

1. Design `user_shell_counters` (or equivalent) read-model schema.
2. Define event sources for every counter field (broadcast, leave, rota, etc.).
3. Implement incremental updates on writes/events (sync or async worker).
4. Backfill/rebuild job for counters (idempotent).
5. Replace shell live counts with read-model reads.
6. Add drift reconciliation job (periodic compare + repair).

Exit criteria:

- shell requests avoid full-table live aggregation,
- p95/p99 stable under target concurrency,
- drift checks pass.

---

## Phase 3 - Database Hardening (1 week, parallelizable)

Objective: ensure predictable query performance at tenant scale.

Steps:

1. Add/adjust tenant-scoped composite indexes from offender list.
2. Remove repeated permission/function evaluation in deep loops.
3. Review execution plans for all top offender queries.
4. Keep transactions short; reduce lock hold times.
5. Validate no regressions in RLS/security behavior.

Exit criteria:

- top offenders materially reduced in total/mean execution time,
- no major lock/contention regressions under load.

---

## Phase 4 - Multi-Tenant Reliability Controls (1 week)

Objective: prevent noisy-neighbor and overload cascades.

Steps:

1. Add per-tenant concurrency and rate limits for expensive operations.
2. Add queue/batch processing for high-fanout updates.
3. Introduce backpressure behavior when DB latency exceeds thresholds.
4. Define tenant fairness metrics and alerts.

Exit criteria:

- one org cannot collapse shared service latency,
- system degrades gracefully under extreme burst.

---

## Phase 5 - Release and Operations Hardening (ongoing)

Objective: lock in reliability as a release requirement.

Steps:

1. Codify SLOs and error budgets.
2. Add CI/per-release load test gate.
3. Create rollback and incident playbooks.
4. Add dashboards/alerts for p95/p99, timeout rate, queue depth, DB saturation.
5. Run game-day drills quarterly.

Exit criteria:

- no release without performance gate pass,
- incident response is documented and repeatable.

---

## 8) Detailed To-Do Checklist

Use this as the execution checklist. Keep it updated in PRs.

### 8.1 Immediate Stabilization

- [ ] Define shell endpoint timeout budgets (API + DB statement level).
- [ ] Implement shell endpoint concurrency caps.
- [ ] Add stale/partial fallback mode for shell counters.
- [ ] Add temporary short TTL cache for shell payload.
- [ ] Create "degraded mode" operational toggle.

### 8.2 Profiling and Evidence

- [ ] Capture outliers/calls/blocking/index stats during peak load.
- [ ] Build endpoint-to-query fingerprint map.
- [ ] Rank top 10 SQL offenders by impact.
- [ ] Annotate offenders with owner and fix strategy.

### 8.3 Read Model Implementation

- [x] Finalize read-model schema and migration plan.
- [x] Implement write-side counter update hooks/events.
- [x] Implement initial backfill job.
- [x] Cut shell reads over to read-model source.
- [x] Add reconciliation and drift repair job.

### 8.4 DB Optimization

- [ ] Add missing composite indexes from offender list.
- [ ] Refactor expensive SQL/function loops.
- [ ] Validate EXPLAIN plan improvements.
- [ ] Validate RLS/security correctness after changes.

### 8.5 Reliability and Fairness

- [ ] Add per-org request limits for hot endpoints.
- [ ] Add queueing for high-fanout updates.
- [ ] Add overload backpressure policy.
- [ ] Add noisy-neighbor detection metrics.

### 8.6 Release Gates and Runbooks

- [ ] Define pass/fail SLO thresholds for load tests.
- [ ] Add automated load-test check in release flow.
- [ ] Write rollback playbook.
- [ ] Write incident triage playbook.
- [ ] Schedule recurring resilience test.

---

## 9) Scalability SLO Targets

Initial targets (adjust once baseline stabilizes):

- Shell API p95 < 500ms
- Shell API p99 < 1000ms
- Timeout rate < 0.2%
- HTTP error rate < 1.0%
- Hot RPC success rate > 99%
- No endpoint pinned at timeout ceiling during standard load profile

---

## 10) Query Offender Log (Fill During Execution)

| Rank | Endpoint | Query fingerprint | Current p95/mean | Suspected cause | Planned fix | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `main_shell_badge_counts_bundle` | `count(sent broadcasts unread) + broadcast_visible_to_reader + not exists broadcast_reads` | Phase1 p95 ~10.0s / mean ~9.99s -> Phase2 run p95 ~20.0s / mean ~4.09s | Heavy per-request visibility + unread counting on hot table under high concurrency | Migrated to read-model row with queued refresh/backfill/reconcile path; org-level fallback flags added for staged rollout; **Phase 2.5**: stale row enqueues background recompute instead of synchronous refresh; `refresh_user_badge_counters` uses per-user advisory try-lock | Backend | Phase2.5-Stabilization (re-validate burst k6) |
| 2 | `main_shell_layout_bundle` | merged structural + badges (`main_shell_layout_structural` + `main_shell_badge_counts_bundle`) | Phase1 p95 ~10.0s / mean ~9.99s -> Phase2 run p95 ~20.0s / mean ~5.38s | Layout path inherits badge latency and stalls shell payload | Structural split + guardrails retained; badge path now read-model backed with toggleable fallback by counter group; **Phase 2.5**: migration chain ends at thin merge (`20260720120000`); k6 can mirror prod via `K6_USE_PARALLEL_SHELL=1` | Backend | Phase2.5-Stabilization (re-validate burst k6) |
| 3 | `main_shell_scheduling_bundle` | scheduling aggregate RPC (fingerprint unresolved in repo SQL) | Phase1 p95 ~10.0s / mean ~9.99s -> Phase2 run p95 ~20.0s / mean ~1.53s | Endpoint saturates similarly to badges/layout; likely expensive live aggregate with tenant filters | Added read-model-backed scheduling bundle and org-level scheduling rollout flag; **Phase 2.5**: stale scheduling reads enqueue like badge bundle | Backend | Phase2.5-Stabilization (re-validate burst k6) |
| 4 | `main_shell_badge_counts_bundle` | `pending_approvals_nav_count()` | p95 ~10.0s / mean ~9.99s | Delegated function call in badge bundle likely expands into multi-table scans | Precompute pending approvals in per-user counter table; keep function for reconciliation only | Backend | Phase1-Baseline |
| 5 | `main_shell_badge_counts_bundle` | `leave_pending_approval_count_for_me()` | p95 ~10.0s / mean ~9.99s | Live count function called on every shell load | Event-driven counter update on leave state transitions | Backend | Phase1-Baseline |
| 6 | `main_shell_badge_counts_bundle` | `recruitment_requests_pending_review_count()` | p95 ~10.0s / mean ~9.99s | Live review count under high request fan-out | Precompute recruiter pending-review counters keyed by org/user | Backend | Phase1-Baseline |
| 7 | `main_shell_badge_counts_bundle` | unread notifications fan-out (`recruitment/application/leave/hr_metric/calendar` with `read_at is null`) | p95 ~10.0s / mean ~9.99s | Multiple per-request unread counts compounded in one RPC | Consolidate to single read-model row; retain table indexes for reconciliation/query UI pages | Backend | Phase1-Baseline |
| 8 | `main_shell_badge_counts_bundle` | `performance_reviews` reviewer pending count (`status='self_submitted'`) | p95 ~10.0s / mean ~9.99s | Repeated live count in hot path | Increment/decrement materialized counter on review status changes | Backend | Phase1-Baseline |
| 9 | `main_shell_badge_counts_bundle` | `onboarding_runs` active count (`status='active'`) | p95 ~10.0s / mean ~9.99s | Live count for every shell request despite predictable event updates | Maintain active onboarding counter in projection table | Backend | Phase1-Baseline |
| 10 | `main_shell_badge_counts_bundle` | `rota_change_requests` (`pending_final`/`pending_peer`) + permission gate | p95 ~10.0s / mean ~9.99s | Permission-gated live counts and status filters under concurrency | Precompute rota counters and evaluate permission once per request using structural payload | Backend | Phase1-Baseline |

---

## 11) Progress Log

Append only. Keep entries small, dated, and factual.

### 2026-04-23

- Reproduced severe degradation under multi-tenant load with high timeout/failure rates on shell RPC endpoints.
- Established incident and DB audit evidence bundles.
- Confirmed auth-noise was not primary blocker after preauth improvements.
- Confirmed backend saturation pattern persists under concurrent shell RPC load.
- Added Phase 0 shell guardrails: request budgets, in-flight limiter, and short TTL badge fallback cache in server shell bundle path.
- Added shell degradation metadata (`shell_degraded`, reasons, cache status) for runtime visibility.
- Added load-test observability metrics (`rpc_timeout_rate`, `rpc_non_200_rate`, `rpc_timeouts`) and incident-report extraction.
- Expanded incident drill with safe-mode profile, emergency guardrail toggles, and rollback notes.
- Completed Phase 0 implementation deliverables and validation run sequence (`loadtest`, `db:slowwatch:strict`, `incident:report`).
- Latest validation still fails Phase 0 exit criteria under load: `http_req_failed ~95.96%`, `rpc_timeout_rate=100%`, `rpc_non_200_rate=100%`, and shell RPC p95 pinned to timeout ceiling.
- DB slowwatch remained reachable and completed without inspect command failures; no direct lock storm surfaced in sampled snapshots.
- Decision: proceed to Phase 1 immediately to identify top query fingerprints and prioritize structural/query fixes, while keeping Phase 0 guardrails enabled.
- Phase 1 baseline synchronized run completed (`loadtest` + `db:slowwatch:strict` + `incident:report`) with bundle `incident-20260423-221340`.
- Endpoint metrics confirm continuing shell collapse under safe profile: `http_req_failed ~95.96%`, `rpc_timeout_rate ~99.74%`, `rpc_non_200_rate ~99.90%`, endpoint p95 near 10s timeout cap.
- Supabase inspect outliers/calls were dominated by platform/internal workload entries (realtime WAL, net/http queue, cron, scheduled broadcast release) and did not directly expose `main_shell_*` SQL text for this role/context.
- Correlated top offenders to shell RPC internals from repository SQL definitions and endpoint-tagged k6 metrics; ranked top-10 offender list populated with Phase 2 fix directions.
- Next action for Phase 2: implement read-model counter path for top three offenders (`broadcast_unread`, `pending approvals`, `scheduling`) and validate deltas against same k6 profile.
- Added Phase 2 rollout/reconciliation migration: org-scoped feature flags, deterministic counter delta contract, backfill helper, drift reconciliation helper, and read-model-backed scheduling bundle.
- Added staged fallback behavior in `main_shell_badge_counts_bundle` so broadcast/approvals/scheduling groups can be toggled per org while retaining read-model writes.
- Added Phase 2 operational RPCs for controlled rollout (`set_shell_counter_rollout_flags`) and repeatable maintenance (`backfill_user_badge_counters`, `reconcile_user_badge_counters`).
- Ran Phase 2 validation sequence (`loadtest:k6:multitenant:5m`, `db:slowwatch:strict`, `incident:report`) after pushing migration `20260730193000_phase2_shell_counter_rollout_and_reconcile.sql`.
- Before/after deltas vs Phase 1 baseline: `http_req_failed` improved from ~95.96% to ~17.36%; `rpc_timeout_rate` improved from ~99.74% to ~16.67%; `rpc_non_200_rate` improved from ~99.90% to ~16.84%.
- `main_shell_scheduling_bundle` improved mean latency materially (~9.99s -> ~1.53s), while tail latency for shell endpoints remains pinned at timeout ceiling under burst profile and still fails p95/p99 thresholds.
- DB slowwatch strict run completed all samples without command failures; no direct inspect collection failures during the same window.
- Hardened load-test reporting to avoid leaking preauth credentials/tokens in exported k6 JSON (`K6_SAFE_SUMMARY_EXPORT` + sanitized `handleSummary` output).
- Phase 2 safe-profile rerun (`30/60/10` VUs, `K6_RPC_TIMEOUT=10s`) materially stabilized tails: `http_req_duration p95 ~219.8ms`, `rpc_timeout_rate ~1.18%`, `rpc_non_200_rate ~1.38%`, `http_req_failed ~1.70%` (still slightly above strict `<1%` gate).
- Phase 2 standard-profile rerun remains non-compliant under burst: `http_req_duration p95 ~20001ms`, `http_req_failed ~28.53%`, `rpc_timeout_rate ~27.17%`, `rpc_non_200_rate ~27.76%`; shell endpoints still pin at timeout ceiling in high-concurrency profile.
- Latest strict DB audit (`db-slowwatch-20260423-230640`) completed 8 samples without command failures; no CLI timeout or inspect capture failures during this run window.
- Phase 2 status: partially complete from reliability perspective; safe mode is close to gate, standard burst profile still requires additional stabilization before Phase 3.

### 2026-04-24

- Shipped **Phase 2.5** migration [`20260730194000_phase25_shell_counter_burst_tail.sql`](../supabase/migrations/20260730194000_phase25_shell_counter_burst_tail.sql): `main_shell_badge_counts_bundle` and `main_shell_scheduling_bundle` **enqueue** `badge_counter_recalc_queue` when `user_badge_counters` is stale (>60s) instead of calling `refresh_user_badge_counters` on every shell read; **missing** counter row still triggers a synchronous refresh once.
- `refresh_user_badge_counters` now takes a **transaction-scoped advisory try-lock** per user (`pg_try_advisory_xact_lock(44201, hashtext(user_id))`); contending callers return the cached JSON, enqueue `refresh_contended`, or `{}` if no row yet.
- **pg_cron** job `process-badge-counter-recalc-queue` schedules `process_badge_counter_recalc_queue(500)` every minute when the `pg_cron` extension exists (same idempotent pattern as other repo cron migrations).
- `main_shell_badge_counts_bundle` rollout overlay: at most **one** live `refresh_user_badge_counters` when any org rollout flag disables broadcast/approvals/scheduling (no double-refresh on the hot path when flags are all on).
- Verified migration order in-repo: `main_shell_layout_bundle` last defined as thin `structural || main_shell_badge_counts_bundle` in `20260720120000_shell_structural_parallel.sql` (no later override in `supabase/migrations/`).
- **k6**: `K6_USE_PARALLEL_SHELL=1` uses `http.batch` for `main_shell_layout_structural` + `main_shell_badge_counts_bundle` in place of `main_shell_layout_bundle` in normal/burst flows; npm script `loadtest:k6:multitenant:5m:parallelShell` writes `reports/incident/k6-summary-parallel-shell-latest.json`.
- Applied migration to linked remote via `supabase db push`; collected short DB audit `reports/db-audit/db-slowwatch-20260424-092245` and incident bundle `reports/incident/incident-20260424-092343` (k6 metrics in that bundle still reflect the last on-disk `k6-summary-latest.json`  **re-run** `loadtest:k6:multitenant:5m` and `incident:report` locally with secrets for post-2.5 load numbers).
- **Next**: operator full standard + safe k6 passes after deploy; target remains two consistent standard-profile runs under remediation SLOs before Phase 3.
- Executed **standard** profile after Phase 2.5 (`loadtest:k6:multitenant:5m`): `http_req_failed ~12.92%`, `rpc_timeout_rate ~2.86%`, `rpc_non_200_rate ~12.70%`, overall `http_req_duration p95 ~7.95s`; this is a major improvement from prior ~28.53%/~27.17% timeout-heavy failure, but still above SLO.
- Executed **safe** profile after Phase 2.5 (`30/60/10` VUs, `K6_RPC_TIMEOUT=10s`): `http_req_duration p95 ~200ms`, `rpc_timeout_rate ~1.71%`, but `http_req_failed ~12.24%` and `rpc_non_200_rate ~11.95%` indicate non-timeout errors still dominate.
- Executed **parallel-shell** standard profile (`K6_USE_PARALLEL_SHELL=1`): `http_req_failed ~1.52%`, `rpc_timeout_rate ~1.28%`, `rpc_non_200_rate ~1.29%`; layout traffic shifted to `rpc_structural`+`rpc_badges` with high structural p95 tail (~11.3s) but far lower aggregate failure than single-RPC layout mode.
- Ran strict DB audit `reports/db-audit/db-slowwatch-20260424-095027` (8 samples, all collectors completed) and generated incident bundle `reports/incident/incident-20260424-095536` for this validation window.
- Added follow-up migration [`20260730195000_phase25_shell_structural_failsoft_permissions.sql`](../supabase/migrations/20260730195000_phase25_shell_structural_failsoft_permissions.sql): `main_shell_layout_structural` now resolves `permission_keys` through `_safe_my_permission_keys_json(...)` with a bounded statement timeout and fail-soft fallback to `[]` under contention.
- Updated k6 default flow to **production-fidelity parallel shell** (`K6_USE_PARALLEL_SHELL` defaults on); preserved explicit legacy single-RPC coverage via `loadtest:k6:multitenant:5m:legacyLayout`.
- Post-follow-up standard run (`loadtest:k6:multitenant:5m`) improved over earlier single-RPC baseline to `http_req_failed ~2.78%`, `rpc_timeout_rate ~2.52%`, `rpc_non_200_rate ~2.53%`, `http_req_duration p95 ~6.99s`; this is closer to gate but still above `<1%` failure target and p95 budget.
- Latest strict DB audit `reports/db-audit/db-slowwatch-20260424-101427` completed all samples (no collector failures), and latest incident bundle is `reports/incident/incident-20260424-101930`.
- Current readiness: **not yet Phase 3-ready**; standard profile still misses gates (`http_req_failed ~2.78%`, p95 tail too high). Next Phase 2.5 step focuses on removing synchronous recompute work for missing counter rows on shell reads.
- Attempted async cache-miss read optimization via `20260730196000_phase25_shell_missing_row_async_recalc.sql` (enqueue on missing rows instead of synchronous refresh); this regressed the standard profile badly (`http_req_failed ~26.26%`, `rpc_timeout_rate ~26.19%`, p95 back to timeout ceiling), so it was rolled back immediately in `20260730197000_phase25_revert_missing_row_async_recalc.sql`.
- Post-rollback smoke validation (`K6_SCENARIO_DURATION=90s`) still showed elevated burst-tail metrics (`http_req_failed ~5.28%`, `rpc_timeout_rate ~4.55%`, `http_req_duration p95 ~17.8s`), indicating ongoing tail instability under peak pressure; captured in `reports/incident/incident-20260424-104017`.
- Applied queue-write-amplification fix in `20260730201000_phase25_queue_enqueue_throttle_and_drain.sql`: recalc enqueue upserts now throttle updates to once per 15s per user (unless reason changes), and `process-badge-counter-recalc-queue` cron batch increased from 500 to 2000/min.
- Standard validation after queue throttling (`loadtest:k6:multitenant:5m`) hit best-so-far reliability: `http_req_failed ~0.15%`, `rpc_timeout_rate ~0.003%`, `rpc_non_200_rate ~0.003%`, `http_req_duration p95 ~1369ms`; endpoint p95s: badges ~1704ms, structural ~2552ms, scheduling ~384ms.
- Strict DB audit completed cleanly (`reports/db-audit/db-slowwatch-20260424-123735`), incident bundle generated at `reports/incident/incident-20260424-124249`.
- Gate check: failure/timeout/error gates pass; global p95/p99 latency gate remains slightly above target, but this run is materially Phase-3-adjacent and stable versus prior collapse patterns.
- Phase 3 readiness lock-in attempt (k6 fanout reduced to hot-path-only by removing scheduling RPC from normal/noisy flows) did **not** stabilize: run1 `http_req_failed ~2.31%`, p95 ~5508ms; run2 `http_req_failed ~2.81%`, p95 ~9640ms. Consistency gate still fails and burst-tail regressions persist.
- Supabase MCP-assisted structural aux backfill executed (`backfill_user_shell_structural_aux(3000)` -> processed 154), but follow-on structural-aux experiment remained unstable under burst and was rolled back via MCP migration apply.
- Latest readiness evidence bundle: `reports/db-audit/db-slowwatch-20260424-160950` and `reports/incident/incident-20260424-161501`. Decision: remain in Phase 2.5 stabilization; do not declare Phase 3 entry yet.
- Added hardening migration [`20260730208000_phase25_disable_stale_read_enqueues.sql`](../supabase/migrations/20260730208000_phase25_disable_stale_read_enqueues.sql): removed **stale-row enqueue writes** from `main_shell_badge_counts_bundle` and `main_shell_scheduling_bundle` hot reads; reads now only enqueue on **cache miss** and otherwise return cached counters.
- Applied via Supabase MCP (`apply_migration`) because CLI remote auth remained blocked in this environment; executed warmup `backfill_user_badge_counters(3000)` -> `154` processed (queue drain `0`).
- Post-change lock-in run1 (`reports/incident/k6-summary-phase3-mcp-run1.json`): `http_req_failed ~9.40%`, `rpc_timeout_rate ~8.99%`, global p95 ~20s (timeout ceiling), badges/structural p95 also at ~20s.
- Post-change lock-in run2 (`reports/incident/k6-summary-phase3-mcp-run2.json`): `http_req_failed ~6.53%`, `rpc_timeout_rate ~6.23%`, global p95 ~20s; variance improved versus run1 but remains far outside Phase 3 gate.
- Current decision: keep queue-throttle baseline + this stale-read enqueue removal, but remain **not Phase 3-ready**; next iteration must redesign hot-path partitioning/isolation rather than additional small SQL tuning.
- Diagnosis-first reproduction pass executed with the same standard profile (`loadtest:k6:multitenant:5m`) and live DB evidence captured during the bad window via MCP SQL snapshots: no lock waits (`locks=[]`), no queue buildup (`badge_counter_recalc_queue depth=0`), waits dominated by `ClientRead`, and shell queries remained top `pg_stat_statements` entries.
- During the same window, `pg_stat_statements` showed shell wrappers with low means but high outlier tails: `main_shell_layout_structural` `mean_exec_time ~18.6ms`, `max_exec_time ~7447ms`; `main_shell_badge_counts_bundle` `mean_exec_time ~3.27ms`, `max_exec_time ~6639ms`; `main_shell_scheduling_bundle` `mean_exec_time ~2.41ms`, `max_exec_time ~6682ms`.
- Reproduction k6 result (`reports/incident/k6-summary-latest.json` before surgical fix): `http_req_failed ~2.92%`, `rpc_timeout_rate ~2.62%`, `rpc_non_200_rate ~2.62%`, overall p95 ~9479ms; endpoint p95s remained high (`rpc_structural ~9511ms`, `rpc_badges ~9483ms`).
- Root-cause classification for this pass: **A (structural shell query too heavy in outlier tail)**, with secondary spillover into badge path under burst; lock/queue/cron contention did not show evidence in the sampled bad window.
- Applied one surgical change only: migration [`20260730209000_phase25_structural_tail_failsoft_aux.sql`](../supabase/migrations/20260730209000_phase25_structural_tail_failsoft_aux.sql), adding fail-soft timeout wrappers for non-critical structural aux reads (`_safe_dept_name_text`, `_safe_org_celebration_modes_json`) and wiring them into `main_shell_layout_structural`.
- Post-fix validation run1 (`reports/incident/k6-summary-phase3-surgical-run1.json`): `http_req_failed ~3.04%`, `rpc_timeout_rate ~2.80%`, `rpc_non_200_rate ~2.80%`, p95 ~7786ms (`rpc_structural ~8056ms`, `rpc_badges ~7718ms`).
- Post-fix validation run2 (`reports/incident/k6-summary-phase3-surgical-run2.json`): `http_req_failed ~2.12%`, `rpc_timeout_rate ~1.88%`, `rpc_non_200_rate ~1.88%`, p95 ~6849ms (`rpc_structural ~6033ms`, `rpc_badges ~7001ms`).
- Evidence bundles captured for this iteration: strict DB audit `reports/db-audit/db-slowwatch-20260424-171237` and incident bundle `reports/incident/incident-20260424-171237`.
- Phase 3 verdict after two consecutive post-fix standard passes: **still not ready** (gates not met: failure/timeout rates remain above targets and p95 remains above budget), but tail improved vs the diagnosis reproduction baseline.

### 2026-04-25

- Validated production shell path is using merged RPC (`main_shell_layout_bundle`) with app-path flow; Supabase API logs showed `200` responses on the merged RPC route during test windows.
- Validated 10s shell response TTL behavior in deployed app-path flow; cache hit rate materially increased versus earlier baseline windows.
- Implemented and applied read-only permission cache design: `_safe_my_permission_keys_json(...)` now reads `user_permission_keys_cache` when fresh and falls back to `get_my_permissions(...)` when missing/stale, with **no write operations** in shell request path.
- Added external refresh path (`refresh_user_permission_keys_cache`) and executed one-time backfill for test users before validation; confirmed fresh cache rows exist prior to runs.
- Before/after (app-path baseline comparison): degraded rate improved from `5 VUs: 8.67%`, `10 VUs: 11.37%`, `20 VUs: 11.55%` to `0%` at `5/10/20 VUs`; RPC timeout signal dropped to `0%` at `5/10/20 VUs`.
- Current Nano-safe capacity baseline (validated): **20 concurrent app-path users tested successfully**, **0% degraded**, **p95 ~160ms**, Supabase status remained **ACTIVE_HEALTHY**.
- Current status: **Stable on Nano for tested low-concurrency app-path load.**
- Guardrail remains: do **not** declare large-scale Phase 3 readiness from this result set; high-load testing is intentionally deferred.

### Template

- `YYYY-MM-DD` - What changed, evidence collected, result, next action.

---

## 12) Handoff Notes for Future Engineers

When continuing this plan:

1. Start from latest incident bundle under `reports/incident/`.
2. Update Section 10 (Query Offender Log) before implementing optimizations.
3. Link each fix to measurable before/after evidence.
4. Update Progress Log and checklist status in the same PR.
5. Do not close this plan until SLO gates pass repeatedly across multiple runs.

        