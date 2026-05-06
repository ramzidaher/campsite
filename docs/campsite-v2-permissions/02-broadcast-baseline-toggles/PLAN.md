# Plan 02  Broadcasts: role baseline, department toggles, stacking

**Parent:** [Campsite v2 permissions](../) · **Depends on:** [01-core-model-resolution](../01-core-model-resolution/)  start with [ROLE-MAPPING.md](../01-core-model-resolution/ROLE-MAPPING.md) (Option A: canonical `profiles.role` + legacy migration). **Feeds:** [08-database-rls-migrations](../08-database-rls-migrations/), [09-org-admin-ui-white-label](../09-org-admin-ui-white-label/)

## Purpose

Implement the v2 **broadcast** slice: fixed **role baseline** plus **per-department toggles** that stack, including org-wide sends, approval bypass for coordinators, edit/delete others, pin, and mandatory delivery. This plan is the product + technical contract; migrations and RLS live in Plan 08.

## Current implementation (gap baseline)

Today’s schema and helpers live in [supabase/migrations/20250326000001_phase2_broadcasts.sql](../../supabase/migrations/20250326000001_phase2_broadcasts.sql) (updated `user_may_broadcast_to_dept` in [20260326130000_fix_user_may_broadcast_to_dept_ambiguous_d.sql](../../supabase/migrations/20260326130000_fix_user_may_broadcast_to_dept_ambiguous_d.sql)).

| Area | Today | v2 spec |
|------|--------|---------|
| Compose | `user_may_compose_broadcasts()`  includes `assistant`, `coordinator`, `manager`, `senior_manager`, `super_admin`, `society_leader` | Baseline: **DM / CSA = draft + approval**; **Administrator = full send** (like manager); align role names with v2 mapping (Plan 01 table) |
| Target dept | `user_may_broadcast_to_dept(p_dept_id)`  manager via `dept_managers`, coordinator/assistant via `user_departments` | Same **explicit `dept_id`** idea; org-wide is **new** (toggle + `is_org_wide` / routing) |
| Status on insert | `broadcast_status_allowed_for_insert`  `assistant` → draft/pending only; others also scheduled/sent | Coordinator **send_no_approval** toggle: allow `sent`/`scheduled` without manager path when toggle + role |
| Approval | `broadcasts_update_manager`  `dept_managers` for broadcast’s `dept_id`, or `super_admin`/`senior_manager` | Keep dept-scoped managers; add toggle logic so some coordinator posts **skip** pending |
| Visibility | `broadcast_visible_to_reader`  subscriptions on `cat_id` for `sent`; admins see more | **Mandatory** bypasses subscription; **pinned** ordering in feed |
| Delete | [broadcasts_delete_super_admin_draft](../../supabase/migrations/20250329000001_phase5_admin_platform.sql)  super_admin, draft only | Own delete; dept delete toggle; org delete toggle; org admin |

## Role baseline (spec)

Applies regardless of department toggles (spec names; map to `profiles.role` in Plan 01 / migrations).

| Permission | Org Admin | Manager | Coordinator | Administrator | Duty Manager | CSA |
|------------|-----------|---------|-------------|---------------|--------------|-----|
| View broadcast feed | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Send to own department | ✓ | ✓ | ✓ | ✓ (full send) | Draft only | Draft only |
| Send without approval (own posts) | ✓ | ✓ | ✓ | ✓ |  |  |
| Approve pending broadcasts | ✓ | ✓ (dept) |  |  |  |  |
| Delete own broadcasts | ✓ | ✓ | ✓ |  |  |  |
| Edit own broadcasts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Schedule broadcasts | ✓ | ✓ | ✓ | ✓ |  |  |

**Implementation note:** “Approve pending” must remain **row-scoped** to the broadcast’s `dept_id` (manager is approver for **that** department’s queue), consistent with [broadcasts_update_manager](../../supabase/migrations/20250326000001_phase2_broadcasts.sql).

## Department toggles (spec)

Org Admin enables per department. **Off by default.** Each row is `(dept_id, permission)` with a **`min_role`** of `manager` or `coordinator` (see spec CHECK). Eligibility uses **union across all of the user’s departments** for “has capability”; **actions on a row** still apply Plan 01 row rules (e.g. delete-in-dept requires broadcast `dept_id` ∈ user’s depts where spec says so).

| Permission key | Unlocks | Applies to (spec) |
|----------------|---------|-------------------|
| `send_org_wide` | Send to entire org (still respect category subscriptions unless mandatory) | Manager, Coordinator |
| `send_no_approval` | Coordinator’s **own** posts skip manager approval | Coordinator only |
| `edit_others_broadcasts` | Edit others’ posts (any author/dept  define edge cases in RLS) | Manager, Coordinator |
| `delete_dept_broadcasts` | Delete any broadcast **in that department** | Manager, Coordinator |
| `delete_org_broadcasts` | Delete any broadcast org-wide | Manager only |
| `pin_broadcasts` | Pin to top of feed for subscribers | Manager only |
| `mandatory_broadcast` | Mark mandatory  bypass subscription preferences | Manager only |

## Stacking examples (acceptance scenarios)

Use these as QA / doc scenarios after implementation:

1. **HR Manager**  dept has: `send_org_wide`, `delete_org_broadcasts`, `edit_others_broadcasts`, `pin_broadcasts`, `mandatory_broadcast` → org-wide send ✓, org-wide delete ✓, edit others ✓, pin ✓, mandatory ✓, approve dept drafts ✓ (baseline).
2. **HR Coordinator**  same dept toggles + `send_no_approval` → org-wide send ✓, org-wide delete ✗, edit others ✓, skip approval on own ✓, pin ✗, approve others ✗ (baseline).
3. **Engagement Manager**  no toggles → own-dept send ✓, approve dept drafts ✓, no org-wide / no org delete.
4. **Engagement Coordinator**  no toggles → baseline only (own-dept draft path, no approval power).

## Org-wide, subscriptions, mandatory

- **Org-wide send (`send_org_wide`):** Delivery targets **all org members** (or all subscribed to org feed  **decide in Plan 08** with product), but **per-user category subscription** still filters **unless** the post is mandatory.
- **Mandatory (`is_mandatory` + `mandatory_broadcast` toggle on sender’s eligible role/dept):** Deliver to everyone in the target group **regardless of** `user_subscriptions` for that category.
- **Feed UX:** Distinct visual treatment for mandatory (and pinned). Detailed UI in Plan 09; mobile/web must share semantics.

**Open product item (from spec):** mandatory **read receipts / audit log** vs delivery-only  flag in Plan 08 if table or `broadcast_reads` extension is required.

## Schema additions (contract  implement in Plan 08)

From v2 spec (wording may be adjusted to match existing naming):

1. **`dept_broadcast_permissions`**  `(dept_id, permission)` PK, `min_role`, `granted_by`, `granted_at`.
2. **`broadcasts`** columns: `is_mandatory boolean default false`, `is_pinned boolean default false`, `is_org_wide boolean default false`.
3. **Helper:** `user_has_broadcast_permission(p_user_id, p_permission) returns boolean`  **multi-dept union** + `min_role` + org admin shortcut; align with Plan 01.
4. **RLS / policies:** INSERT/UPDATE/DELETE paths updated so:
   - Org-wide insert requires toggle + role.
   - Coordinator direct send requires `send_no_approval` where applicable.
   - Edit/delete others and delete policies match spec (including org admin).
5. **`broadcast_visible_to_reader`** (and notification job consumer if any): include mandatory bypass and pinned sort key (e.g. order pinned first, then `sent_at`).

## Manager vs `dept_managers`

Current code ties **manager-level dept access** to [dept_managers](../../supabase/migrations/20250326000001_phase2_broadcasts.sql). v2 “Manager assigned dept(s)” should stay consistent: toggles apply to users who are managers **of that department**, not only `user_departments`  **confirm in Plan 08** that toggle checks use the same membership source as `user_may_broadcast_to_dept` for managers.

## Out of scope for Plan 02

- Societies/clubs (deferred in spec).
- Full permission matrix for rota, leave, discounts (Plans 05–07).
- **Grant custom permissions to managers** for discounts  cross-reference Plan 07; broadcast-specific toggles only here.

## Deliverables checklist (when executing)

- [x] Migration(s): `20260330200000_broadcast_dept_permissions.sql`  `dept_broadcast_permissions`, `is_mandatory` / `is_pinned` / `is_org_wide`, helpers, RLS (insert/update/delete/edit-others), `search_broadcasts` order.
- [x] Replace `broadcast_status_allowed_for_insert` usage with `broadcast_form_allowed(status, dept_id, flags…)`; coordinator `send_no_approval` + flag checks on anchor `dept_id`.
- [x] `user_may_broadcast_to_dept`: legacy `super_admin` may target any org dept (same as `org_admin`); org-wide remains anchor `dept_id` + `is_org_wide` + toggles  no separate successor function.
- [x] Notification fan-out contract: `user_should_receive_sent_broadcast` + `broadcast_notification_recipient_user_ids`; Edge `process-broadcast-notifications` (service-role Bearer) lists pending jobs + recipient counts  wire Expo/FCM + `processed_at` next.
- [x] Org Admin UI: grant/revoke rows in `dept_broadcast_permissions` per department (`AdminDepartmentsClient` + migrations through `20260331120000…`).
- [x] Composer UI: toggles for pin / mandatory / org-wide via `get_my_dept_broadcast_caps` + `broadcast_form_allowed` on write (`BroadcastComposer`).
- [x] API or RPC: `get_my_dept_broadcast_caps(p_dept_id)` (`20260331140000_get_my_dept_broadcast_caps.sql`).
- [x] Smoke verification: [`verify_dept_broadcast_plan02.sql`](../../../supabase/scripts/verify_dept_broadcast_plan02.sql) (objects + manual QA for § Stacking examples).
- [x] Mobile feed: `apps/mobile/app/(tabs)/broadcasts.tsx` + `lib/broadcastFeedQuery.ts` (badges, pull-to-refresh, legacy column fallback via AsyncStorage).
- [x] Web legacy hint: remove `NEXT_PUBLIC_BROADCAST_FEED_LEGACY` after migration; clear `localStorage` key `campsite.bf.feed_legacy_select` once to re-enable pin ordering (or leave unset after fresh deploy).

**Out of this plan (separate epics):** Plans **05–09** (rota matrix, discounts, org-admin polish, etc.)  not part of Plan 02 broadcast slice.

---

*Version: 2.0 alignment  role × department broadcast stacking.*
