# DB Slowwatch Report

- Started: 2026-04-24T08:50:27.728Z
- Finished: 2026-04-24T08:55:30.899Z
- Duration: 300s
- Interval: 20s
- Samples: 8
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 8 | 0 | 3398.5 | 4839 | 0 | n/a |
| long-running-queries | 8 | 0 | 2291 | 2774 | 0 | n/a |
| blocking | 8 | 0 | 4841.13 | 19611 | 0 | n/a |
| locks | 8 | 0 | 2093.5 | 2194 | 0 | n/a |
| outliers | 8 | 0 | 2716.63 | 4618 | 0 | n/a |
| index-stats | 8 | 0 | 2552.13 | 2937 | 0 | n/a |

## Findings

- [sample 1] blocking required 2 attempt(s).
- [sample 6] db-stats required 2 attempt(s).

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
