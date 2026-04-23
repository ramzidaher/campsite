-- Integrity + performance hardening pass (pre-launch safe path).
-- Focus: enforce high-value uniqueness and chronological guards.
-- Notes:
-- - Includes duplicate cleanup before unique indexes to prevent migration failure.
-- - Uses idempotent patterns so reruns are safe.

-- ---------------------------------------------------------------------------
-- 1) De-duplicate rows before uniqueness enforcement
-- ---------------------------------------------------------------------------

-- Keep most recently created weekly timesheet per (org_id, user_id, week_start_date).
with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, user_id, week_start_date
      order by coalesce(updated_at, created_at) desc, created_at desc, id desc
    ) as rn
  from public.weekly_timesheets
)
delete from public.weekly_timesheets t
using ranked r
where t.id = r.id
  and r.rn > 1;

-- Keep most recently updated allowance per (org_id, user_id, leave_year).
with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, user_id, leave_year
      order by coalesce(updated_at, created_at) desc, created_at desc, id desc
    ) as rn
  from public.leave_allowances
)
delete from public.leave_allowances t
using ranked r
where t.id = r.id
  and r.rn > 1;

-- Keep most recently updated pair settings row per manager/report pair.
with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, manager_user_id, report_user_id
      order by coalesce(updated_at, created_at) desc, created_at desc, id desc
    ) as rn
  from public.one_on_one_pair_settings
)
delete from public.one_on_one_pair_settings t
using ranked r
where t.id = r.id
  and r.rn > 1;

-- Keep most recently updated attendee row per (event_id, profile_id).
with ranked as (
  select
    id,
    row_number() over (
      partition by event_id, profile_id
      order by coalesce(updated_at, created_at) desc, created_at desc, id desc
    ) as rn
  from public.calendar_event_attendees
)
delete from public.calendar_event_attendees t
using ranked r
where t.id = r.id
  and r.rn > 1;

-- Keep most recent connection per (user_id, type).
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, type
      order by coalesce(updated_at, created_at) desc, created_at desc, id desc
    ) as rn
  from public.google_connections
)
delete from public.google_connections t
using ranked r
where t.id = r.id
  and r.rn > 1;

-- Keep most recently updated value row per user/definition.
with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, user_id, definition_id
      order by coalesce(updated_at, created_at) desc, created_at desc, id desc
    ) as rn
  from public.hr_custom_field_values
)
delete from public.hr_custom_field_values t
using ranked r
where t.id = r.id
  and r.rn > 1;

-- Keep one wagesheet line per logical line key.
with ranked as (
  select
    id,
    row_number() over (
      partition by org_id, user_id, week_start_date, line_type
      order by created_at desc, id desc
    ) as rn
  from public.wagesheet_lines
)
delete from public.wagesheet_lines t
using ranked r
where t.id = r.id
  and r.rn > 1;

-- ---------------------------------------------------------------------------
-- 2) Enforce uniqueness invariants
-- ---------------------------------------------------------------------------

create unique index if not exists weekly_timesheets_org_user_week_uq
  on public.weekly_timesheets (org_id, user_id, week_start_date);

create unique index if not exists leave_allowances_org_user_year_uq
  on public.leave_allowances (org_id, user_id, leave_year);

create unique index if not exists one_on_one_pair_settings_org_mgr_report_uq
  on public.one_on_one_pair_settings (org_id, manager_user_id, report_user_id);

create unique index if not exists calendar_event_attendees_event_profile_uq
  on public.calendar_event_attendees (event_id, profile_id);

create unique index if not exists google_connections_user_type_uq
  on public.google_connections (user_id, type);

create unique index if not exists hr_custom_field_values_org_user_definition_uq
  on public.hr_custom_field_values (org_id, user_id, definition_id);

create unique index if not exists wagesheet_lines_org_user_week_type_uq
  on public.wagesheet_lines (org_id, user_id, week_start_date, line_type);

create unique index if not exists job_listings_org_slug_uq
  on public.job_listings (org_id, slug);

create unique index if not exists org_roles_org_key_uq
  on public.org_roles (org_id, key)
  where is_archived = false;

create unique index if not exists hr_custom_field_definitions_org_key_uq
  on public.hr_custom_field_definitions (org_id, key)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- 3) Add chronological guards (NOT VALID first, then validate)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_end_on_or_after_start_chk'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_end_on_or_after_start_chk
      check (end_date >= start_date) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sickness_absences_end_on_or_after_start_chk'
  ) then
    alter table public.sickness_absences
      add constraint sickness_absences_end_on_or_after_start_chk
      check (end_date >= start_date) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'weekly_timesheets_week_end_on_or_after_start_chk'
  ) then
    alter table public.weekly_timesheets
      add constraint weekly_timesheets_week_end_on_or_after_start_chk
      check (week_end_date >= week_start_date) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'interview_slots_end_after_start_chk'
  ) then
    alter table public.interview_slots
      add constraint interview_slots_end_after_start_chk
      check (ends_at > starts_at) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'org_leave_holiday_periods_end_on_or_after_start_chk'
  ) then
    alter table public.org_leave_holiday_periods
      add constraint org_leave_holiday_periods_end_on_or_after_start_chk
      check (end_date >= start_date) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employee_employment_history_end_on_or_after_start_chk'
  ) then
    alter table public.employee_employment_history
      add constraint employee_employment_history_end_on_or_after_start_chk
      check (end_date is null or end_date >= start_date) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_events_end_after_start_when_timed_chk'
  ) then
    alter table public.calendar_events
      add constraint calendar_events_end_after_start_when_timed_chk
      check (all_day or end_time is null or end_time > start_time) not valid;
  end if;
end $$;

-- Validate in separate statements to minimize lock duration.
alter table public.leave_requests validate constraint leave_requests_end_on_or_after_start_chk;
alter table public.sickness_absences validate constraint sickness_absences_end_on_or_after_start_chk;
alter table public.weekly_timesheets validate constraint weekly_timesheets_week_end_on_or_after_start_chk;
alter table public.interview_slots validate constraint interview_slots_end_after_start_chk;
alter table public.org_leave_holiday_periods validate constraint org_leave_holiday_periods_end_on_or_after_start_chk;
alter table public.employee_employment_history validate constraint employee_employment_history_end_on_or_after_start_chk;
alter table public.calendar_events validate constraint calendar_events_end_after_start_when_timed_chk;
