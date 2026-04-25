# DB Slowwatch Report

- Started: 2026-04-23T22:06:40.949Z
- Finished: 2026-04-23T22:11:49.873Z
- Duration: 300s
- Interval: 20s
- Samples: 8
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 8 | 0 | 3760.63 | 6952 | 0 | n/a |
| long-running-queries | 8 | 0 | 2436.63 | 3116 | 0 | n/a |
| blocking | 8 | 0 | 3237.38 | 8612 | 0 | n/a |
| locks | 8 | 0 | 2946.63 | 4084 | 0 | n/a |
| outliers | 8 | 0 | 3077.5 | 5239 | 0 | n/a |
| index-stats | 8 | 0 | 3153.13 | 6068 | 0 | n/a |

## Findings

- No immediate contention findings from sampled checks.

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
