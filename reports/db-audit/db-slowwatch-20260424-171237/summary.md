# DB Slowwatch Report

- Started: 2026-04-24T16:12:37.321Z
- Finished: 2026-04-24T16:17:39.336Z
- Duration: 300s
- Interval: 20s
- Samples: 8
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 8 | 0 | 5372.75 | 18557 | 0 | n/a |
| long-running-queries | 8 | 0 | 3869.63 | 10511 | 0 | n/a |
| blocking | 8 | 0 | 3387.25 | 8208 | 0 | n/a |
| locks | 8 | 0 | 2542.25 | 3822 | 0 | n/a |
| outliers | 8 | 0 | 2239.88 | 2482 | 0 | n/a |
| index-stats | 7 | 0 | 3241.86 | 5266 | 0 | n/a |

## Findings

- [sample 7] db-stats required 2 attempt(s).

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
