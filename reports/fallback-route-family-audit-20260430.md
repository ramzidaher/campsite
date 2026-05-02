# Fallback Route-Family Audit (WS2.2)
**Date:** 2026-04-30  
**Policy baseline:** `reports/fallback-taxonomy-policy-20260430.md`  
**Status:** Complete (initial pass) with remediation backlog

---

## Scope Audited

High-touch route families requested in WS2:

- dashboard
- profile
- manager
- admin HR
- hiring/recruitment

---

## Decision Matrix

| Route family | Current observed behavior | Policy class currently implied | Compliance | Notes |
|---|---|---|---|---|
| `/(main)/dashboard` | Multiple timeout fallbacks return substitute values for some sections; stale banner exists only for stale cache freshness mode | Mixed, mostly `explicit_partial_with_banner` intent | **Partial / Amber** | Needs explicit degraded banner for timeout-partial paths, not just stale-cache paths |
| `/(main)/profile` | Many timeout fallbacks coerce to `{ data: [] }` / empty payloads across tabs with no explicit partial marker | Implicit silent partial | **Fail / Red** | Primary remaining silent-partial hotspot |
| `/(main)/manager` | Shared loaders, no route-level timeout fallback coercion, request fails or redirects on access failures | `hard_fail` | **Pass / Green** | Behavior is explicit and consistent with policy |
| `/(main)/admin/hr/[userId]` | Shared loader with selected timeout fallbacks to empty data for some secondary segments; no global degraded marker | Mixed | **Partial / Amber** | Needs explicit classification of which segments are non-critical + UI degraded cue when timeout fallback used |
| `/(main)/hr/recruitment` and admin recruitment queue/detail | Shared cached loaders, no broad silent timeout coercion in route shells | `hard_fail` / complete cached reads | **Pass / Green** | Strategy is coherent after WS1.3 unification |

---

## Evidence Highlights

- Dashboard timeout fallback helper and substitutions are active in `apps/web/src/lib/dashboard/loadDashboardHome.ts`.
- Dashboard stale messaging exists in `apps/web/src/components/dashboard/DashboardHome.tsx`, but it is tied to freshness flag and not to every timeout-partial substitution path.
- Profile route has extensive timeout fallback coercion in `apps/web/src/app/(main)/profile/page.tsx` with empty substitutes and no explicit partial-data banner.
- Admin HR shared loader applies timeout fallback for selected subqueries in `apps/web/src/lib/admin/getCachedAdminHrEmployeePageData.ts`.
- Manager surfaces (`apps/web/src/app/(main)/manager/page.tsx` and manager loaders) use direct shared-loader reads without broad timeout-to-empty coercion.
- Recruitment surfaces now use unified shared cached page model (`apps/web/src/lib/recruitment/getCachedHrRecruitmentPageData.ts` and recruitment queue/detail loaders).

---

## Policy Gaps to Close

## Gap 1 — Dashboard partial-data signaling mismatch

- Problem: timeout-partial sections can degrade without a guaranteed explicit “partial data” signal.
- Required fix: surface a specific degraded banner when any non-critical timeout fallback fires.

## Gap 2 — Profile silent partial behavior

- Problem: many fallback paths silently substitute empty payloads for heavy tabs.
- Required fix: route-level degraded-state model (or per-tab degraded markers) tied to fallback activations.

## Gap 3 — Admin HR fallback classification clarity

- Problem: secondary fallback usage exists, but not formally mapped to policy classes in UI behavior.
- Required fix: declare each fallbacked segment as either allowed partial (with visible marker) or move to hard-fail.

---

## Remediation Backlog (Next Execution)

1. **WS2.2-A Dashboard fallback signaling patch**
   - Add explicit partial-data banner trigger when timeout fallback activations occur.
2. **WS2.2-B Profile fallback taxonomy implementation**
   - Introduce explicit degraded state contract and banner/tab-level markers; remove silent partial critical blocks.
3. **WS2.2-C Admin HR fallback contract pass**
   - Mark fallbacked blocks as non-critical with explicit UX signal; hard-fail critical blocks.

---

## Audit Conclusion

WS2 policy audit confirms architecture normalization progress is strong, but fallback integrity still blocks Green readiness until dashboard/profile/admin-HR signaling is explicit and policy-aligned.
