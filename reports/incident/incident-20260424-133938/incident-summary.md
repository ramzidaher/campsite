# Incident Summary

Generated: 2026-04-24T12:39:51.427Z

## Priority Findings

- Slow query outliers are elevated.
- Load-test latency high (p95 1163ms, p99 0ms).

## Evidence

- [sample 2] locks required 2 attempt(s).
- [sample 5] outliers required 2 attempt(s).
- [sample 7] db-stats required 2 attempt(s).
- k6 http_req_failed rate=0.00927661853862823 p95=1163.0921999999987 p99=n/a rpc_timeout_rate=0.007980475899938987 rpc_non_200_rate=0.007980475899938987 rpc_timeouts=654

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.