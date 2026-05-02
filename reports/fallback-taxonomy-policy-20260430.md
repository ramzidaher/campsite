# Fallback Taxonomy Policy (WS2.1)
**Date:** 2026-04-30  
**Status:** Active baseline policy for route-family fallback governance  
**Program:** Product Balance Closure

---

## Purpose

Define one explicit fallback contract across high-touch routes so degraded behavior is predictable, user-trust-safe, and reviewable before client expansion.

This policy is mandatory for:

- dashboard
- profile
- manager surfaces
- admin HR / admin people surfaces
- hiring/recruitment surfaces

---

## Allowed Fallback Classes

Only the following classes are allowed:

1. `complete_stale_snapshot`
2. `explicit_partial_with_banner`
3. `hard_fail`

No other implicit fallback mode is accepted.

---

## Class Definitions and Requirements

## 1) `complete_stale_snapshot`

Use when:

- a complete previously-valid dataset can be returned
- stale data is acceptable for short windows
- permissions and entity scope remain correct

Required behavior:

- data must be complete for that view contract (not silently missing sections)
- view renders normally with data from prior success
- route emits instrumentation that stale path was used
- if stale age is material, show non-blocking “updated recently” language

Forbidden:

- mixing stale core blocks with missing critical blocks and presenting as fresh

---

## 2) `explicit_partial_with_banner`

Use when:

- some non-critical modules fail/timeout
- route can still safely render value for user

Required behavior:

- visible UI indicator that some sections are unavailable/degraded
- indicator must be specific enough to set expectation (for example: “some metrics are delayed”)
- critical business actions must be disabled if their source data is missing
- route logs degraded reason internally (timeout/downstream error/permission-derived omission)

Forbidden:

- silent omission of critical counts, approvals, or status rows while rendering a “normal-looking” page

---

## 3) `hard_fail`

Use when:

- critical correctness/security data is unavailable
- continuing would risk wrong decisions or policy breaches

Required behavior:

- fail closed with explicit, user-readable error state or redirect to safe route
- no ambiguous partial render
- include internal diagnostics for triage

---

## Critical vs Non-Critical Data Rules

Critical data (must not be silently partial):

- approval queues and approval counts
- role/permission-gated operational state
- HR employee core records used for decision workflows
- recruitment request status timelines and gating fields
- payroll/leave/performance decision inputs

Potentially non-critical data (can be explicit partial):

- secondary trend tiles
- optional recent-activity snippets
- non-blocking feed enrichments
- decorative aggregates

---

## Route-Family Baseline Decisions

These are baseline decisions for WS2.2 audit enforcement:

- `/dashboard`: `explicit_partial_with_banner` for non-critical widgets, never silent partial for core counters.
- `/profile`: `complete_stale_snapshot` preferred for core profile blocks; `hard_fail` for permission-sensitive critical records.
- `/manager/**`: `explicit_partial_with_banner` for non-critical modules; `hard_fail` where team/approval correctness cannot be guaranteed.
- `/admin/hr/**` and `/admin/users`: `hard_fail` for critical employee/compliance core blocks; `explicit_partial_with_banner` only for secondary insights.
- `/hr/recruitment` and `/admin/recruitment/**`: `hard_fail` for approval/status integrity, `explicit_partial_with_banner` only for ancillary metadata.

---

## Implementation Rules (Code-Level)

1. Every high-touch route must declare intended fallback class in its route report.
2. Any timeout helper (for example `resolveWithTimeout`) must map to one of the three classes.
3. If class is `explicit_partial_with_banner`, UI must render an explicit degraded marker.
4. If class is `hard_fail`, do not silently coerce to empty arrays for critical blocks.
5. Shared loaders should expose enough metadata (`freshness`, degraded reason flag) for page-level signaling.

---

## Verification Gate (Policy Compliance)

A route is compliant only if all are true:

1. Fallback class chosen and documented.
2. UI behavior matches class.
3. Logs/telemetry can distinguish fallback class activation.
4. No silent partial critical data.

This gate feeds WS2.2 (route-family fallback audit) and WS3.1 (balance acceptance checklist).

---

## Next Step Linkage

- WS2.2 must now audit each high-touch route against this policy and produce route-by-route pass/fail + remediation list.
