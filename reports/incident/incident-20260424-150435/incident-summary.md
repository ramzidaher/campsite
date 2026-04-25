# Incident Summary

Generated: 2026-04-24T14:04:45.605Z

## Priority Findings

- Load-test failure rate high (15.94%).
- Load-test latency high (p95 20001ms, p99 0ms).

## Evidence

- k6 http_req_failed rate=0.1594219455075113 p95=20001.292 p99=n/a rpc_timeout_rate=0.15392621718515093 rpc_non_200_rate=0.15392621718515093 rpc_timeouts=2662

## Action Plan

- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.