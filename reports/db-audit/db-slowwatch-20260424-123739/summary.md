# DB Slowwatch Report

- Started: 2026-04-24T11:37:39.026Z
- Finished: 2026-04-24T11:42:46.247Z
- Duration: 300s
- Interval: 20s
- Samples: 9
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 9 | 0 | 2691.44 | 4981 | 0 | n/a |
| long-running-queries | 9 | 0 | 2051.33 | 2222 | 0 | n/a |
| blocking | 9 | 0 | 2219.89 | 3084 | 0 | n/a |
| locks | 9 | 0 | 2184.22 | 2789 | 0 | n/a |
| outliers | 9 | 0 | 2594.22 | 5079 | 0 | n/a |
| index-stats | 9 | 0 | 2391.78 | 3859 | 0 | n/a |

## Findings

- No immediate contention findings from sampled checks.

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
