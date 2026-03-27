# 11 — Platform founders / HQ (`platform_admins`, `/founders`)

## 1. Product intent

- **Common Ground / platform operators** manage **cross-tenant** concerns: org lifecycle, support, internal tools — **outside** normal org member roles.
- **Identity** is **`platform_admins.user_id`**, **not** `profiles.role`. Do **not** treat `org_admin` as platform admin.

## 2. Backend (Supabase)

### 2.1 Table

**Migration reference:** `supabase/migrations/20250329000001_phase5_admin_platform.sql`

| Table | Purpose |
|-------|---------|
| `platform_admins` | One row per platform operator `user_id` |

**Helper (if present):** `public.is_platform_admin()` — grep migrations for exact signature.

### 2.2 RLS / RPCs

- Org-scoped tables remain **RLS-isolated**; platform admin access uses **`SECURITY DEFINER`** RPCs or **service role** from trusted server environments only.
- **Never** expose service role keys to the browser.

**When adding founder UI:** Prefer **Next.js server actions** or **route handlers** that use a **server-only** Supabase client with elevated credentials, or call Supabase Edge with verify JWT + explicit platform check.

## 3. Frontend (`apps/web`)

### 3.1 Founders page

**File:** `apps/web/src/app/(founders)/founders/page.tsx`

**Gate helper:** `apps/web/src/lib/platform/requirePlatformFounder.ts` (queries `platform_admins`, silent `redirect('/')`).

**Types constant (docs / imports):** `PLATFORM_ADMIN_MEMBERSHIP_TABLE` from `@campsite/types` (`packages/types/src/platform.ts`).

**Server steps:**

1. `getUser()` → redirect `/login?next=/founders` if absent.
2. `requirePlatformFounder(supabase, user.id)` — select from `platform_admins` where `user_id = user.id`; if no row → **`redirect('/')`** (silent deny).
3. Load optional `profiles` for display name / avatar.
4. Render `FounderHqApp` (`components/founders/FounderHqApp.tsx`).

### 3.2 Middleware / host routing

**File:** `apps/web/src/middleware.ts`

- Sets **`x-campsite-platform-admin`** when host matches **platform admin hostname** or `admin.localhost`.
- `/platform/*` redirect rules for login compatibility.

**When testing:** Use documented local hostnames from project README / env.

## 4. Relationship to org admin

| Concept | Storage | UI |
|---------|---------|-----|
| Org admin | `profiles.role` | `/admin/*` on tenant subdomain |
| Platform admin | `platform_admins` | `/founders` (or separate admin host product) |

## 5. Tests

- `apps/web/src/lib/platform/__tests__/requirePlatformFounder.test.ts` — gate redirects when no `platform_admins` row; asserts `PLATFORM_ADMIN_MEMBERSHIP_TABLE` from `@campsite/types`.

## 6. Verification checklist

- [x] Org admin **without** `platform_admins` row cannot open `/founders` (server gate + Jest).
- [x] Platform admin can open `/founders` on any host where middleware sets session (same as other authed routes; no host block for `/founders`).
- [x] No client-side-only destructive cross-org mutations today — `FounderHqApp` is mock/local state; only `auth.signOut()` uses the browser client. Re-check when wiring real RPCs/server actions.

## 7. Implementation order (new platform capability)

1. SQL: RPC with explicit `platform_admins` check (or reuse `is_platform_admin`).
2. Server-only API route or Server Action calling Supabase with appropriate client.
3. `FounderHqApp` UI section.
4. Audit log (recommended) for cross-org mutations.
