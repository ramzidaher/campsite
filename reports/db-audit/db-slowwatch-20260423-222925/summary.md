# DB Slowwatch Report

- Started: 2026-04-23T21:29:25.674Z
- Finished: 2026-04-23T21:34:42.438Z
- Duration: 300s
- Interval: 20s
- Samples: 9
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 9 | 0 | 2912.22 | 4935 | 0 | n/a |
| long-running-queries | 9 | 0 | 2376.67 | 3038 | 0 | n/a |
| blocking | 9 | 0 | 2484.89 | 3359 | 0 | n/a |
| locks | 9 | 0 | 2283.33 | 2616 | 0 | n/a |
| outliers | 9 | 0 | 2582.67 | 4628 | 0 | n/a |
| index-stats | 9 | 0 | 2553.11 | 3101 | 0 | n/a |

## Findings

- No immediate contention findings from sampled checks.

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
