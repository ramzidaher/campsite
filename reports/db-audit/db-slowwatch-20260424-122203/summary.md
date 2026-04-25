# DB Slowwatch Report

- Started: 2026-04-24T11:22:03.491Z
- Finished: 2026-04-24T11:27:05.584Z
- Duration: 300s
- Interval: 20s
- Samples: 9
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 9 | 0 | 2973.67 | 4232 | 0 | n/a |
| long-running-queries | 8 | 0 | 2428.25 | 4019 | 0 | n/a |
| blocking | 8 | 0 | 2468.5 | 3193 | 0 | n/a |
| locks | 8 | 0 | 3121.38 | 6452 | 0 | n/a |
| outliers | 8 | 0 | 3222.63 | 5806 | 0 | n/a |
| index-stats | 8 | 0 | 3170.13 | 6614 | 0 | n/a |

## Findings

- [sample 4] locks required 2 attempt(s).

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
