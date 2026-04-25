# Incident Summary

Generated: 2026-04-24T16:12:49.811Z

## Priority Findings

- Load-test failure rate high (2.12%).
- Load-test latency high (p95 6849ms, p99 0ms).

## Evidence

- k6 http_req_failed rate=0.02115432824883815 p95=6848.598399999998 p99=n/a rpc_timeout_rate=0.01876343357279786 rpc_non_200_rate=0.01876343357279786 rpc_timeouts=969

## Action Plan

- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.