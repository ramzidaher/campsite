# Role mapping — Option A (product spec → codebase)

**Status:** implemented in app + migration `20260329120000_v2_profile_roles.sql` (apply via `supabase db push` / your pipeline).  
**Authority:** [mainaccesslevel.md](../../../mainaccesslevel.md) (v2) + this file.  
**Consumers:** DB migrations, RLS, Edge Functions, `@campsite/types`, web/mobile gates, admin UI.

---

## 1. Permission model (unchanged from spec)

- **Layer 1 — Role baseline:** `profiles.role` defines what a user can always do inside their org (and platform admins are out-of-band; see below).
- **Layer 2 — Department toggles:** `dept_broadcast_permissions` (and future per-feature toggle tables if needed) add capabilities **per department**; effective permission = baseline ∪ toggles for relevant depts. Resolution rules: [02-broadcast-baseline-toggles/PLAN.md](../02-broadcast-baseline-toggles/PLAN.md) and Plan 08 when added.

Agents must not reintroduce ad hoc `if (role === …)` without going through the shared resolution helpers / RLS the plans describe.

---

## 2. Platform identity (not `profiles.role`)

| Spec name   | Storage / check                         | Notes |
|------------|------------------------------------------|--------|
| CGS Founder | `public.platform_admins` + `public.is_platform_admin()` | Cross-org; create/suspend orgs; founder tooling. Never infer from `profiles.role`. |

Existing code already uses this pattern ([phase5_admin_platform.sql](../../../supabase/migrations/20250329000001_phase5_admin_platform.sql)).

---

## 3. Canonical tenant roles (`profiles.role`) — **target** after Option A

These are the **only** values that should remain in `profiles.role` long term (snake_case, stable for RLS and APIs).

| Spec name (product) | Canonical code `profiles.role` | Approx. rank (high → low) |
|---------------------|--------------------------------|---------------------------|
| Org Admin           | `org_admin`                    | 6 |
| Manager             | `manager`                      | 5 |
| Coordinator         | `coordinator`                  | 4 |
| Administrator       | `administrator`                | 3 |
| Duty Manager        | `duty_manager`                 | 2 |
| CSA                 | `csa`                          | 1 |

**Display names** in the app may differ per org; **`org_role_labels`** maps `(org_id, role)` → `display_name` for white-label. Underlying codes above stay fixed (per spec white-label note for `duty_manager` / `csa`).

**No payroll / pay-frequency roles:** `profiles.role` is **permission identity only**. There is **no** `weekly_paid` (or similar) in v2 — it confused real roles (**Administrator**, **Duty Manager**, **CSA** are different jobs/capabilities, not “how someone is paid”). Do not reintroduce a pay-type enum on `profiles.role`.

**Temporary extension (until societies/clubs ship):** `society_leader` remains a valid `profiles.role` value alongside the canonical list above. See §8 O1.

---

## 4. Legacy → target mapping (data + code migration)

Current CHECK on `profiles.role` (Phase 1):

`super_admin`, `senior_manager`, `manager`, `coordinator`, `assistant`, `weekly_paid`, `society_leader`

**Target CHECK** after migration: canonical roles in §3 **plus** `society_leader` until that feature is removed (§8 O1).

| Legacy `profiles.role` | Target `profiles.role` | Notes |
|------------------------|------------------------|--------|
| `super_admin`          | `org_admin`            | Full org admin; rename everywhere (RLS, RPCs, TS, Edge Functions). |
| `manager`              | `manager`              | Unchanged code; verify alignment with spec matrices. |
| `coordinator`          | `coordinator`          | Unchanged code. |
| `assistant`            | `administrator`        | Spec “Administrator”; broadcast baseline = draft-only send path, etc. |
| `senior_manager`       | `manager`              | **Product approved (§8 O3):** migrate rows to `manager`; extra powers only via department toggles / spec — no `senior_manager` literal after migration. |
| `weekly_paid`          | `csa` (default)        | **Role removed (§8 O2):** `weekly_paid` must not appear in CHECK or UI after migration. **Default** data fix: `UPDATE … SET role = 'csa'` for existing rows so constraints succeed; **Org Admin should recategorise** anyone who should be `administrator` or `duty_manager`. Remove `weekly_paid` from `discount_tiers` (merge into `csa` tier or org-specific cleanup). |
| `society_leader`       | `society_leader`       | **Product approved (§8 O1):** keep value temporarily; no remap to `coordinator` until societies spec + implementation land. |

**SQL touchpoints (non-exhaustive — agents grep and update):**

- `profiles.role` CHECK constraint
- `discount_tiers.role` CHECK (and any row defaulting by role)
- All policies and `SECURITY DEFINER` functions referencing old role literals
- `packages/types/src/roles.ts`, `apps/web/src/lib/adminGates.ts`, mobile auth/profile types
- Edge Functions (e.g. staff QR verify) that whitelist roles

---

## 5. Spec ↔ old name quick reference (for reading old migrations)

When reading existing SQL/TS, use this mental substitution until migrations land:

| Old literal        | Meaning in v2 (target)      |
|--------------------|-----------------------------|
| `super_admin`      | `org_admin`                 |
| `assistant`        | `administrator`             |
| `senior_manager`   | `manager` (then toggles)    |
| `weekly_paid`      | `csa`                       |

---

## 6. `org_role_labels.role` keys

Allowed keys must match **canonical** `profiles.role` values that are tenant-facing (at minimum: `duty_manager`, `csa`, and any other labelled role the product exposes). See [mainaccesslevel.md](../../../mainaccesslevel.md) § Role labels.

---

## 7. Agent execution checklist (order matters)

1. **Add migration:** new role CHECK; `UPDATE profiles SET role = …` mapping table above; same for `discount_tiers` and any table storing role text.
2. **Replace literals** in all migrations is not possible for applied history — **new** forward migration + codebase string replace.
3. **RLS / functions:** `org_admin` shortcut for “full org”; manager/coordinator paths + `dept_managers` / `user_departments` per Plan 01/02.
4. **Types package:** export new union; deprecate old literals in a single PR if possible.
5. **UI gates:** map `org_admin` to org admin shell; remove `super_admin` from user-facing strings (DB still migrates first).
6. **Verify:** run stacking scenarios from mainaccesslevel.md + PLAN 02 § “Stacking examples”.

---

## 8. Locked product decisions (2025-03-26)

| ID | Decision |
|----|----------|
| **O1** | **Keep `society_leader` temporarily** — remain in `profiles.role` CHECK; do not migrate those users until societies/clubs feature is specified and built. RLS/helpers must keep supporting `society_leader` where they do today. |
| **O2** | **Drop `weekly_paid` entirely** — it is not a permission role and must not be conflated with Administrator or Duty Manager. Remove from schema, types, seeds, and discount-tier keys. Migrate existing `profiles.role = 'weekly_paid'` with default `csa` plus manual Org Admin cleanup where job type is Administrator or Duty Manager. **Never** add a pay-frequency role to `profiles.role` again. |
| **O3** | **`senior_manager` → `manager` is acceptable** — losing org-wide powers unless toggles/spec cover them is approved. |

---

## 9. Related docs

- [mainaccesslevel.md](../../../mainaccesslevel.md) — full matrices and broadcast toggles.
- [02-broadcast-baseline-toggles/PLAN.md](../02-broadcast-baseline-toggles/PLAN.md) — broadcast implementation contract (depends on this mapping).

*Document version: 1.2 — O2 clarified: no `weekly_paid` role; not equivalent to admin/DM.*
