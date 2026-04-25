# Incident Summary

Generated: 2026-04-23T21:03:04.817Z

## Priority Findings

- Slow query outliers are elevated.
- Load-test failure rate high (95.96%).
- Load-test latency high (p95 10001ms, p99 0ms).
- RPC timeout rate is critical (100.00%).

## Evidence

- [sample 1] db-stats required 2 attempt(s).
- [sample 4] locks required 2 attempt(s).
- [sample 5] db-stats required 2 attempt(s).
- k6 http_req_failed rate=0.9596347909658818 p95=10001.257 p99=n/a rpc_timeout_rate=1 rpc_non_200_rate=1 rpc_timeouts=1927

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.
- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.
- Reduce shell RPC concurrency/complexity and enforce fail-soft cached fallback paths.