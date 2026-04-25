# Incident Summary

Generated: 2026-04-24T11:42:57.488Z

## Priority Findings

- Slow query outliers are elevated.
- Load-test latency high (p95 1369ms, p99 0ms).

## Evidence

- k6 http_req_failed rate=0.0014944443176892013 p95=1368.5913999999952 p99=n/a rpc_timeout_rate=0.000034306886535690595 rpc_non_200_rate=0.000034306886535690595 rpc_timeouts=3

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.