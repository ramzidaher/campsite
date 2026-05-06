-- Supabase database linter (security): function search_path + permissive RLS tightening.
-- See: https://supabase.com/docs/guides/database/database-linter

-- ---------------------------------------------------------------------------
-- 1) Pin search_path on public functions (mitigate search_path hijacking)
-- ---------------------------------------------------------------------------

alter function public.leave_calendar_days_inclusive(date, date) set search_path to public;
alter function public.leave_calendar_year_key(uuid, date) set search_path to public;

alter function public.broadcasts_fill_sent_at() set search_path to public;
alter function public.broadcasts_touch_updated_at() set search_path to public;

alter function public.attendance_week_bounds(date) set search_path to public;
alter function public._geo_distance_m(numeric, numeric, numeric, numeric) set search_path to public;

alter function public._one_on_one_default_questions_array() set search_path to public;
alter function public._one_on_one_empty_doc() set search_path to public;
alter function public._one_on_one_doc_preview_text(text, jsonb) set search_path to public;
alter function public._one_on_one_merge_report_doc(jsonb, jsonb) set search_path to public;

alter function public._ssp_is_qualifying_day(date, smallint[]) set search_path to public;
alter function public._ssp_qualifying_days_per_week(smallint[]) set search_path to public;

alter function public._hr_metric_json_enabled(jsonb, text) set search_path to public;

-- ---------------------------------------------------------------------------
-- 2) RLS: scope “service manages *” policies to service_role (not PUBLIC)
-- ---------------------------------------------------------------------------

drop policy if exists "service role manages application notifications" on public.application_notifications;
create policy "service role manages application notifications"
  on public.application_notifications
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists hr_metric_notifications_service_all on public.hr_metric_notifications;
create policy hr_metric_notifications_service_all
  on public.hr_metric_notifications
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service role manages leave notifications" on public.leave_notifications;
create policy "service role manages leave notifications"
  on public.leave_notifications
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service role manages recruitment notifications" on public.recruitment_notifications;
create policy "service role manages recruitment notifications"
  on public.recruitment_notifications
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 3) RLS: organisations platform update  avoid WITH CHECK (true)
-- ---------------------------------------------------------------------------

drop policy if exists organisations_platform_update on public.organisations;
create policy organisations_platform_update
  on public.organisations
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
