# Incident Summary

Generated: 2026-04-24T12:31:36.604Z

## Priority Findings

- Slow query outliers are elevated.
- Load-test failure rate high (16.19%).
- Load-test latency high (p95 6086ms, p99 0ms).

## Evidence

- [sample 2] locks required 2 attempt(s).
- [sample 5] outliers required 2 attempt(s).
- [sample 7] db-stats required 2 attempt(s).
- k6 http_req_failed rate=0.1619273759193838 p95=6086.185 p99=n/a rpc_timeout_rate=0.017445579483998528 rpc_non_200_rate=0.1601116517086976 rpc_timeouts=900

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.
- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.