# Incident Summary

Generated: 2026-04-24T12:10:12.853Z

## Priority Findings

- Slow query outliers are elevated.
- Load-test failure rate high (2.10%).
- Load-test latency high (p95 4484ms, p99 0ms).

## Evidence

- k6 http_req_failed rate=0.021034748493764886 p95=4483.534749999968 p99=n/a rpc_timeout_rate=0.018966426436983652 rpc_non_200_rate=0.018966426436983652 rpc_timeouts=1079

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.
- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.