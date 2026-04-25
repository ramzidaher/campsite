# DB Slowwatch Report

- Started: 2026-04-23T21:06:36.054Z
- Finished: 2026-04-23T21:11:39.877Z
- Duration: 300s
- Interval: 20s
- Samples: 5
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 5 | 0 | 13612.4 | 45486 | 0 | n/a |
| long-running-queries | 5 | 0 | 3003.6 | 3991 | 0 | n/a |
| blocking | 5 | 0 | 4443.2 | 9822 | 0 | n/a |
| locks | 5 | 0 | 5723 | 12353 | 0 | n/a |
| outliers | 5 | 1 | 13857 | 48669 | 0 | n/a |
| index-stats | 4 | 0 | 5153 | 8177 | 0 | n/a |

## Findings

- [sample 4] db-stats required 3 attempt(s).
- [sample 5] outliers failed (exit null): Using workdir /Users/ramzidaher/Projects/CampSite/supabase Initialising login role...
- [sample 5] outliers timed out after command timeout.
- [sample 5] outliers required 3 attempt(s).

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
