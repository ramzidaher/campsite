-- Run with psql against the project DB after migrations (no pgTAP required).
-- Example: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/broadcast_plan02_functions_exist.sql

DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname IN (
      'user_should_receive_sent_broadcast',
      'broadcast_notification_recipient_user_ids',
      'user_has_dept_broadcast_permission',
      'broadcast_form_allowed',
      'get_my_dept_broadcast_caps'
    );
  IF n < 5 THEN
    RAISE EXCEPTION 'Expected at least 5 Plan 02-related functions, found %', n;
  END IF;
  RAISE NOTICE 'broadcast_plan02_functions_exist: ok (%)', n;
END $$;
