# Audit: Broadcast channels, `/admin/categories`, managers vs org admins

**Date:** 2026-05-03  
**Scope:** Naming confusion (“categories” vs “channels”), where channels are created, who can mutate `broadcast_channels`, registration/subscriptions, and manager-facing UX.

## 1. Terminology and routes

| Surface | URL / name | DB table | Notes |
|--------|------------|----------|--------|
| Admin nav (permission-driven) | `/admin/categories` | `public.broadcast_channels` | Label is still **“Categories”**; table was renamed from `dept_categories` in `20260430270000_rename_broadcast_channels.sql`. |
| Admin departments | `/admin/departments` | Same table | Department detail modal includes **“Broadcast channels”** (copy from `channelCopy.ts`) for org admins only for add/remove (see §4). |
| Member follow UI | Profile → **Broadcast channels** tab | `user_subscriptions` | Correct product language. |

**Developer confusion:** Code paths still use `categories`, `CatRow`, `catId`, `onAddCat` while the schema is `broadcast_channels` / `channel_id`.

## 2. Who can create or delete channels (RLS)

Policy **`broadcast_channels_mutate_org_admin`** (from rename migration) historically required:

- `profiles.role = 'org_admin'` only (string match on `profiles`).

**Gaps:**

1. **`super_admin` profile role** (still valid per `packages/types` / `is_effective_org_admin`) was **not** covered after `dept_categories_mutate_super_admin` was dropped on rename and no equivalent `broadcast_channels` policy was added.
2. **RBAC-only org admins** (`user_org_role_assignments` + `org_roles.key = 'org_admin'`) might have **no** `profiles.role = 'org_admin'`; they could pass `departments.view` in the shell but **fail** `insert`/`delete` on `broadcast_channels` until RLS uses `is_effective_org_admin`.

**Fix shipped in repo:** Migration `20260803121000_broadcast_channels_mutate_effective_org_admin.sql` replaces the mutate policy to use `public.is_effective_org_admin(auth.uid(), d.org_id)`.

**Still true:** **Department managers** are not org admins → they **cannot** insert/delete channels at the database layer (by design unless product adds `dept_managers` mutate rules).

## 3. Frontend vs permissions

### `/admin/categories` page

- **Gate:** `hasPermission(permissionKeys, 'departments.view')` (`admin/categories/page.tsx`).
- **Behaviour:** Same `broadcast_channels` CRUD as department modal; convenient bulk view by department.

### Admin sidebar (`getMainShellAdminNavItemsByPermissions`)

- **Bug (fixed):** “Categories” was **always** appended for anyone with *any* admin-adjacent permission, even without `departments.view` → link visible but `/forbidden` on click.
- **Fix:** Only add `/admin/categories` when `departments.view` is present (`adminGates.ts`).

## 4. Manager workspace (`/manager/departments`)

- Uses **`AdminDepartmentsClient`** with `isOrgAdmin={false}`.
- **Broadcast permissions** and **add/remove channels** lived inside `{isOrgAdmin ? …}` → managers saw **neither** permissions nor channel CRUD (correct for permissions; **wrong for discoverability** on channels).
- **Fix:** Always show the **list** of broadcast channels for the department; **add/remove** remains org-admin only, with a short note pointing to org admins / Admin → Categories.

## 5. Registration and “follow”

- **`RegisterWizard`** does **not** set `register_subscriptions` in auth metadata → new joins typically have **no** `user_subscriptions` rows until they use **Settings → Broadcast channels**.
- SQL `apply_registration_from_user_meta` accepts `channel_id` or legacy `cat_id` in JSON when present.
- **`user_subscriptions` insert policy** remains broad (`user_id = auth.uid()` only from phase1); listing channels is RLS-scoped to departments the user can see.

## 6. Copy / in-app help

- **`composeNoChannelsHint`** previously said to add channels only under **Admin → Departments**; org admins can also use **Admin → Categories**. Updated in `channelCopy.ts`.

## 7. `pageInfoRegistry` entry `admin-categories`

- Text described generic “categories” for the workspace; updated to describe **broadcast channels** and audience targeting.

## 8. Recommendations (not all implemented)

1. **Rename route** `/admin/categories` → `/admin/broadcast-channels` with redirect (reduces confusion; touches nav, probes, bookmarks).
2. **Rename nav label** “Categories” → “Broadcast channels”.
3. **Optional product change:** Allow **department managers** to CRUD channels for departments they manage (new RLS + UI), if that matches policy.
4. **Registration:** Add channel opt-in during invite signup or default `subscribed: true` for channels in selected departments (product decision).
