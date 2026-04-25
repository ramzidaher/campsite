# Incident Summary

Generated: 2026-04-24T09:40:27.515Z

## Priority Findings

- Load-test failure rate high (5.28%).
- Load-test latency high (p95 17835ms, p99 0ms).

## Evidence

- k6 http_req_failed rate=0.05277982697337536 p95=17835.392499999998 p99=n/a rpc_timeout_rate=0.04548235774015909 rpc_non_200_rate=0.04555034332721463 rpc_timeouts=669

## Action Plan

- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.