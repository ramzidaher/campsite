# Incident Summary

Generated: 2026-04-24T11:27:36.584Z

## Priority Findings

- Slow query outliers are elevated.
- Load-test failure rate high (2.31%).
- Load-test latency high (p95 3395ms, p99 0ms).

## Evidence

- [sample 4] locks required 2 attempt(s).
- k6 http_req_failed rate=0.02311301829853298 p95=3394.7954999999974 p99=n/a rpc_timeout_rate=0.02053859083905309 rpc_non_200_rate=0.020906289396273987 rpc_timeouts=1173

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.
- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.