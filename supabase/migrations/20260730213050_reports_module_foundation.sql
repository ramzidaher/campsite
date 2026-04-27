-- Reporting module foundation (HR + Finance only).
-- Adds permission keys, report persistence, run history, schedules, and export audit.

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('reports.view', 'View reports', 'Access report builder, run reports, and view saved reports.', false),
  ('reports.manage', 'Manage reports', 'Manage shared reports, schedules, and cross-domain reporting.', false)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;

insert into public.org_role_permissions (role_id, permission_key)
select r.id, x.permission_key
from public.org_roles r
join (
  values
    ('org_admin', 'reports.view'),
    ('org_admin', 'reports.manage'),
    ('manager', 'reports.view'),
    ('coordinator', 'reports.view'),
    ('administrator', 'reports.view'),
    ('duty_manager', 'reports.view')
) as x(role_key, permission_key)
  on x.role_key = r.key
on conflict do nothing;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  updated_by uuid references public.profiles(id) on delete set null,
  name text not null,
  description text not null default '',
  domains text[] not null default array['hr']::text[],
  config jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  visibility text not null default 'private' check (visibility in ('private', 'org', 'roles')),
  shared_role_keys text[] not null default '{}'::text[],
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  run_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  row_count integer not null default 0,
  result_preview jsonb not null default '[]'::jsonb,
  filters_snapshot jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  recurrence text not null default 'weekly' check (recurrence in ('daily', 'weekly', 'monthly', 'cron')),
  cron_expr text,
  delivery jsonb not null default '{"in_app": true, "email_org_users": false}'::jsonb,
  is_paused boolean not null default false,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  run_id uuid references public.report_runs(id) on delete set null,
  exported_by uuid not null references public.profiles(id) on delete cascade,
  format text not null check (format in ('csv', 'pdf')),
  row_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.user_pinned_reports (
  user_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  constraint user_pinned_reports_pkey primary key (user_id, report_id)
);

create index if not exists reports_org_created_idx on public.reports(org_id, created_at desc);
create index if not exists report_runs_report_created_idx on public.report_runs(report_id, created_at desc);
create index if not exists report_schedules_org_next_idx on public.report_schedules(org_id, next_run_at);
create index if not exists report_exports_org_created_idx on public.report_exports(org_id, created_at desc);
create index if not exists user_pinned_reports_user_idx on public.user_pinned_reports(user_id, pinned_at desc);

alter table public.reports enable row level security;
alter table public.report_runs enable row level security;
alter table public.report_schedules enable row level security;
alter table public.report_exports enable row level security;
alter table public.user_pinned_reports enable row level security;

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
for select to authenticated
using (
  org_id = public.current_org_id()
  and (
    created_by = auth.uid()
    or visibility = 'org'
    or (
      visibility = 'roles'
      and exists (
        select 1
        from public.user_org_role_assignments a
        join public.org_roles r on r.id = a.role_id
        where a.user_id = auth.uid()
          and a.org_id = reports.org_id
          and r.key = any (coalesce(reports.shared_role_keys, '{}'::text[]))
      )
    )
  )
);

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and created_by = auth.uid()
  and public.has_current_org_permission('reports.view', '{}'::jsonb)
);

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports
for update to authenticated
using (
  org_id = public.current_org_id()
  and (
    created_by = auth.uid()
    or public.has_current_org_permission('reports.manage', '{}'::jsonb)
  )
)
with check (
  org_id = public.current_org_id()
  and (
    created_by = auth.uid()
    or public.has_current_org_permission('reports.manage', '{}'::jsonb)
  )
);

drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports
for delete to authenticated
using (
  org_id = public.current_org_id()
  and (
    created_by = auth.uid()
    or public.has_current_org_permission('reports.manage', '{}'::jsonb)
  )
);

drop policy if exists report_runs_select on public.report_runs;
create policy report_runs_select on public.report_runs
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists report_runs_insert on public.report_runs;
create policy report_runs_insert on public.report_runs
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and run_by = auth.uid()
  and public.has_current_org_permission('reports.view', '{}'::jsonb)
);

drop policy if exists report_runs_update on public.report_runs;
create policy report_runs_update on public.report_runs
for update to authenticated
using (
  org_id = public.current_org_id()
  and (
    run_by = auth.uid()
    or public.has_current_org_permission('reports.manage', '{}'::jsonb)
  )
)
with check (
  org_id = public.current_org_id()
  and (
    run_by = auth.uid()
    or public.has_current_org_permission('reports.manage', '{}'::jsonb)
  )
);

drop policy if exists report_schedules_select on public.report_schedules;
create policy report_schedules_select on public.report_schedules
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists report_schedules_mutate on public.report_schedules;
create policy report_schedules_mutate on public.report_schedules
for all to authenticated
using (
  org_id = public.current_org_id()
  and public.has_current_org_permission('reports.manage', '{}'::jsonb)
)
with check (
  org_id = public.current_org_id()
  and public.has_current_org_permission('reports.manage', '{}'::jsonb)
);

drop policy if exists report_exports_select on public.report_exports;
create policy report_exports_select on public.report_exports
for select to authenticated
using (org_id = public.current_org_id());

drop policy if exists report_exports_insert on public.report_exports;
create policy report_exports_insert on public.report_exports
for insert to authenticated
with check (
  org_id = public.current_org_id()
  and exported_by = auth.uid()
  and public.has_current_org_permission('reports.view', '{}'::jsonb)
);

drop policy if exists user_pinned_reports_select on public.user_pinned_reports;
create policy user_pinned_reports_select on public.user_pinned_reports
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_pinned_reports_mutate on public.user_pinned_reports;
create policy user_pinned_reports_mutate on public.user_pinned_reports
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
