-- Prevent overlapping time windows on key scheduling/history tables.
-- Uses GiST exclusion constraints with btree_gist for equality operators.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- rota_shifts: no overlapping shifts per (org_id, user_id)
-- ---------------------------------------------------------------------------

do $$
declare
  v_has_overlap boolean;
begin
  select exists (
    select 1
    from public.rota_shifts a
    join public.rota_shifts b
      on a.id < b.id
     and a.org_id = b.org_id
     and a.user_id = b.user_id
     and a.user_id is not null
     and tstzrange(a.start_time, a.end_time, '[)')
         && tstzrange(b.start_time, b.end_time, '[)')
  ) into v_has_overlap;

  if not exists (
    select 1 from pg_constraint where conname = 'rota_shifts_no_overlap_per_user_excl'
  ) and not v_has_overlap then
    alter table public.rota_shifts
      add constraint rota_shifts_no_overlap_per_user_excl
      exclude using gist (
        org_id with =,
        user_id with =,
        tstzrange(start_time, end_time, '[)') with &&
      )
      where (user_id is not null);
  elsif v_has_overlap then
    raise notice 'Skipped rota_shifts exclusion constraint: overlapping rows exist; clean data then re-apply.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- interview_slots: no overlapping active slots per (org_id, job_listing_id)
-- ---------------------------------------------------------------------------

do $$
declare
  v_has_overlap boolean;
begin
  select exists (
    select 1
    from public.interview_slots a
    join public.interview_slots b
      on a.id < b.id
     and a.org_id = b.org_id
     and a.job_listing_id = b.job_listing_id
     and a.status in ('available', 'booked')
     and b.status in ('available', 'booked')
     and tstzrange(a.starts_at, a.ends_at, '[)')
         && tstzrange(b.starts_at, b.ends_at, '[)')
  ) into v_has_overlap;

  if not exists (
    select 1 from pg_constraint where conname = 'interview_slots_no_overlap_active_excl'
  ) and not v_has_overlap then
    alter table public.interview_slots
      add constraint interview_slots_no_overlap_active_excl
      exclude using gist (
        org_id with =,
        job_listing_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (status in ('available', 'booked'));
  elsif v_has_overlap then
    raise notice 'Skipped interview_slots exclusion constraint: overlapping rows exist; clean data then re-apply.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- employee_employment_history: no overlapping periods per (org_id, user_id)
-- ---------------------------------------------------------------------------

do $$
declare
  v_has_overlap boolean;
begin
  select exists (
    select 1
    from public.employee_employment_history a
    join public.employee_employment_history b
      on a.id < b.id
     and a.org_id = b.org_id
     and a.user_id = b.user_id
     and daterange(a.start_date, coalesce(a.end_date, 'infinity'::date), '[]')
         && daterange(b.start_date, coalesce(b.end_date, 'infinity'::date), '[]')
  ) into v_has_overlap;

  if not exists (
    select 1 from pg_constraint where conname = 'employee_employment_history_no_overlap_excl'
  ) and not v_has_overlap then
    alter table public.employee_employment_history
      add constraint employee_employment_history_no_overlap_excl
      exclude using gist (
        org_id with =,
        user_id with =,
        daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&
      );
  elsif v_has_overlap then
    raise notice 'Skipped employee_employment_history exclusion constraint: overlapping rows exist; clean data then re-apply.';
  end if;
end $$;
