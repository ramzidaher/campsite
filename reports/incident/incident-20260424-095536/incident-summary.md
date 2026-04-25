# Incident Summary

Generated: 2026-04-24T08:55:49.566Z

## Priority Findings

- Load-test failure rate high (12.92%).
- Load-test latency high (p95 7946ms, p99 0ms).

## Evidence

- [sample 1] blocking required 2 attempt(s).
- [sample 6] db-stats required 2 attempt(s).
- k6 http_req_failed rate=0.12918448606400235 p95=7946.081749999953 p99=n/a rpc_timeout_rate=0.028574956779451717 rpc_non_200_rate=0.12704371449740676 rpc_timeouts=1157

## Action Plan

- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.