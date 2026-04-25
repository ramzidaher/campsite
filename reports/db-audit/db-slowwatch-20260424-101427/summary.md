# DB Slowwatch Report

- Started: 2026-04-24T09:14:27.638Z
- Finished: 2026-04-24T09:19:27.787Z
- Duration: 300s
- Interval: 20s
- Samples: 9
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 9 | 0 | 2708.78 | 3735 | 0 | n/a |
| long-running-queries | 9 | 0 | 2735.89 | 4062 | 0 | n/a |
| blocking | 9 | 0 | 3591.22 | 14042 | 0 | n/a |
| locks | 9 | 0 | 2312.11 | 3862 | 0 | n/a |
| outliers | 8 | 0 | 2309.75 | 3700 | 0 | n/a |
| index-stats | 8 | 0 | 2438.13 | 3041 | 0 | n/a |

## Findings

- No immediate contention findings from sampled checks.

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
