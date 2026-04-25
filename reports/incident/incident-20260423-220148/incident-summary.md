# Incident Summary

Generated: 2026-04-23T21:02:09.382Z

## Priority Findings

- Slow query outliers are elevated.

## Evidence

- [sample 1] db-stats required 2 attempt(s).
- [sample 4] locks required 2 attempt(s).
- [sample 5] db-stats required 2 attempt(s).
- k6 http_req_failed rate=n/a p95=n/a p99=n/a rpc_timeout_rate=n/a rpc_non_200_rate=n/a rpc_timeouts=n/a

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.