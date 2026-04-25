# Incident Summary

Generated: 2026-04-24T08:23:53.089Z

## Priority Findings

- Load-test failure rate high (28.53%).
- Load-test latency high (p95 20001ms, p99 0ms).
- RPC timeout rate is critical (27.17%).

## Evidence

- [sample 1] db-stats required 2 attempt(s).
- k6 http_req_failed rate=0.28533240353324035 p95=20001.337 p99=n/a rpc_timeout_rate=0.2716769890424011 rpc_non_200_rate=0.2776322058122916 rpc_timeouts=2281

## Action Plan

- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.
- Reduce shell RPC concurrency/complexity and enforce fail-soft cached fallback paths.