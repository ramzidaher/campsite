-- Resolve legacy overlapping rota assignments, then enforce no-overlap constraint.
-- Strategy:
-- - Keep the earliest-created shift assignment in each overlap conflict set.
-- - Unassign conflicting secondary rows (set user_id = null) and preserve row with note.
-- - Enforce exclusion constraint for future writes.

create table if not exists public.rota_shift_overlap_cleanup_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  shift_id uuid not null references public.rota_shifts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  conflict_with_shift_id uuid not null references public.rota_shifts(id) on delete cascade,
  cleaned_at timestamptz not null default now(),
  reason text not null default 'auto-unassigned-overlap'
);

create index if not exists rota_shift_overlap_cleanup_events_org_cleaned_idx
  on public.rota_shift_overlap_cleanup_events (org_id, cleaned_at desc);

with conflicts as (
  select
    newer.id as shift_id,
    newer.org_id,
    newer.user_id,
    older.id as conflict_with_shift_id
  from public.rota_shifts newer
  join public.rota_shifts older
    on newer.id <> older.id
   and newer.org_id = older.org_id
   and newer.user_id = older.user_id
   and newer.user_id is not null
   and tstzrange(newer.start_time, newer.end_time, '[)')
       && tstzrange(older.start_time, older.end_time, '[)')
   and (
     newer.created_at > older.created_at
     or (newer.created_at = older.created_at and newer.id::text > older.id::text)
   )
),
dedup as (
  select distinct on (shift_id)
    shift_id,
    org_id,
    user_id,
    conflict_with_shift_id
  from conflicts
  order by shift_id, conflict_with_shift_id
),
logged as (
  insert into public.rota_shift_overlap_cleanup_events (
    org_id,
    shift_id,
    user_id,
    conflict_with_shift_id
  )
  select
    d.org_id,
    d.shift_id,
    d.user_id,
    d.conflict_with_shift_id
  from dedup d
  on conflict do nothing
  returning shift_id
)
update public.rota_shifts s
set
  user_id = null,
  notes = trim(
    both from concat(
      coalesce(nullif(s.notes, ''), ''),
      case when coalesce(nullif(s.notes, ''), '') <> '' then ' | ' else '' end,
      '[auto-overlap-cleanup] assignment removed to resolve user overlap'
    )
  )
where s.id in (select shift_id from logged);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rota_shifts_no_overlap_per_user_excl'
  ) then
    alter table public.rota_shifts
      add constraint rota_shifts_no_overlap_per_user_excl
      exclude using gist (
        org_id with =,
        user_id with =,
        tstzrange(start_time, end_time, '[)') with &&
      )
      where (user_id is not null);
  end if;
end $$;
