# Incident Summary

Generated: 2026-04-24T09:19:39.982Z

## Priority Findings

- Load-test failure rate high (2.78%).
- Load-test latency high (p95 6989ms, p99 0ms).

## Evidence

- k6 http_req_failed rate=0.02781653489247669 p95=6988.593599999995 p99=n/a rpc_timeout_rate=0.02518633885860496 rpc_non_200_rate=0.02529758593836912 rpc_timeouts=1132

## Action Plan

- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.