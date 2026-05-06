-- Phase 3  Rota, calendar events, Google connections, Sheets mappings.

-- ---------------------------------------------------------------------------
-- Profile: shift reminder preference (minutes before shift; NULL = off)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists shift_reminder_before_minutes integer
    check (
      shift_reminder_before_minutes is null
      or shift_reminder_before_minutes in (30, 60, 120, 240, 1440)
    );

comment on column public.profiles.shift_reminder_before_minutes is
  'Minutes before shift start to remind; NULL = disabled.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.rota_shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  dept_id uuid references public.departments (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  role_label text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'sheets_import')),
  overridden_from_sync boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index rota_shifts_org_id_idx on public.rota_shifts (org_id);
create index rota_shifts_user_id_idx on public.rota_shifts (user_id);
create index rota_shifts_dept_id_idx on public.rota_shifts (dept_id);
create index rota_shifts_start_time_idx on public.rota_shifts (start_time);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  dept_id uuid references public.departments (id) on delete set null,
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  all_day boolean not null default false,
  source text not null check (source in ('broadcast', 'rota', 'manual')),
  broadcast_id uuid references public.broadcasts (id) on delete set null,
  shift_id uuid references public.rota_shifts (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  google_event_id text,
  created_at timestamptz not null default now(),
  check (
    all_day = true
    or end_time is null
    or end_time > start_time
  )
);

create index calendar_events_org_id_idx on public.calendar_events (org_id);
create index calendar_events_start_idx on public.calendar_events (start_time);
create index calendar_events_broadcast_idx on public.calendar_events (broadcast_id)
  where broadcast_id is not null;

create table public.google_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('calendar', 'sheets')),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  sheets_url text,
  spreadsheet_id text,
  sheet_name text,
  sync_interval text not null default 'manual'
    check (sync_interval in ('manual', '6h', '24h')),
  last_synced_at timestamptz,
  google_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type)
);

create index google_connections_user_idx on public.google_connections (user_id);

create table public.sheets_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  connection_id uuid references public.google_connections (id) on delete set null,
  col_name text,
  col_date text,
  col_start text,
  col_end text,
  col_dept text,
  col_role text,
  sheet_name text,
  header_row integer not null default 1,
  created_at timestamptz not null default now()
);

create index sheets_mappings_org_idx on public.sheets_mappings (org_id);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_rota_for_dept(p_dept_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r text;
begin
  select p.role into r from public.profiles p where p.id = auth.uid();
  if r is null then
    return false;
  end if;
  if r in ('super_admin', 'senior_manager') then
    return exists (
      select 1 from public.departments d
      where d.id = p_dept_id and d.org_id = public.current_org_id()
    );
  end if;
  if r = 'manager' then
    return exists (
      select 1 from public.dept_managers dm
      where dm.user_id = auth.uid() and dm.dept_id = p_dept_id
    );
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.rota_shifts enable row level security;
alter table public.calendar_events enable row level security;
alter table public.google_connections enable row level security;
alter table public.sheets_mappings enable row level security;

-- rota_shifts: read
create policy rota_shifts_select
  on public.rota_shifts
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('super_admin', 'senior_manager')
      )
      or exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid()
          and dm.dept_id = rota_shifts.dept_id
      )
    )
  );

-- rota_shifts: write (managers+ for dept, or super/senior any dept in org)
create policy rota_shifts_insert
  on public.rota_shifts
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and (
      (
        dept_id is not null
        and public.can_manage_rota_for_dept(dept_id)
      )
      or (
        dept_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('super_admin', 'senior_manager')
        )
      )
    )
  );

create policy rota_shifts_update
  on public.rota_shifts
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      (dept_id is not null and public.can_manage_rota_for_dept(dept_id))
      or (
        dept_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('super_admin', 'senior_manager')
        )
      )
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      (dept_id is not null and public.can_manage_rota_for_dept(dept_id))
      or (
        dept_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('super_admin', 'senior_manager')
        )
      )
    )
  );

create policy rota_shifts_delete
  on public.rota_shifts
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      (dept_id is not null and public.can_manage_rota_for_dept(dept_id))
      or (
        dept_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.role in ('super_admin', 'senior_manager')
        )
      )
    )
  );

-- calendar_events: org members read
create policy calendar_events_select
  on public.calendar_events
  for select
  to authenticated
  using (org_id = public.current_org_id());

-- calendar_events: manual / rota-linked (Manager+)
create policy calendar_events_insert_managed
  on public.calendar_events
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and source in ('manual', 'rota')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.role in ('super_admin', 'senior_manager', 'manager')
    )
  );

-- calendar_events: from broadcast "Add to calendar" (any user who can read the broadcast)
create policy calendar_events_insert_from_broadcast
  on public.calendar_events
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and source = 'broadcast'
    and broadcast_id is not null
    and created_by = auth.uid()
    and exists (
      select 1 from public.broadcasts b
      where b.id = broadcast_id
        and public.broadcast_visible_to_reader(b)
    )
  );

create policy calendar_events_update
  on public.calendar_events
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('super_admin', 'senior_manager', 'manager')
      )
    )
  )
  with check (org_id = public.current_org_id());

create policy calendar_events_delete
  on public.calendar_events
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('super_admin', 'senior_manager', 'manager')
      )
    )
  );

-- google_connections: own rows only
create policy google_connections_own
  on public.google_connections
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- sheets_mappings: super_admin + senior_manager in org
create policy sheets_mappings_select
  on public.sheets_mappings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = sheets_mappings.org_id
        and p.role in ('super_admin', 'senior_manager')
    )
  );

create policy sheets_mappings_write
  on public.sheets_mappings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = sheets_mappings.org_id
        and p.role in ('super_admin', 'senior_manager')
    )
  )
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.org_id = sheets_mappings.org_id
        and p.role in ('super_admin', 'senior_manager')
    )
  );
