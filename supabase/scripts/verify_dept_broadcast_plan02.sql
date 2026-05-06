-- Run in Supabase Dashboard → SQL after Plan 02 migrations through
-- 20260331210000_broadcast_sent_visibility_and_notification_recipients.sql.

-- ---------------------------------------------------------------------------
-- 1) Core functions exist
-- ---------------------------------------------------------------------------
select proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in (
    'user_has_dept_broadcast_permission',
    'user_has_any_dept_broadcast_permission',
    'broadcast_form_allowed',
    'get_my_dept_broadcast_caps',
    'user_should_receive_sent_broadcast',
    'broadcast_notification_recipient_user_ids'
  )
order by 1;
-- Expect 6 rows.

-- ---------------------------------------------------------------------------
-- 2) Table dept_broadcast_permissions
-- ---------------------------------------------------------------------------
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'dept_broadcast_permissions'
order by ordinal_position;

-- ---------------------------------------------------------------------------
-- 3) Broadcast flag columns
-- ---------------------------------------------------------------------------
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'broadcasts'
  and column_name in ('is_mandatory', 'is_pinned', 'is_org_wide')
order by 1;

-- ---------------------------------------------------------------------------
-- 4) Manual QA  § Stacking examples (PLAN.md)
-- ---------------------------------------------------------------------------
-- Use staging users: HR Manager, HR Coordinator, Engagement Manager,
-- Engagement Coordinator with appropriate profiles.role, dept_managers /
-- user_departments, and rows in dept_broadcast_permissions. Then verify:
--
-- A) HR Manager with toggles: send_org_wide, delete_org_broadcasts,
--    edit_others_broadcasts, pin_broadcasts, mandatory_broadcast
--    → can compose with all three flags; can approve dept queue (baseline).
-- B) HR Coordinator + same dept + send_no_approval
--    → direct send/schedule; org-wide/mandatory if toggles allow; no pin /
--    delete_org unless toggles grant (coordinator min_role paths).
-- C) Engagement Manager, no toggles → compose without extra flags; RLS rejects
--    is_org_wide / is_mandatory / is_pinned on insert.
-- D) Engagement Coordinator, no toggles → draft + pending only; no direct send.
--
-- Also call from SQL as the app would (replace UUIDs):
-- select public.get_my_dept_broadcast_caps('00000000-0000-0000-0000-000000000000'::uuid);
-- (Returns all false when not authenticated; run as a logged-in session in
--  Dashboard only for meaningful caps.)
--
-- 5) Notification fan-out (service_role only from API; in SQL as postgres):
--    select * from public.broadcast_notification_recipient_user_ids(
--      '<sent_broadcast_id>'::uuid
--    );
--    Count should match “who can see this in the feed” for sent rows.
