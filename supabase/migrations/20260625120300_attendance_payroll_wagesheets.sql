-- Attendance (clock in/out), weekly timesheets, wagesheets, work sites, org settings.
-- SSP: sickness_absences can be voided; ssp_calculation_summary ignores voided rows.

-- ---------------------------------------------------------------------------
-- 1. HR columns
-- ---------------------------------------------------------------------------

alter table public.employee_hr_records
  add column if not exists timesheet_clock_enabled boolean not null default false,
  add column if not exists hourly_pay_gbp numeric(14, 4)
    check (hourly_pay_gbp is null or hourly_pay_gbp >= 0);

comment on column public.employee_hr_records.timesheet_clock_enabled is
  'When true, employee may use clock in/out for this org.';
comment on column public.employee_hr_records.hourly_pay_gbp is
  'Base hourly pay rate for wagesheet basic hours (GBP).';

alter table public.sickness_absences
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason_code text,
  add column if not exists void_notes text,
  add column if not exists voided_by uuid references public.profiles (id) on delete set null;

comment on column public.sickness_absences.voided_at is
  'When set, episode is excluded from SSP and reporting.';

-- ---------------------------------------------------------------------------
-- 2. Org + sites
-- ---------------------------------------------------------------------------

create table if not exists public.org_attendance_settings (
  org_id uuid primary key references public.organisations (id) on delete cascade,
  geo_strict boolean not null default true,
  default_site_radius_m numeric(10, 2) not null default 100
    check (default_site_radius_m > 0),
  reject_allows_employee_resubmit boolean not null default true,
  reject_allows_manager_correction boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.work_sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null default '',
  lat numeric(11, 8) not null,
  lng numeric(11, 8) not null,
  radius_m numeric(10, 2) not null default 100 check (radius_m > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists work_sites_org_idx on public.work_sites (org_id);

-- ---------------------------------------------------------------------------
-- 3. Attendance + timesheets + wagesheets
-- ---------------------------------------------------------------------------

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_site_id uuid references public.work_sites (id) on delete set null,
  clocked_at timestamptz not null,
  direction text not null check (direction in ('in', 'out')),
  source text not null check (source in ('self_web', 'self_mobile', 'manager_proxy')),
  lat numeric(11, 8),
  lng numeric(11, 8),
  accuracy_m numeric(10, 2),
  within_site boolean,
  manager_reason text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists attendance_events_org_user_time_idx
  on public.attendance_events (org_id, user_id, clocked_at);

create table if not exists public.weekly_timesheets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start_date date not null,
  week_end_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  reported_total_minutes integer,
  approved_total_minutes integer,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id, week_start_date)
);

create index if not exists weekly_timesheets_org_week_idx
  on public.weekly_timesheets (org_id, week_start_date);

create table if not exists public.wagesheet_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start_date date not null,
  line_type text not null,
  description text,
  hours numeric(14, 4),
  hourly_rate_gbp numeric(14, 4),
  amount_gbp numeric(14, 4) not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, user_id, week_start_date, line_type)
);

create index if not exists wagesheet_lines_org_week_idx
  on public.wagesheet_lines (org_id, week_start_date);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.org_attendance_settings enable row level security;
alter table public.work_sites enable row level security;
alter table public.attendance_events enable row level security;
alter table public.weekly_timesheets enable row level security;
alter table public.wagesheet_lines enable row level security;

drop policy if exists org_attendance_settings_select on public.org_attendance_settings;
create policy org_attendance_settings_select
  on public.org_attendance_settings for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists work_sites_select on public.work_sites;
create policy work_sites_select
  on public.work_sites for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists attendance_events_select on public.attendance_events;
create policy attendance_events_select
  on public.attendance_events for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      user_id = auth.uid()
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.view', '{}'::jsonb)
      or (
        public.has_permission(auth.uid(), org_id, 'leave.approve_direct_reports', '{}'::jsonb)
        and exists (
          select 1 from public.profiles s
          where s.id = attendance_events.user_id
            and s.reports_to_user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists weekly_timesheets_select on public.weekly_timesheets;
create policy weekly_timesheets_select
  on public.weekly_timesheets for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      user_id = auth.uid()
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.view', '{}'::jsonb)
      or (
        public.has_permission(auth.uid(), org_id, 'leave.approve_direct_reports', '{}'::jsonb)
        and exists (
          select 1 from public.profiles s
          where s.id = weekly_timesheets.user_id
            and s.reports_to_user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists wagesheet_lines_select on public.wagesheet_lines;
create policy wagesheet_lines_select
  on public.wagesheet_lines for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      user_id = auth.uid()
      or public.has_permission(auth.uid(), org_id, 'payroll.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Permission catalog + grants (org_admin seed; managers use leave.approve for timesheets)
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('payroll.view', 'View wagesheets', 'View generated wagesheet lines for the organisation.', false),
  ('payroll.manage', 'Manage payroll exports', 'Regenerate wagesheets and manage payroll settings.', false)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description;

insert into public.org_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.org_roles r
join (
  values
    ('org_admin', 'payroll.view'),
    ('org_admin', 'payroll.manage')
) as p(role_key, permission_key)
  on p.role_key = r.key
  and r.is_archived = false
on conflict do nothing;
