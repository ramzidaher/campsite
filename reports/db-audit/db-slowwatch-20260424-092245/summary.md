# DB Slowwatch Report

- Started: 2026-04-24T08:22:45.267Z
- Finished: 2026-04-24T08:23:30.599Z
- Duration: 40s
- Interval: 15s
- Samples: 1
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 1

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 1 | 0 | 18306 | 18306 | 0 | n/a |
| long-running-queries | 1 | 0 | 2406 | 2406 | 0 | n/a |
| blocking | 1 | 0 | 2215 | 2215 | 0 | n/a |
| locks | 1 | 0 | 3419 | 3419 | 0 | n/a |
| outliers | 1 | 0 | 1941 | 1941 | 0 | n/a |
| index-stats | 1 | 0 | 2042 | 2042 | 0 | n/a |

## Findings

- [sample 1] db-stats required 2 attempt(s).

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
