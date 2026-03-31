-- Phase 4: Interview slots, panelists, Google Calendar event ids, application booking fields.

-- ---------------------------------------------------------------------------
-- interview_slots
-- ---------------------------------------------------------------------------

create table public.interview_slots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  job_listing_id uuid not null references public.job_listings (id) on delete cascade,
  title text not null default 'Interview',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'available' check (status in ('available', 'booked', 'completed')),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index interview_slots_org_starts_idx on public.interview_slots (org_id, starts_at desc);
create index interview_slots_job_status_idx on public.interview_slots (org_id, job_listing_id, status, starts_at);

-- ---------------------------------------------------------------------------
-- Panelists (staff on interview panels)
-- ---------------------------------------------------------------------------

create table public.interview_slot_panelists (
  slot_id uuid not null references public.interview_slots (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (slot_id, profile_id)
);

create index interview_slot_panelists_profile_idx on public.interview_slot_panelists (profile_id);

-- ---------------------------------------------------------------------------
-- Stored Google Calendar event id per panelist calendar (primary)
-- ---------------------------------------------------------------------------

create table public.interview_slot_google_events (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.interview_slots (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  calendar_id text not null default 'primary',
  event_id text not null,
  created_at timestamptz not null default now(),
  unique (slot_id, profile_id)
);

create index interview_slot_google_events_slot_idx on public.interview_slot_google_events (slot_id);

-- ---------------------------------------------------------------------------
-- Application: link to booked slot + joining instructions for candidate
-- ---------------------------------------------------------------------------

alter table public.job_applications
  add column if not exists interview_slot_id uuid references public.interview_slots (id) on delete set null;

alter table public.job_applications
  add column if not exists interview_joining_instructions text;

create unique index if not exists job_applications_interview_slot_id_key
  on public.job_applications (interview_slot_id)
  where interview_slot_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.interview_slots enable row level security;
alter table public.interview_slot_panelists enable row level security;
alter table public.interview_slot_google_events enable row level security;

-- Org admins: full CRUD on slots in their org
create policy interview_slots_org_admin_all
  on public.interview_slots
  for all
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  )
  with check (
    org_id = public.current_org_id()
    and public.current_profile_role() in ('org_admin', 'super_admin')
  );

-- Panelists can see slots they are assigned to
create policy interview_slots_panelist_select
  on public.interview_slots
  for select
  to authenticated
  using (
    exists (
      select 1 from public.interview_slot_panelists p
      where p.slot_id = interview_slots.id
        and p.profile_id = auth.uid()
    )
  );

-- Panelists table
create policy interview_slot_panelists_org_admin_all
  on public.interview_slot_panelists
  for all
  to authenticated
  using (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_panelists.slot_id
        and s.org_id = public.current_org_id()
        and public.current_profile_role() in ('org_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_panelists.slot_id
        and s.org_id = public.current_org_id()
        and public.current_profile_role() in ('org_admin', 'super_admin')
    )
  );

create policy interview_slot_panelists_self_select
  on public.interview_slot_panelists
  for select
  to authenticated
  using (profile_id = auth.uid());

-- Google event mapping: org admins only
create policy interview_slot_google_events_org_admin_all
  on public.interview_slot_google_events
  for all
  to authenticated
  using (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_google_events.slot_id
        and s.org_id = public.current_org_id()
        and public.current_profile_role() in ('org_admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.interview_slots s
      where s.id = interview_slot_google_events.slot_id
        and s.org_id = public.current_org_id()
        and public.current_profile_role() in ('org_admin', 'super_admin')
    )
  );
