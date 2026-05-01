# Route Inventory Drift Summary (WS3.2)
**Date:** 2026-04-30  
**Command run:** `npm run routes:inventory`  
**New inventory artifact:** `reports/route-audit/route-inventory-20260430-194557.csv`  
**Baseline compared:** `reports/route-audit/page-balance-inventory-20260430-163407.csv`

---

## High-Level Outcome

Inventory was successfully regenerated and drift was reviewed.

Primary result:

- page-route count is stable, while classification now reflects recent normalization/fallback work
- route inventory now includes API rows in addition to page rows (hence higher total row count)

---

## Quantitative Delta

Compared baseline vs new inventory:

- total rows: `148 -> 228` (new export includes API route rows)
- page rows: `148 -> 148` (stable)
- `hasLocalMapCache=true` pages: `8 -> 3` (improved)
- `hasTimeoutFallback=true` pages: `4 -> 3` (improved)
- `accessPattern=shared page-data cache` pages: `5 -> 17` (major improvement)
- `accessPattern=mixed` pages: `14 -> 8` (improved)

---

## Spot-Check on Prior Hotspots

### `admin/system-overview`

- baseline: indirect/unclear org-wide aggregate pattern
- current: `shared page-data cache` + shared invalidation pattern

### `hr/recruitment`

- baseline: mixed fan-out path with direct reads
- current: `shared page-data cache` model with shell + shared loader pattern

### `admin/hr/[userId]`

- baseline: mixed fan-out with high direct reads/timeout fallback profile
- current: shared page-data cache classification, reduced direct-read shape

### `profile`

- still classified as mixed/timeout fallback route
- improved from baseline by removal of stale-window/local-cache flags in inventory output
- remains a candidate for deeper structural decomposition (WS1.4)

---

## Interpretation

This drift confirms that normalization and fallback governance work are now reflected in route inventory state, and prior stale-snapshot concerns are reduced for current decision-making.

Remaining imbalance focus after WS3.2:

1. WS1.4 profile decomposition (structural simplification)
2. WS4.1 founder surface intentional-exception decision

---

## Evidence

- New inventory CSV: `reports/route-audit/route-inventory-20260430-194557.csv`
- Prior baseline CSV: `reports/route-audit/page-balance-inventory-20260430-163407.csv`
- Balance progress tracker: `reports/product-balance-progress-log-20260430.md`
