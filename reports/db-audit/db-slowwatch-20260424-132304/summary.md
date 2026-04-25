# DB Slowwatch Report

- Started: 2026-04-24T12:23:04.913Z
- Finished: 2026-04-24T12:28:24.291Z
- Duration: 300s
- Interval: 20s
- Samples: 7
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 7 | 0 | 6628.14 | 21824 | 0 | n/a |
| long-running-queries | 7 | 0 | 2539.14 | 3336 | 0 | n/a |
| blocking | 7 | 0 | 2768.86 | 3937 | 0 | n/a |
| locks | 7 | 0 | 3838.14 | 10617 | 0 | n/a |
| outliers | 7 | 0 | 5870 | 19041 | 0 | n/a |
| index-stats | 7 | 0 | 3978.57 | 7789 | 0 | n/a |

## Findings

- [sample 2] locks required 2 attempt(s).
- [sample 5] outliers required 2 attempt(s).
- [sample 7] db-stats required 2 attempt(s).

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
