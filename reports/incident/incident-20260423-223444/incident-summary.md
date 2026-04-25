# Incident Summary

Generated: 2026-04-23T21:34:54.650Z

## Priority Findings

- Load-test failure rate high (17.36%).
- Load-test latency high (p95 20001ms, p99 0ms).

## Evidence

- k6 http_req_failed rate=0.17361255097104153 p95=20001.2836 p99=n/a rpc_timeout_rate=0.16674837173471532 rpc_non_200_rate=0.1684991946214721 rpc_timeouts=2381

## Action Plan

- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.