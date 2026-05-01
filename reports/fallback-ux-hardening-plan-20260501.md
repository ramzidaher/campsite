# Fallback UX Hardening Plan
**Date:** 2026-05-01  
**Context:** Post-Redis balance work still shows fallback messaging on some high-touch routes.

---

## Executive Note

Fallback appearing after Redis rollout is expected in some scenarios and does **not** automatically mean the Redis integration failed.

Redis improves average latency and load behavior, but fallback still triggers when:

- cache keys are cold or expired
- a section has cache miss + slow upstream query
- one branch in route fan-out exceeds timeout budget
- a route intentionally degrades to partial data instead of blocking the full page

The core question is now UX quality and consistency of degraded states, not whether fallback logic should exist.

---

## Current Problem Statement

Users can see copy like:

> "Some dashboard sections are temporarily delayed. Data may be partially loaded."

This is technically correct but can feel low-confidence if:

- shown too frequently
- shown as a broad page-level warning instead of scoped UI indicators
- not paired with visible progress/recovery behavior

---

## Why We Still Need Fallback Logic

Removing fallback logic entirely is not recommended.

Without fallback protection, slow sections can:

- block entire route render
- increase perceived hangs/timeouts
- cause silent failures or blank areas

Goal should be:

- keep fallback safety
- improve how fallback is presented
- reduce fallback frequency with targeted cache/timeout tuning

---

## UX Improvements (Recommended)

### 1) Replace blunt global warning with scoped status

- Keep global banner only when critical blocks are affected.
- Use section-level status chips for non-critical delays (e.g. "Updating", "Syncing data").
- Auto-dismiss status once section hydrates/revalidates.

### 2) Skeleton loading for delayed sections

Implement component skeletons so delayed cards still feel intentional:

- dashboard KPI cards: numeric pulse skeleton
- list/table sections: row skeletons (3-6 rows)
- charts: lightweight chart frame + shimmer placeholder

Design guidance:

- keep skeleton shape close to final layout
- avoid spinner-only placeholders for content-heavy cards
- add subtle animation only (no distracting shimmer speed)

### 3) Background retry + soft recovery

- Retry delayed section fetches in background with bounded attempts.
- Replace delayed placeholder in-place without full-page refresh.
- Show "Updated just now" microcopy when recovered.

### 4) Copy hardening

Current copy can sound like failure; use calmer language:

- "Updating live metrics. Some cards may take a moment."
- "Refreshing this section…"

Tone goals:

- transparent
- non-alarming
- action-neutral (user doesn’t feel they broke something)

### 5) Fallback severity tiers

Define per-section severity:

- **Critical:** show prominent banner + clear next step
- **Important:** inline warning in section header
- **Non-critical:** skeleton + subtle status only

---

## Engineering Improvements (Recommended)

### 1) Tune timeout budgets per section

- Increase budget for known heavy but high-value sections.
- Lower budget for non-critical cards and rely on background retry.

### 2) Cache policy refinement

- Raise TTL for stable aggregates where freshness tolerance exists.
- Consider stale-while-revalidate behavior for dashboard-like read paths.
- Prewarm keys for first-hit routes where practical.

### 3) Add fallback observability

Track:

- route
- section
- fallback type
- recovery time
- user-visible banner shown (yes/no)

This allows reducing fallback frequency based on real data, not guesswork.

---

## Suggested Implementation Order

1. Introduce section-level skeletons for dashboard and most visited panels.
2. Change fallback copy to non-alarming variants.
3. Add background retry + auto-recovery replacement.
4. Keep page-level banner only for critical-section degradation.
5. Tune TTL/timeout values after one week of fallback telemetry.

---

## Acceptance Criteria

- Users no longer see frequent alarming global fallback banners.
- Delayed sections always render intentional placeholders (no empty jumpy areas).
- Recovery from delayed state happens in-place without manual refresh for common cases.
- Fallback event rate is measurable and trending down over releases.

---

## Decision

For now, keep fallback safety logic in place.  
Next improvement cycle should focus on UX polish + telemetry + tuning, not fallback removal.
