# DB Slowwatch Report

- Started: 2026-04-24T13:59:26.921Z
- Finished: 2026-04-24T14:04:27.971Z
- Duration: 300s
- Interval: 20s
- Samples: 9
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 9 | 0 | 3610.89 | 8236 | 0 | n/a |
| long-running-queries | 9 | 0 | 2510.44 | 3802 | 0 | n/a |
| blocking | 9 | 0 | 2351.33 | 2791 | 0 | n/a |
| locks | 9 | 0 | 2127 | 2368 | 0 | n/a |
| outliers | 8 | 0 | 2531.88 | 4426 | 0 | n/a |
| index-stats | 8 | 0 | 3171.25 | 5910 | 0 | n/a |

## Findings

- No immediate contention findings from sampled checks.

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
