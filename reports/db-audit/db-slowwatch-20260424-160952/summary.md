# DB Slowwatch Report

- Started: 2026-04-24T15:09:52.509Z
- Finished: 2026-04-24T15:14:53.438Z
- Duration: 300s
- Interval: 20s
- Samples: 9
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 9 | 0 | 3570.67 | 8970 | 0 | n/a |
| long-running-queries | 9 | 0 | 2224 | 2691 | 0 | n/a |
| blocking | 9 | 0 | 3521.67 | 7939 | 0 | n/a |
| locks | 9 | 0 | 2558.44 | 3343 | 0 | n/a |
| outliers | 8 | 0 | 2063.38 | 2288 | 0 | n/a |
| index-stats | 8 | 0 | 2190.38 | 2483 | 0 | n/a |

## Findings

- No immediate contention findings from sampled checks.

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
