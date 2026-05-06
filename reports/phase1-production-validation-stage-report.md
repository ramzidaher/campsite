# Phase 1 Stage Report  Production Validation
**Date:** 2026-04-30
**Follow-up to:** `reports/phase1-code-closure-stage-report.md`
**Status:** COMPLETE  Phase 1 validation passed against the architecture plan gate

---

## What Was Run

Command:

```bash
npm run probe:prod:routes -- --maxUsers 6 --concurrency 3 --tabsPerUser 3 --iterationsPerUser 12
```

Generated incident bundle:

- `reports/incident/prod-route-thrash-20260430-152713/summary.md`
- `reports/incident/prod-route-thrash-20260430-152713/summary.json`

Run shape:

- 6 real signed-in users
- 3 tabs per user
- 12 iterations per user
- 72 page requests total
- 72 shell snapshots total

---

## Verified Results

### Pages

- Count: `72`
- Avg duration: `936ms`
- p95 duration: `3092ms`
- Timeouts: `0`
- Login redirects: `0`
- Status distribution: `200:72`

Slowest first-wave requests were still the cold-start style HR pages:

- `/profile` max `3653ms`
- `/hr/performance` max `3449ms`
- `/hr/hiring/interviews` max `3361ms`
- `/hr` max `3092ms`

### Shell

- Count: `72`
- Avg duration: `507ms`
- Degraded bundles: `0`
- Shell timeouts: `0`
- Status distribution: `200:72`
- Cache status distribution:
  - `hit: 42`
  - `miss: 22`
  - `coalesced: 8`

Important production signal:

- `guardrail reasons: none`
- `slow page + degraded shell pairings: 0`
- `first degraded shell: none`
- `first shell timeout: none`

---

## Pass / Fail Against Phase 1 Plan

The architecture findings file defined the key Phase 1 repro gate as:

- `6 users × 3 tabs`
- `0 hard shell timeouts`
- `<3s average page latency`

This production run **passes that gate**:

- 6 users × 3 tabs: `PASS`
- hard shell timeouts = `0`: `PASS`
- average page latency = `936ms`: `PASS`

Because the deployed system now survives the production-safe thrash without degraded shells or shell timeouts, the original Phase 1 objective is met.

---

## Important Caveat

This run does **not** meet the stricter generic performance drill target in `docs/perf-incident-drill.md`:

- desired overall page p95 `<900ms`
- actual page p95 `3092ms`

That means the system is now **stable under the Phase 1 failure mode**, but tail latency is still not where we want it long term.

That is a valid reason to keep pushing performance work in Phase 2, but it is **not** a reason to keep Phase 1 open if we judge against the actual architecture remediation plan.

---

## Honest Conclusion

Phase 1 can now be marked **complete**.

What Phase 1 achieved:

- shared Redis cache layer added
- shell bundle protected by shared cache
- invalidation coverage added across major write paths
- invalidation API hardened
- founder and org-settings mutation paths closed
- production thrash repro no longer causes shell degradation or hard shell timeouts

What Phase 2 should target next:

- tail latency on first-wave/cold-cache HR pages
- read-replica routing
- heavier read-model / materialized-view work from the architecture plan

---

## Recommended Next Step

Move to Phase 2 planning and implementation.

Phase 1 should now be treated as:

**implemented, deployed, and validated**
