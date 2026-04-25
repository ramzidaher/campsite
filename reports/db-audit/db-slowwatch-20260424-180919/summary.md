# DB Slowwatch Report

- Started: 2026-04-24T17:09:19.420Z
- Finished: 2026-04-24T17:14:30.133Z
- Duration: 300s
- Interval: 20s
- Samples: 8
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 8 | 0 | 2944.5 | 6104 | 0 | n/a |
| long-running-queries | 8 | 0 | 2533.5 | 3361 | 0 | n/a |
| blocking | 8 | 0 | 2401.5 | 3458 | 0 | n/a |
| locks | 8 | 0 | 5877.75 | 18238 | 0 | n/a |
| outliers | 8 | 0 | 2646.5 | 3919 | 0 | n/a |
| index-stats | 8 | 0 | 2432 | 2701 | 0 | n/a |

## Findings

- [sample 8] locks required 2 attempt(s).

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
