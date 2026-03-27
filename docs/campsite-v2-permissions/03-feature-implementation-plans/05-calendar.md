# 05 — Calendar

## 1. Product intent

- Unified **calendar** showing **rota shifts**, **broadcast-derived** items (where implemented), and **manual / Google** events.
- **Visibility** must match **org boundaries** and **role-appropriate scope** (e.g. team vs org-wide views where applicable).
- **Editing** (create/update/delete events) must be enforced in **RLS**, not only hidden buttons.

## 2. Backend (Supabase)

### 2.1 Tables

**Primary migration:** `supabase/migrations/20250327000001_phase3_rota_calendar.sql` (later migrations may alter policies — grep for overrides).

| Table | Purpose |
|-------|---------|
| `calendar_events` | Manual and linked events (`shift_id`, `broadcast_id`, `google_event_id`, `org_id`, `created_by`, times) |
| `rota_shifts` | Rota shifts; joined from calendar for **shift** items |
| `google_connections` | Per-user Google OAuth (RLS: own rows) |
| `sheets_column_mappings` | Sheets import mapping (org-scoped RLS) |

**Web clients:** `CalendarClient.tsx` and `RotaClient.tsx` query **`rota_shifts`** (not `shifts`).

**Alignment:** `20260406180000_calendar_rota_super_admin_alignment.sql` — legacy **`super_admin`** treated like **`org_admin`** for `calendar_events` managed policies and org-wide **`rota_shifts`** visibility / `can_manage_rota_for_dept`.

### 2.2 RLS policies (baseline from phase3, updated in v2 + super_admin migration)

**`calendar_events`:**

| Policy | Operation | Intent (summary) |
|--------|-----------|------------------|
| `calendar_events_select` | SELECT | Org members read org’s events (`current_org_id()`) |
| `calendar_events_insert_managed` | INSERT | **`org_admin`**, **`super_admin`**, or **`manager`**; `source in ('manual','rota')` |
| `calendar_events_insert_from_broadcast` | INSERT | User adds broadcast-linked row if they can read that broadcast |
| `calendar_events_update` | UPDATE | **`created_by = auth.uid()`** or **`org_admin` / `super_admin` / `manager`** |
| `calendar_events_delete` | DELETE | Same as update USING |

**`rota_shifts` (select, relevant to calendar feed):**

- User sees **own** shifts, shifts in depts they **manage**, or **all org shifts** if **`org_admin`** or **`super_admin`** (`20260406180000`).

Re-read the **full** `USING` / `WITH CHECK` clauses in migrations before changing behaviour.

### 2.3 RPCs

- `CalendarClient.tsx` uses `.from('calendar_events')` and `.from('rota_shifts')` — grep the file for `.rpc(` when adding server-side helpers.

### 2.4 Edge / external

- **Google Calendar API:** OAuth flow may live under settings or integrations; tokens stored per org/user per migrations. UI placeholder: “Sync Google Calendar” in `CalendarClient`.

## 3. Frontend (`apps/web`)

### 3.1 Route

**File:** `apps/web/src/app/(main)/calendar/page.tsx`

**Server steps:**

1. `getUser()`; redirect `/login` if absent.
2. Load `profiles`: `id`, `org_id`, `role`, `full_name`, `status`.
3. Redirect: no `org_id` → `/login`; `status !== 'active'` → `/pending`.
4. Render `CalendarClient` with profile props.

### 3.2 Client component

**File:** `apps/web/src/components/calendar/CalendarClient.tsx`

**Patterns:**

- **`canManageCalendarManualEvents(role)`** from `@campsite/types` (same rule as managed calendar RLS) for “Add event” and managed CRUD UI.
- Fetches merged **CalItem** list: kinds `shift` | `event`, sources `rota` | `broadcast` | `manual`.
- **Month grid** navigation: `monthCalendarWeeks`, `startOfWeekMonday`, etc. from `@/lib/datetime`.

**When adding a feature:**

1. Add fetch in `useEffect` / callback with **typed** rows from Supabase.
2. Map to `CalItem` with stable `key`.
3. Gate **toolbar actions** with **`canManageCalendarManualEvents`** (or a new exported helper) in lockstep with **RLS**.

### 3.3 Styling

- Uses source-based chip colours (rota green, broadcast blue, manual purple) — keep consistent if adding sources.

## 4. Shared types

**File:** `packages/types/src/calendar.ts`

| Helper | Purpose |
|--------|---------|
| `canManageCalendarManualEvents(role)` | Manager or org admin (`isOrgAdminRole`, includes legacy `super_admin`); matches managed `calendar_events` policies. |

## 5. Verification checklist

- [x] Non-admin cannot mutate another user’s manual event except **creator** path (`created_by = auth.uid()`) or **manager/org admin** override — **RLS** `calendar_events_update` / `delete`.
- [x] Shift visibility on calendar matches **rota** `rota_shifts_select` (self, dept managers, org admins + legacy super_admin).
- [x] Org boundary: **`calendar_events_select`** and shift policies use **`current_org_id()`** / **`org_id`** — RLS is last line of defence.
- [ ] Timezone: events display in **browser local** time (`Date` parsing); DST edge cases not specially handled — document if product requires UTC storage + explicit TZ.

## 6. Automated tests (`npm run test --workspace=@campsite/web`)

- `src/lib/__tests__/calendarTypes.test.ts` — `canManageCalendarManualEvents`.

## 7. Implementation order (new calendar capability)

1. Migration: table columns + **RLS** + indexes; run `npm run supabase:db:push`.
2. Types helper in `packages/types` if role-based.
3. `CalendarClient` data load + UI.
4. Update this plan with exact policy and RPC names.
