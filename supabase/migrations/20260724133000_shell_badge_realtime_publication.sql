-- Enable realtime events for shell badge/notification-driven updates.
-- Idempotent: only adds tables that are not already published.

do $$
declare
  target_table text;
  target_schema text;
  target_name text;
begin
  foreach target_table in array array[
    'public.broadcast_reads',
    'public.broadcasts',
    'public.recruitment_notifications',
    'public.application_notifications',
    'public.leave_notifications',
    'public.hr_metric_notifications',
    'public.calendar_event_notifications',
    'public.performance_reviews',
    'public.onboarding_runs',
    'public.rota_change_requests',
    'public.leave_requests',
    'public.toil_credit_requests',
    'public.recruitment_requests',
    'public.profiles',
    'public.dept_managers'
  ]
  loop
    target_schema := split_part(target_table, '.', 1);
    target_name := split_part(target_table, '.', 2);

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = target_schema
        and tablename = target_name
    ) then
      execute format('alter publication supabase_realtime add table %I.%I', target_schema, target_name);
    end if;
  end loop;
end;
$$;
