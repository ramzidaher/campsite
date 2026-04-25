# Incident Summary

Generated: 2026-04-23T21:14:20.513Z

## Priority Findings

- Slow query outliers are elevated.
- Load-test failure rate high (95.96%).
- Load-test latency high (p95 10001ms, p99 0ms).
- RPC timeout rate is critical (99.74%).

## Evidence

- [sample 4] db-stats required 3 attempt(s).
- [sample 5] outliers failed (exit null): Using workdir /Users/ramzidaher/Projects/CampSite/supabase Initialising login role...
- [sample 5] outliers timed out after command timeout.
- [sample 5] outliers required 3 attempt(s).
- k6 http_req_failed rate=0.9596054485674025 p95=10001.281 p99=n/a rpc_timeout_rate=0.9974186886938565 rpc_non_200_rate=0.9989674754775426 rpc_timeouts=1932

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.
- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.
- Reduce shell RPC concurrency/complexity and enforce fail-soft cached fallback paths.