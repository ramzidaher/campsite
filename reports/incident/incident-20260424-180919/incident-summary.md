# Incident Summary

Generated: 2026-04-24T17:09:32.975Z

## Priority Findings

- Load-test failure rate high (7.47%).
- Load-test latency high (p95 20000ms, p99 0ms).

## Evidence

- [sample 7] db-stats required 2 attempt(s).
- k6 http_req_failed rate=0.074662521946867 p95=20000.368 p99=n/a rpc_timeout_rate=0.07136030582988213 rpc_non_200_rate=0.07136030582988213 rpc_timeouts=2464

## Action Plan

- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.