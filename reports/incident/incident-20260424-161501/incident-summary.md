# Incident Summary

Generated: 2026-04-24T15:15:10.598Z

## Priority Findings

- Load-test failure rate high (2.81%).
- Load-test latency high (p95 9640ms, p99 0ms).

## Evidence

- k6 http_req_failed rate=0.028100518872723572 p95=9640.299199999985 p99=n/a rpc_timeout_rate=0.025566614211849338 rpc_non_200_rate=0.025566614211849338 rpc_timeouts=1251

## Action Plan

- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.