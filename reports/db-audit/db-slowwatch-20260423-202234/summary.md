# DB Slowwatch Report

- Started: 2026-04-23T19:22:34.054Z
- Finished: 2026-04-23T19:27:48.999Z
- Duration: 300s
- Interval: 20s
- Samples: 9
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 9 | 0 | 2780.78 | 4289 | 0 | n/a |
| long-running-queries | 9 | 0 | 2367.44 | 2861 | 0 | n/a |
| blocking | 9 | 0 | 2277.78 | 2845 | 0 | n/a |
| locks | 9 | 0 | 2361.33 | 3013 | 0 | n/a |
| outliers | 9 | 0 | 2386 | 3145 | 0 | n/a |
| index-stats | 9 | 0 | 2816.33 | 6419 | 0 | n/a |

## Findings

- No immediate contention findings from sampled checks.

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
