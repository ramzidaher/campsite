# 10 — User settings and profile

## 1. Product intent

- **Every authenticated user** may manage **their own** profile preferences: name, avatar URL, accent, colour scheme, DND window, shift reminder offset, password (via Supabase Auth), sign out, self-deactivate (`profiles.status = 'inactive'`).
- **Org-admin-only subpages** under settings (e.g. **discount tiers**) must remain server-gated.

## 2. Backend (Supabase)

### 2.1 `profiles` columns (representative)

See `ProfileSettings` initial select in `apps/web/src/app/(main)/settings/page.tsx`:

- `full_name`, `avatar_url`
- `accent_preset`, `color_scheme`
- `dnd_enabled`, `dnd_start`, `dnd_end`
- `shift_reminder_before_minutes`
- `role` (display only — **not** in client `update` payload)

### 2.2 RLS

- **`profiles_update_self`** (`20250325120001_phase1_core_platform.sql`): `using (id = auth.uid())` and `with check (id = auth.uid())` — cannot update another user’s row.
- **`profiles_update_by_approver`**: approvers update **other** users in org (approval flows).
- **`profiles_update_org_admin`**: org admin updates **other** members (`id <> auth.uid()`).

### 2.3 Trigger (role / status)

**Function:** `public.profiles_block_self_role_status()` on **`profiles`** (`profiles_no_self_role_status_change`).

- Blocks **self** from changing **`role`**.
- Allows **only** **`active` → `inactive`** for **self** `status` (self-deactivate). Other self status changes remain blocked.
- Migration: **`20260408120000_profiles_allow_self_deactivate.sql`** (replaces stricter phase1 behaviour that blocked all self `status` updates).

### 2.4 Auth

- **Password:** `supabase.auth.updateUser({ password })` from client (`ProfileSettings.tsx`).
- **Google connect:** flash query params `google_connected`, `google_error` on `settings/page.tsx`.

## 3. Frontend (`apps/web`)

### 3.1 Route

**File:** `apps/web/src/app/(main)/settings/page.tsx`

- Server: `getUser()`; if no user → **`redirect('/login')`**.
- Loads `profiles` fields for `ProfileSettings` initial state.

### 3.2 Client component

**File:** `apps/web/src/components/ProfileSettings.tsx`

- **`saveProfile`:** `.from('profiles').update({...}).eq('id', u.user.id)` — **does not** send `role`, `status`, or `org_id`.
- **`changePassword`:** `auth.updateUser`.
- **`deactivate`:** `update({ status: 'inactive' })`, then **`signOut`**, **`router.replace('/login')`**.
- **Org admin link:** if `isOrgAdminRole(profile.role)`, link to `/settings/discount-tiers`.

### 3.3 Discount tiers (sub-route)

**File:** `apps/web/src/app/(main)/settings/discount-tiers/page.tsx`

- Server gates: **`isOrgAdminRole(profile.role)`** else **`redirect('/settings')`**.
- Renders `DiscountTiersClient`.

## 4. Shell access

**File:** `apps/web/src/components/AppShell.tsx`

- Footer link to **`/settings`** for logged-in users in the main shell.

## 5. Verification checklist

- [x] User A cannot update user B’s profile row — **RLS** `profiles_update_self` requires `id = auth.uid()` for self path.
- [x] **`role`** not sent from settings save; trigger blocks self **`role`** changes regardless.
- [x] Non–org-admin cannot open **`/settings/discount-tiers`** — server **`isOrgAdminRole`** redirect.
- [x] Deactivate: **`active` → `inactive`** allowed by trigger; **`signOut`** clears session.

## 6. Automated tests

- No dedicated Jest module yet; types/gates covered elsewhere. Optional: add a test that the profile update payload type omits `role` if you introduce a shared DTO.

## 7. Implementation order (new profile field)

1. Migration: add column + default; **`npm run supabase:db:push`**.
2. RLS / trigger: extend **`profiles_update_self`** or trigger only if new column must be restricted.
3. `settings/page.tsx` select + `ProfileSettings` form.
4. Update this plan.
