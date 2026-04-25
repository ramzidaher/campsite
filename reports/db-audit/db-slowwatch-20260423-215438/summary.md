# DB Slowwatch Report

- Started: 2026-04-23T20:54:38.283Z
- Finished: 2026-04-23T20:59:40.017Z
- Duration: 300s
- Interval: 20s
- Samples: 5
- Target mode: linked
- Per-check timeout: 15s
- Retries per check: 2

## Command Summary

| Command | Runs | Failures | Avg ms | Max ms | Non-zero samples | Last row count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| db-stats | 5 | 0 | 17446 | 28986 | 0 | n/a |
| long-running-queries | 5 | 0 | 4529.8 | 10027 | 0 | n/a |
| blocking | 5 | 0 | 5520.4 | 14344 | 0 | n/a |
| locks | 5 | 0 | 6865.6 | 23775 | 0 | n/a |
| outliers | 5 | 0 | 5589.2 | 10292 | 0 | n/a |
| index-stats | 4 | 0 | 5490.75 | 8325 | 0 | n/a |

## Findings

- [sample 1] db-stats required 2 attempt(s).
- [sample 4] locks required 2 attempt(s).
- [sample 5] db-stats required 2 attempt(s).

## Next Steps

- If `blocking`, `locks`, or `long-running-queries` stay non-zero, inspect and cancel/optimize those queries first.
- If `outliers` and `index-stats` look unhealthy, add missing indexes and re-check this report.
- Re-run this script during peak traffic and compare reports.
