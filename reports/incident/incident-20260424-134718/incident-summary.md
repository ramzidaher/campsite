# Incident Summary

Generated: 2026-04-24T12:47:30.778Z

## Priority Findings

- Slow query outliers are elevated.
- Load-test failure rate high (1.69%).
- Load-test latency high (p95 2714ms, p99 0ms).

## Evidence

- [sample 2] locks required 2 attempt(s).
- [sample 5] outliers required 2 attempt(s).
- [sample 7] db-stats required 2 attempt(s).
- k6 http_req_failed rate=0.016876960105025162 p95=2713.6017999999995 p99=n/a rpc_timeout_rate=0.015057728609684358 rpc_non_200_rate=0.015057728609684358 rpc_timeouts=1029

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.
- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.