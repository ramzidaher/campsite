# Incident Summary

Generated: 2026-04-24T10:14:42.977Z

## Priority Findings

- Slow query outliers are elevated.
- Load-test failure rate high (16.14%).
- Load-test latency high (p95 20001ms, p99 0ms).
- Supabase inspect capture had 4 failed command(s).

## Evidence

- [sample 1] db-stats failed (exit null): Using workdir /Users/ramzidaher/Projects/CampSite/supabase Initialising login role...
- [sample 1] db-stats timed out after command timeout.
- [sample 1] db-stats required 3 attempt(s).
- [sample 1] long-running-queries failed (exit null): Using workdir /Users/ramzidaher/Projects/CampSite/supabase Initialising login role...
- [sample 1] long-running-queries timed out after command timeout.
- [sample 1] long-running-queries required 3 attempt(s).
- [sample 1] blocking failed (exit null): Using workdir /Users/ramzidaher/Projects/CampSite/supabase Initialising login role...
- [sample 1] blocking timed out after command timeout.
- [sample 1] blocking required 3 attempt(s).
- [sample 1] locks failed (exit null): Using workdir /Users/ramzidaher/Projects/CampSite/supabase Initialising login role...
- [sample 1] locks timed out after command timeout.
- [sample 1] locks required 3 attempt(s).
- [sample 1] outliers failed (exit null): Using workdir /Users/ramzidaher/Projects/CampSite/supabase Initialising login role...
- [sample 1] outliers timed out after command timeout.
- [sample 1] outliers required 3 attempt(s).
- k6 http_req_failed rate=0.1614065180102916 p95=20000.84955 p99=n/a rpc_timeout_rate=0.1560275478905029 rpc_non_200_rate=0.1560275478905029 rpc_timeouts=2696

## Action Plan

- Collect top pg_stat_statements fingerprints and add tenant-scoped indexes.
- Apply backpressure and request shedding on hot endpoints to protect core flows.
- Tune query plans and connection usage, then rerun same scenario for before/after comparison.
- Review supabase-inspect/*.stderr.log and rerun capture once connectivity is stable.