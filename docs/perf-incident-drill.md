# Performance Incident Drill

Use this drill when the app becomes slow, throws 500s, or times out under multi-tenant load.

## 1) Capture DB health during incident window

```bash
npm run db:slowwatch:strict
```

This writes detailed data under `reports/db-audit/db-slowwatch-<timestamp>/`:

- `summary.md` / `summary.json`: high-level signals
- `samples.json`: full per-sample outputs
- `errors/*.log`: raw stderr/stdout for failed checks

## 2) Reproduce realistic traffic pressure

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `K6_USERS_CSV` (CSV with `username,password` and ideally `org_slug`)

Run:

```bash
npm run loadtest:k6:multitenant:5m
```

This scenario includes:

- baseline multi-tenant traffic,
- burst window traffic,
- noisy-neighbor traffic from a concentrated subset of users.

Note: `loadtest:k6:multitenant:5m` now exports a sanitized summary JSON via
`K6_SAFE_SUMMARY_EXPORT`, so preauth setup tokens are excluded from artifacts.

### Safe mode profile (during incidents)

Use this profile to reduce blast radius while still collecting useful evidence:

```bash
K6_NORMAL_VUS=30 \
K6_BURST_VUS=60 \
K6_NOISY_VUS=10 \
K6_RPC_TIMEOUT=10s \
npm run loadtest:k6:multitenant:5m
```

## 3) Build one incident summary

```bash
npm run incident:report
```

Output:

- `reports/incident/incident-<timestamp>/incident-summary.md`
- `reports/incident/incident-<timestamp>/incident-summary.json`
- `reports/incident/incident-<timestamp>/supabase-inspect/*.json` (auto-captured outliers/calls/blocking/index-stats)

## 4) Production-grade acceptance gates

Do not treat issue as fixed unless all pass under repeatable load:

- `http_req_failed` < 1%
- overall `http_req_duration` p95 < 900ms, p99 < 1800ms
- DB `blocking`/`locks`/`long-running-queries` remain mostly zero
- no recurring 500/timeout spikes in API logs

## 5) Typical fix ordering

1. Resolve lock contention and long transactions.
2. Add tenant-scoped indexes for top outlier query fingerprints.
3. Tighten statement/request timeouts and retry behavior.
4. Add endpoint-level concurrency controls for heavy write/read flows.
5. Re-run full drill and compare results.

## 5.1 Phase 2 read-model operations

Run these before validation after deploying migrations:

```bash
# backfill active users into the counter cache
select public.backfill_user_badge_counters(1000);

# process any remaining queue entries
select public.process_badge_counter_recalc_queue(1000);

# reconcile drift for migrated fields
select * from public.reconcile_user_badge_counters(null, 1000);
```

For staged rollout by org:

```sql
-- disable one migrated group if rollback is needed
select public.set_shell_counter_rollout_flags(
  '<org-id>'::uuid,
  true,   -- broadcast_enabled
  true,   -- approvals_enabled
  false   -- scheduling_enabled
);
```

## 6) Emergency guardrail toggles (shell hot path)

These environment variables control Phase 0 shell guardrails:

- `CAMPSITE_SHELL_BADGE_RPC_TIMEOUT_MS` (default `800`)
- `CAMPSITE_SHELL_STRUCTURAL_RPC_TIMEOUT_MS` (default `1500`)
- `CAMPSITE_SHELL_BADGE_CACHE_TTL_MS` (default `10000`)
- `CAMPSITE_SHELL_BADGE_RPC_MAX_IN_FLIGHT` (default `30`)

Recommended incident-first profile:

```bash
CAMPSITE_SHELL_BADGE_RPC_TIMEOUT_MS=500
CAMPSITE_SHELL_STRUCTURAL_RPC_TIMEOUT_MS=1200
CAMPSITE_SHELL_BADGE_CACHE_TTL_MS=15000
CAMPSITE_SHELL_BADGE_RPC_MAX_IN_FLIGHT=20
```

## 7) Rollback notes

If guardrails cause unexpected behavior:

1. Revert to defaults above by unsetting overrides.
2. Disable incident load test runs while recovering.
3. Regenerate incident bundle (`incident:report`) and compare pre/post metrics.
4. Document rollback reason in `docs/performance-scalability-remediation-plan.md` progress log.
