# Balance Acceptance Checklist (WS3.1)
**Date:** 2026-04-30  
**Purpose:** Pre-release balance gate for client-facing rollout readiness  
**Applies to:** release candidates for `apps/web`

---

## How To Use

- Complete this checklist before any client-expansion release.
- Mark each item `Pass`, `Fail`, or `N/A` with evidence links.
- A release is **not eligible** for client rollout if any required item is `Fail`.

---

## Gate A — Route-Family Read Model Consistency

Required checks:

- [x] A1: High-touch route families use consistent read model patterns:
  - dashboard
  - profile
  - manager
  - admin HR / admin users
  - hiring/recruitment
- [x] A2: No branch-level split between cached and uncached core read paths in a single route family.
- [x] A3: New route-level heavy fan-out logic is extracted into shared loaders under `apps/web/src/lib/**`.
- [x] A4: Any intentional exception is documented explicitly in reports and linked in release notes.

Evidence to attach:

- latest stage reports for changed route families
- diff links for route + loader pairings

---

## Gate B — Cache Model and Invalidation Integrity

Required checks:

- [x] B1: No unjustified page-local cache islands (`Map`/bespoke stale-window) in changed high-touch routes.
- [x] B2: Shared cache namespaces are declared and uniquely scoped.
- [x] B3: Cache invalidation coverage exists for every new namespace in `apps/web/src/lib/cache/cacheInvalidation.ts`.
- [x] B4: Manual refresh semantics (if used) are deterministic and documented.

Evidence to attach:

- namespace list + invalidation functions touched
- route report references

---

## Gate C — Access and Shell Consistency

Required checks:

- [x] C1: Routes that should use shell-derived access do so consistently (`getCachedMainShellLayoutBundle` + shell access helpers).
- [x] C2: No new direct route-level profile/permission fetches in normalized families without documented reason.
- [x] C3: Redirect/fail behavior for inactive or unauthorized states remains explicit.

Evidence to attach:

- changed route files + access guard snippets

---

## Gate D — Fallback Completeness Compliance

Required checks:

- [x] D1: Each changed high-touch route has one declared fallback class from policy:
  - `complete_stale_snapshot`
  - `explicit_partial_with_banner`
  - `hard_fail`
- [x] D2: No silent partial behavior for critical data blocks.
- [x] D3: `explicit_partial_with_banner` routes render visible degraded markers.
- [x] D4: Timeout/fallback activations are traceable (labels/telemetry/logging).

Policy references:

- `reports/fallback-taxonomy-policy-20260430.md`
- `reports/fallback-route-family-audit-20260430.md`

---

## Gate E — Verification Baseline

Required checks:

- [x] E1: `npm run lint` passes.
- [x] E2: `npm run typecheck` passes.
- [x] E3: `npm run test` passes.
- [x] E4: `npm run build --workspace=@campsite/web` passes.
- [x] E5: Targeted smoke checks pass for changed high-touch routes.

Evidence to attach:

- CI run link
- smoke check notes

---

## Gate F — Inventory and Drift Control

Required checks:

- [x] F1: Route inventory regenerated (`npm run routes:inventory`).
- [x] F2: Delta against previous inventory reviewed and summarized.
- [x] F3: Any drift from intended balance model has assigned remediation owner/date.

Evidence to attach:

- latest inventory CSV
- short delta summary report

---

## Signoff Block

| Role | Name | Decision | Date | Notes |
|---|---|---|---|---|
| Engineering |  | Pass (engineering gate) | 2026-05-01 | All technical gates passed; strict high-priority page hotspots now at zero in latest strict inventory |
| Product |  | Pending |  | Final go/no-go decision pending |
| QA / Release owner |  | Pending |  | Final go/no-go decision pending |

---

## Go / No-Go Recommendation (2026-05-01)

- **Recommendation:** **GO (technical) / PENDING (final governance signoff)**.
- **Reasoning:** all required technical gates A-F are currently passing, including strict page-balance closure (no remaining `high` priorities in latest strict helper-aware inventory).
- **Condition to flip to full GO:** product and QA entries in the signoff block marked `Pass`.
- **Suggested rollout shape:** phased client expansion with short monitoring window before full exposure.

---

## 2026-05-01 Evidence Notes

- Route balance/workstream evidence:
  - `reports/page-layer-stage-d-admin-system-overview-normalization-20260430.md`
  - `reports/page-layer-stage-d-dashboard-cache-convergence-20260430.md`
  - `reports/page-layer-stage-d-hr-recruitment-branch-unification-20260430.md`
  - `reports/page-layer-stage-f-profile-decomposition-closure-20260501.md`
- Fallback policy/audit evidence:
  - `reports/fallback-taxonomy-policy-20260430.md`
  - `reports/fallback-route-family-audit-20260430.md`
- Verification evidence:
  - `npm run lint` (pass; warnings only)
  - `npm run typecheck` (pass)
  - `npm run test` (pass)
  - `npm run build --workspace=@campsite/web` (pass)
  - `npm run routes:inventory` (pass)
- Inventory evidence:
  - `reports/route-audit/route-inventory-20260430-194557.csv`
  - `reports/route-audit/route-inventory-20260501-071535.csv`
  - `reports/route-audit/route-inventory-20260501-081108.csv`
  - `reports/route-audit/page-balance-inventory-20260501-104706.csv`
  - `reports/page-balance-full-scan-20260501.md`
  - `reports/page-balance-exception-register-20260501.md`

Release decision rule:

- **Go** only if all required checklist items pass or are explicitly marked `N/A` with justification and approver signoff.
- **No-go** if any required item fails without accepted mitigation.
