# DB Slowwatch Report

- Started: 2026-04-24T10:08:20.307Z
- Finished: 2026-04-24T10:13:32.317Z
- Duration: 300s
- Interval: 20s
- Samples: 1
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 1 | 1 | 48656 | 48656 | 0 | n/a |
| long-running-queries | 1 | 1 | 48634 | 48634 | 0 | n/a |
| blocking | 1 | 1 | 48655 | 48655 | 0 | n/a |
| locks | 1 | 1 | 48693 | 48693 | 0 | n/a |
| outliers | 1 | 1 | 48691 | 48691 | 0 | n/a |
| index-stats | 1 | 1 | 48676 | 48676 | 0 | n/a |

## Findings

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
- [sample 1] index-stats failed (exit null): Using workdir /Users/ramzidaher/Projects/CampSite/supabase Initialising login role...
- [sample 1] index-stats timed out after command timeout.
- [sample 1] index-stats required 3 attempt(s).

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
