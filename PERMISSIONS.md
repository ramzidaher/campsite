# CampSite permissions model (internal)

Short reference for engineers: how tenant RBAC works, how overrides compose, how hierarchy gates sensitive actions, and how to add predefined roles.

## Layered model

1. **`permission_catalog`**  Canonical list of permission keys, labels, and metadata (e.g. `is_founder_only`).
2. **`org_roles`**  Tenant-defined rows: predefined (**`is_system = true`**, seeded) vs **custom** (**`is_system = false`**, role builder).
3. **`org_role_permissions`**  Maps each role to a set of permission keys.
4. **`user_org_role_assignments`**  Each member has **one** active role assignment per org (Phase 2+).
5. **`profiles.role`**  Denormalized string key kept in sync on assignment for legacy UI and quick display; effective access uses assignments + overrides.
6. **`user_permission_overrides`**  Optional per-user rows with **`mode`** `additive`, `subtractive`, or `replace`.

Effective checks go through **`has_permission(user_id, org_id, permission_key, context)`** (security definer).

## How overrides work

Order of evaluation (simplified; see migration `20260615120000_phase4_user_permission_overrides.sql`):

1. **Subtractive**  If there is a subtractive row for this key, **`has_permission` is false** for that key (even if the role grants it).
2. **Replace mode**  If **any** `replace` row exists for `(user_id, org_id)`, **role-derived grants are ignored**. The user is treated as allowed only keys that appear in **`replace`** or **`additive`** rows (still subject to subtractive).
3. **Otherwise**  Union of **role grants** and **`additive`** overrides; then subtractive is applied first as above.

**Implication:** Replace mode is a **narrow allowlist**. It does not “merge” with the base role; it replaces the permission set for checks until replace rows are cleared (e.g. `user_permission_overrides_clear_for_user`).

**RLS / RPCs:** Mutations should go through **`user_permission_override_upsert`**, **`user_permission_override_delete`**, **`user_permission_overrides_clear_for_user`**, which enforce:

- Actor has **`members.edit_roles`** or **`roles.manage`**.
- Target is an active member.
- Non–org-admins may only affect **direct or indirect reports**.
- Non–founder, non–org-admin actors cannot grant/remove a key they **do not** themselves hold (with founder-only catalog rules).

## Hierarchy enforcement

- **`is_effective_org_admin(actor, org)`**  Org admin bypass for tenant isolation (legacy profile role, RBAC **`org_admin`** assignment, or platform founder).
- **Department isolation**  `profile_visible_under_department_isolation`: self, effective org admin, or **shared department** membership (Phase 3). RLS on `profiles` and related tables follows this.
- **Reporting chain**  **`is_reports_descendant_in_org(org, ancestor, descendant)`** walks **`reports_to_user_id`** upward. Used for:
  - Assigning roles / updating line manager (non–org-admin).
  - Permission override mutations (non–org-admin).
- **Rank ceiling**  **`actor_can_assign_role`** compares the actor’s **max assigned rank** (excluding `org_admin` from the numeric tier) to the target role’s **`rank_level` / `rank_order`**. **`org_admin`** target role may only be assigned by someone who already holds **`org_admin`** (or founder).

Non–org-admins **cannot assign predefined (`is_system`) roles** (Phase 5); they may assign **custom** roles only to **reports**.

## Custom roles vs predefined

- **Predefined:** `org_roles.is_system = true`, seeded per org, not archivable as “custom”; editing permissions restricted to effective org admins / founders for system rows.
- **Custom:** `is_system = false`, created via **`create_org_role` / custom-roles API**; permission set capped to what the creator can grant (**`has_permission`** on each key).

## Adding a new predefined role (future)

1. **Catalog**  Add new keys to **`permission_catalog`** via migration (or seed) if the role needs new capabilities.
2. **Seed**  In the migration that maintains tenant templates (e.g. ranked seed / org bootstrap), **`insert` into `org_roles`** for each existing org (or only new orgs, depending on idempotent strategy), with stable **`key`**, **`label`**, **`is_system = true`**, and appropriate **`rank_level` / `rank_order`** relative to existing hierarchy.
3. **Permissions**  **`insert into org_role_permissions`** for the new role id mapping to catalog keys.
4. **App copy**  Optional: add display labels in UI helpers (`ROLE_LABEL`, pills) if needed.
5. **Do not** rely on manual dashboard edits alone  keep changes in **migrations** so all environments match (see repo rule for Supabase migrations).

## Tests (pure mirrors)

Jest tests in `apps/web/src/lib/authz/__tests__/rbacPhase7.test.ts` document expected behaviour for:

- Department visibility vs org admin.
- Override hierarchy gate (peer / superior vs report).
- Rank assignment ceiling (mirrored in `rankAssignmentPolicy.ts`).
- Override composition (mirrored in `overrideComposition.ts`).
- Custom role picker ceiling (`validateCustomRolePermissionKeys`).

**Integration tests** against a real Postgres instance would further validate RLS and RPCs; the pure helpers are explicitly **not** a substitute for DB-level tests.

## Related docs

- `docs/RBAC_SECURITY_REVIEW.md`  API review notes and known gaps (e.g. invite provision path).
- `docs/QA_SEED_AND_SCENARIOS.md`  deterministic QA org seed (`npm run seed-qa-full`) and manual test matrix for major features.
