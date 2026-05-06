# 01  Auth and registration

## 1. Product intent

- **Anonymous visitors** can see marketing/landing (where configured) and auth pages.
- **Authenticated users** without a completed tenant profile may be guided through registration or blocked with a clear message.
- **Email verification** and **org approval** are separate gates; copy should not conflate them.

## 2. Backend (Supabase + SQL)

### 2.1 Supabase Auth

- **Provider:** Supabase Auth (email/password).
- **JWT:** Session available to Next.js via `@supabase/ssr` cookie helpers (`apps/web/src/lib/supabase/server.ts`, `client.ts`).
- **User metadata:** Registration wizard may stash:
  - **Join existing org:** `register_org_id`, `register_dept_ids`, `register_subscriptions`, `full_name`, optional **`register_avatar_url`** (public `http`/`https` image link; also applied via join-only client fallback in `completeRegistrationProfile.ts`).
  - **Create new org (first org admin for that tenant, not platform founders):** `register_create_org_name`, `register_create_org_slug`, `full_name`, optional **`register_avatar_url`** (no `register_org_id`; profile is **`org_admin` + `active`**). RPC `apply_registration_from_user_meta` still accepts legacy keys `register_founder_org_*`  see `20260410120000_org_creator_registration_metadata.sql`, `20260411120000_registration_optional_avatar_url.sql`, and `20260409120000_founder_registration_bootstrap.sql`.
- **Invite links** from Admin → All members use the **organisation slug** in the query string: `/register?org={slug}` (not the org UUID). Middleware exposes this as `x-campsite-org-slug` for the register page.

### 2.2 Tables (read-only for this feature’s “bootstrap” story)

| Table | Role in this feature |
|-------|----------------------|
| `auth.users` | Canonical identity; `email`, `email_confirmed_at` |
| `profiles` | Tenant profile: `id`, `org_id`, `role`, `status`, `full_name`, etc. |
| `user_departments` | Links user to departments after registration |
| `user_subscriptions` | Optional category subscriptions from wizard |

### 2.3 RPCs and triggers (registration path)

- **`ensure_my_registration_profile`** (if deployed): `SECURITY DEFINER` path that creates profile from server-side context; see migrations under `supabase/migrations/20260402120000_ensure_my_registration_profile_rpc.sql` and related. It calls **`apply_registration_from_user_meta`**, which implements both **join** (pending `unassigned`) and **create org** (active `org_admin` + new org + bootstrap department). **Platform founders** are separate (`platform_admins`, `/founders`  see [11-platform-founders.md](./11-platform-founders.md)).
- **Auth trigger** (if deployed): may insert placeholder profiles on signup  see `20260401120000_auth_user_registration_trigger.sql`. **Do not duplicate** client insert logic without reconciling with `completeRegistrationProfileIfNeeded`.

### 2.4 Row Level Security

- RLS on `profiles` controls who can read/update rows; registration flows use the authenticated user’s own `id`.
- When adding new insert paths, ensure **insert policy** allows only the owning user or service role as intended.

### 2.5 Edge Functions

- None required for core login/register; discount and broadcast functions are separate features.

## 3. Frontend (`apps/web`)

### 3.1 Middleware

**Files:** `apps/web/src/middleware.ts`; host/slug resolution in `apps/web/src/lib/middleware/resolveHostRequestContext.ts` (testable); auth path list in `apps/web/src/lib/middleware/authPaths.ts`.

**Responsibilities:**

- Resolve **org slug** from host (`x-campsite-org-slug`) or `?org=` query for local dev.
- Set **`x-campsite-platform-admin`** for admin hostnames.
- **Redirect unauthenticated** users away from protected paths to `/login` with `next` query param.
- **Special-case** `/platform/*` routes (redirect patterns as implemented).
- Allow `/auth/callback` and static assets through.

**When changing:** Test both tenant subdomain and plain localhost; test logged-out access to `/dashboard`, `/broadcasts`, etc.

### 3.2 Routes (App Router)

| Path | File | Behaviour |
|------|------|-----------|
| `/` | `apps/web/src/app/page.tsx` | If session: no `profiles` row → `/pending` (profile completion); else branch on `status` → `/dashboard`, `/pending`, or inactive (`/login?error=inactive`). Else: `LandingPage`. |
| `/login` | `(auth)/login/page.tsx` | Sign-in UI. |
| `/register` | `(auth)/register/page.tsx` | Registration wizard entry. |
| `/register/done` | `(auth)/register/done/page.tsx` | Post-register handoff. **`?creator=1&org={slug}`**  org creator (email confirm + sign in to workspace); default copy  join flow awaiting manager approval. |
| `/forgot-password` | `(auth)/forgot-password/page.tsx` | Recovery. |
| `/auth/callback` | Handled by Supabase exchange (matcher excludes or includes per config) | OAuth / email-confirmation completion. |
| `/pending` | `(main)/pending/page.tsx` | **Awaiting org approval** for pending members; calls `completeRegistrationProfileIfNeeded` when profile missing. **Org-creator** stuck state (`org_creator_pending`) can **Retry workspace setup** (second RPC). If the profile is already **`active`** (e.g. create-org registration), redirects to **`/dashboard`**. |

### 3.3 Profile completion helper

**File:** `apps/web/src/lib/auth/completeRegistrationProfile.ts`

**Flow:**

1. If `profiles` row exists → return success.
2. Call RPC `ensure_my_registration_profile`; reload profile. If still missing, **call the RPC once more** (absorbs rare races / cache timing), then reload again.
3. If still no profile and JWT metadata looks like **create-org** (`register_create_org_*` or legacy `register_founder_org_*`) → return **`kind: 'org_creator_pending'`** with actionable copy; **do not** call the join-only client path.
4. Otherwise → `insertProfileFromJwtMetadata`: insert `profiles` with `PROFILE_REGISTRATION_ROLE` (`unassigned` from `@campsite/types`), `user_departments`, optional `user_subscriptions`  **only for the join-existing-org metadata shape** (`register_org_id` + departments). **Create-org** metadata must be applied by the RPC (clients cannot insert `org_admin` under RLS).

**Implementation rules:**

- Keep **one** source of truth for default role at registration (`PROFILE_REGISTRATION_ROLE`).
- All error strings should be actionable (contact org admin, re-register).

### 3.3.1 Multi-organisation login (current scope)

- **`user_org_memberships`** (`supabase/migrations/20260430280000_user_org_memberships.sql`): one row per `(auth user, organisation)` with org-scoped `role`, `status`, `full_name`, `email`, and review fields. **`profiles`** still holds the **active** tenant row (`org_id`, `role`, `status`, …); **`current_org_id()`** continues to read `profiles.org_id`, so existing RLS is unchanged.
- **Sync:** Trigger `trg_profiles_sync_org_membership` upserts the membership row for the active `profiles.org_id` whenever org-scoped columns change; removing a member deletes that org’s membership and may **fall back** `profiles` to another membership (`org_admin_remove_member`).
- **Second org via admin invite:** `admin_provision_invited_member` inserts/updates a row in `user_org_memberships` for the new org **without** changing `profiles` if the user already has another active org (user switches in **Settings** or at login).
- **Login:** `LoginForm` loads memberships after `signInWithPassword`. If **more than one** membership exists and `profiles.org_id` is **missing or not** one of those orgs, **`LoginOrgChoiceModal`** asks which workspace to open, then calls **`set_my_active_org`**. If `profiles.org_id` already matches a membership, no modal (user can switch under **Settings → Workspaces**).

### 3.4 Layout interactions

- **`(main)/layout.tsx`** wraps **`/pending`** and the rest of the signed-in app. It loads `profiles.role` for the shell (`unassigned` shows as “Pending role” until an approver assigns a role). **`RegisterWizard`** (`apps/web/src/components/RegisterWizard.tsx`): default `/register` is **create organisation** only (Account → Organisation → optional profile photo, then **Create your workspace**  no separate review step); **join existing org** (dropdown + teams + subscriptions + **Review & submit**) appears when the URL has **`?org={slug}`** (invite link). The org list is not fetched without that param.

## 4. Shared types

**File:** `packages/types/src/roles.ts`

- `PROFILE_REGISTRATION_ROLE`, `PROFILE_STATUSES`, `ProfileRole`  used when creating or validating registration state.

## 5. Verification checklist

- [x] New user with valid metadata gets `profiles` + `user_departments` without duplicate key errors. _DB: `apply_registration_from_user_meta` exits early if a profile exists; client path treats Postgres `23505` as success when the row is present (`completeRegistrationProfile.ts`). Jest: `completeRegistrationProfile.test.ts`._
- [x] User without metadata sees clear error, not infinite spinner. _(`/pending` + `completeRegistrationProfileIfNeeded` error UI.)_
- [x] Middleware does not strip cookies on `NextResponse.next` clone bugs. _`middleware.ts` rebuilds `NextResponse.next` in `setAll` (Supabase SSR pattern). No automated cookie e2e here  rely on that pattern + manual login smoke._
- [x] `/pending` shows email verification hint when `email_confirmed_at` missing. _(Amber callout; copy distinguishes org approval vs email.)_
- [x] Platform admin host behaves per `middleware.ts` (no accidental org slug). _`resolveHostRequestContext` ignores `?org=` when the host is `admin.camp-site.co.uk` or `admin.localhost`. Jest: `middlewareHostContext.test.ts`._

### Automated tests (`npm run test --workspace=@campsite/web`)

- `src/lib/__tests__/middlewareHostContext.test.ts`  tenant vs platform-admin host, `?org=` rules.
- `src/lib/__tests__/authPaths.test.ts`  auth path matcher used by middleware.
- `src/lib/__tests__/completeRegistrationProfile.test.ts`  RPC fallback, duplicate-profile race, missing metadata.

### Routing note

- Authenticated user with **no** `profiles` row is redirected from `/` to **`/pending`** so metadata/RPC can create the profile before showing the registration wizard error path (matches §3.2).

## 6. Common pitfalls

- **Double insert** on `profiles` if both trigger and client insert run  coordinate migrations with `completeRegistrationProfileIfNeeded`.
- **Role literal drift:** never hardcode `'unassigned'` in SQL CHECK without updating `packages/types`.
