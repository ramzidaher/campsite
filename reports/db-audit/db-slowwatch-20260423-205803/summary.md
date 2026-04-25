# DB Slowwatch Report

- Started: 2026-04-23T19:58:03.467Z
- Finished: 2026-04-23T20:03:03.741Z
- Duration: 300s
- Interval: 20s
- Samples: 6
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 6 | 0 | 15356.5 | 43314 | 0 | n/a |
| long-running-queries | 6 | 0 | 4491.83 | 7931 | 0 | n/a |
| blocking | 5 | 0 | 3413.4 | 5922 | 0 | n/a |
| locks | 5 | 0 | 4918 | 9832 | 0 | n/a |
| outliers | 5 | 0 | 4121 | 7767 | 0 | n/a |
| index-stats | 5 | 0 | 3781 | 7705 | 0 | n/a |

## Findings

- [sample 1] db-stats required 2 attempt(s).
- [sample 4] db-stats required 3 attempt(s).
- [sample 4] locks required 2 attempt(s).

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
