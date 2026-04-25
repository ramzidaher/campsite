# Incident Summary

Generated: 2026-04-24T13:30:24.263Z

## Priority Findings

- Slow query outliers are elevated.
- Load-test failure rate high (1.31%).
- Load-test latency high (p95 4077ms, p99 0ms).

## Evidence

- [sample 2] locks required 2 attempt(s).
- [sample 5] outliers required 2 attempt(s).
- [sample 7] db-stats required 2 attempt(s).
- k6 http_req_failed rate=0.013145525435744116 p95=4076.730599999993 p99=n/a rpc_timeout_rate=0.011209548989594446 rpc_non_200_rate=0.011209548989594446 rpc_timeouts=725

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.
- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.