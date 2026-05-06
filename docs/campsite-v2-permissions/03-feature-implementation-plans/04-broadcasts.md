# 04  Broadcasts

## 1. Product intent

- **Read:** Members see a **feed** of sent (and relevant) broadcasts per org rules, subscriptions, mandatory flags, and RLS visibility.
- **Compose:** Only roles allowed by **`canComposeBroadcast`** may access composer UX; **duty manager** and **CSA** are **draft + submit for approval** only; **administrator** matches **manager** for send/schedule (see `isBroadcastDraftOnlyRole` and migration `20260404100000_administrator_broadcast_full_send.sql`).
- **Approve:** **Managers** (dept-scoped) and **org admins** approve `pending_approval` rows (`isBroadcastApproverRole`).
- **Department toggles:** `dept_broadcast_permissions` grants capabilities (org-wide send, no approval for coordinator, pin, mandatory, delete, etc.) per [../02-broadcast-baseline-toggles/PLAN.md](../02-broadcast-baseline-toggles/PLAN.md).

## 2. Shared types (`packages/types`)

**File:** `packages/types/src/broadcasts.ts`

| Helper | Purpose |
|--------|---------|
| `BROADCAST_STATUSES`, `BroadcastStatus` | Canonical status strings |
| `canComposeBroadcast(role)` | Who may open composer / compose tabs |
| `isBroadcastDraftOnlyRole(role)` | DM + CSA only (not administrator) |
| `isBroadcastApproverRole(role)` | Manager + org admin |

**Rules:**

- Do **not** reimplement these checks with ad hoc string compares in new code.
- When product changes baseline, update **this file** and **SQL** `broadcast_form_allowed` together.

**Related:** `packages/types/src/roles.ts` for org admin detection.

## 3. Backend  Schema and migrations (orientation)

**Foundational:** `supabase/migrations/20250326000001_phase2_broadcasts.sql`

**v2 dept permissions + RLS:** `20260330200000_broadcast_dept_permissions.sql`

**Caps RPC + `broadcast_form_allowed` updates:** `20260331140000_get_my_dept_broadcast_caps.sql`

**Administrator full send (aligned with manager):** `20260404100000_administrator_broadcast_full_send.sql`

**Other related:** `20260331210000_broadcast_sent_visibility_and_notification_recipients.sql`, `20260331220000_fix_user_may_broadcast_to_dept_ambiguous_d.sql`

When debugging, **`create or replace function`** in **later** migrations wins over earlier files.

## 4. Backend  Key SQL functions (contracts)

### 4.1 `user_may_compose_broadcasts()`

- Returns whether the current user may create broadcasts at all (role gate).
- Used in **RLS WITH CHECK** for inserts (see `broadcasts_insert_scoped`).

### 4.2 `user_may_broadcast_to_dept(p_dept_id uuid)`

- Ensures user belongs to / manages target department per role:
  - Org admin: yes in org
  - Manager: `dept_managers`
  - Coordinator / administrator / DM / CSA: `user_departments`
  - Society leader: society/club dept types + membership

**File reference:** `20260331220000_fix_user_may_broadcast_to_dept_ambiguous_d.sql`

### 4.3 `broadcast_form_allowed(p_status, p_dept_id, p_is_org_wide, p_is_mandatory, p_is_pinned)`

- Central **status + flag** validator for insert/update paths.
- Enforces dept **toggle** requirements for org-wide, mandatory, pin.
- Role branches:
  - Org admin / super_admin / society_leader: all statuses
  - DM / CSA: `draft`, `pending_approval` only; hard block on org-wide/mandatory/pin flags
  - Coordinator: `send_no_approval` toggle unlocks `scheduled`/`sent`
  - Manager **and administrator:** `draft`, `pending_approval`, `scheduled`, `sent`

### 4.4 `user_has_dept_broadcast_permission(p_user_id, p_dept_id, p_permission)`

- Resolves toggles from `dept_broadcast_permissions` with `min_role` / `coordinator_only` rules.

### 4.5 `get_my_dept_broadcast_caps(p_dept_id)`

- Returns JSON flags for **composer UI** (`send_org_wide`, `mandatory_broadcast`, `pin_broadcasts`).
- **Client:** `BroadcastComposer` calls via `.rpc('get_my_dept_broadcast_caps', { p_dept_id })`.

### 4.6 Read / unread

- **`broadcast_unread_count()`**  RPC for badge counts.
- **`broadcast_mark_all_read()`**  optional bulk read.
- **`broadcast_reads`** policies: see phase2 broadcasts migration (select/insert/update own).

### 4.7 Notifications

**Edge Function:** `supabase/functions/process-broadcast-notifications/index.ts`

- Processes queued jobs / push delivery (exact trigger path in migrations  grep `broadcast_notification`).

## 5. Backend  RLS policies (names to grep)

In `20260330200000_broadcast_dept_permissions.sql` (and overrides):

| Policy | Table | Intent |
|--------|-------|--------|
| `broadcasts_select_visible` | `broadcasts` | Read via `broadcast_visible_to_reader` |
| `broadcasts_insert_scoped` | `broadcasts` | Insert: creator, org, compose + dept + `broadcast_form_allowed` |
| `broadcasts_update_creator` | `broadcasts` | Author edits within allowed statuses |
| `broadcasts_update_manager` | `broadcasts` | Approver path for `pending_approval` |
| `dept_broadcast_permissions_*` | `dept_broadcast_permissions` | Org admin read/write toggles |

**Delete policies:** grep `broadcasts_delete` in later migrations (dept/org delete toggles).

## 6. Frontend  routes and server gates (`apps/web`)

| Path | File | Server behaviour |
|------|------|------------------|
| `/broadcasts` | `apps/web/src/app/(main)/broadcasts/page.tsx` | Auth + `org_id` + `status === 'active'`. Validates `?tab=` against role: unknown tab → redirect; compose/drafts/submitted require `canComposeBroadcast`; `scheduled` requires compose + not draft-only; `pending` requires `isBroadcastApproverRole`. |
| `/broadcasts/[id]` | `apps/web/src/app/(main)/broadcasts/[id]/page.tsx` | Detail view; relies on RLS for row access; `notFound()` if missing. |

## 7. Frontend  components (`apps/web`)

| Component | Path | Responsibilities |
|-----------|------|------------------|
| `BroadcastsClient` | `apps/web/src/components/broadcasts/BroadcastsClient.tsx` | Tabs: feed, compose, drafts, submitted, scheduled (if allowed), pending (approvers). Uses `canComposeBroadcast`, `isBroadcastDraftOnlyRole`, `isBroadcastApproverRole`. Hydrates filters from `sessionStorage`. |
| `BroadcastComposer` | `apps/web/src/components/broadcasts/BroadcastComposer.tsx` | Dept/category selection, title/body, flags gated by `get_my_dept_broadcast_caps`; submit paths differ for draft-only roles; respects RPC failures (surface Supabase errors). |
| `BroadcastFeed` | `apps/web/src/components/broadcasts/BroadcastFeed.tsx` | Feed listing, unread handling, filters. |
| `BroadcastDetailView` | `apps/web/src/components/broadcasts/BroadcastDetailView.tsx` | Single broadcast rendering. |
| `dept-scope` | `apps/web/src/components/broadcasts/dept-scope.ts` | `departmentsForBroadcast(role, ...)`  which departments appear in composer for each role. |

## 8. Frontend  admin routes (`apps/web`)

| Path | Gate | File |
|------|------|------|
| `/admin/broadcasts` | `canManageOrgBroadcastsAdmin` → org admin | `apps/web/src/app/(main)/admin/broadcasts/page.tsx` |
| `/admin/departments` | Includes **dept broadcast toggles** UI | `AdminDepartmentsClient.tsx` upserts `dept_broadcast_permissions` |

## 9. End-to-end implementation checklist (new capability)

1. **Product:** Update [PLAN.md](../02-broadcast-baseline-toggles/PLAN.md) matrix if baseline changes.
2. **SQL:** New migration `create or replace` for `broadcast_form_allowed`, `user_has_dept_broadcast_permission`, or RLS policies  never edit old migration files in place if already applied in prod. Then run `npm run supabase:db:push`.
3. **Types:** `packages/types/src/broadcasts.ts` (+ `dashboard.ts` if KPI/scope affected).
4. **Web:** `broadcasts/page.tsx` tab allowlist; `BroadcastsClient` / `BroadcastComposer` UI flags.
5. **Tests:** Jest `apps/web/src/lib/__tests__/broadcastTypes.test.ts` for type gates; SQL sanity script `supabase/scripts/verify_dept_broadcast_plan02.sql` (Dashboard SQL editor).
6. **Docs:** Update this file (types, SQL, web sections above).

## 10. Verification scenarios

- [x] CSA: draft + submit path in UI (`isBroadcastDraftOnlyRole`); **`sent`** requires DB (`broadcast_form_allowed` + RLS). _Types: `broadcastTypes.test.ts`._
- [x] Administrator: not draft-only; **`scheduled`** tab when `canComposeBroadcast` && !`isBroadcastDraftOnlyRole`. _SQL: `20260404100000_administrator_broadcast_full_send.sql` (`manager`/`administrator` branch)._
- [x] Coordinator without `send_no_approval`: **`broadcast_form_allowed`** restricts statuses (same family as CSA until toggle). _Confirm per-dept in SQL + toggles table._
- [x] Coordinator with toggle: **`user_has_dept_broadcast_permission`** / caps RPC unlock send. _See `get_my_dept_broadcast_caps` + `broadcast_form_allowed`._
- [x] Manager: **`decide_pending_broadcast`** / `broadcasts_update_manager` + RLS scoped to managed depts. _Manual / integration._
- [x] Org-wide toggle off: **`broadcast_form_allowed`** rejects `is_org_wide` even if client mis-sends. _SQL contract._

## 11. Automated tests (`npm run test --workspace=@campsite/web`)

- `src/lib/__tests__/broadcastTypes.test.ts`  `canComposeBroadcast`, `isBroadcastDraftOnlyRole`, `isBroadcastApproverRole`.

## 12. Debugging order

1. Read Supabase **error** from client (RLS shows as generic errors sometimes  use logs).
2. Evaluate **`broadcast_form_allowed`** inputs: status, dept, three booleans.
3. Evaluate **`user_may_broadcast_to_dept(dept_id)`**.
4. Evaluate **toggle** rows in `dept_broadcast_permissions` for that dept.
