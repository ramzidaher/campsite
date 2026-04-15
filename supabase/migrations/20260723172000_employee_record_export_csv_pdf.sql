-- Employee record export (CSV/PDF) with audit and sensitive gating.

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('hr.records_export.view_all', 'Export employee records (all)', 'Generate employee record exports for any employee.', false),
  ('hr.records_export.view_own', 'Export own employee record', 'Generate your own employee record export.', false),
  ('hr.records_export.view_direct_reports', 'Export direct report records', 'Generate employee record exports for direct reports.', false),
  ('hr.records_export.include_sensitive', 'Include sensitive fields in export', 'Allow inclusion of sensitive fields in employee record export with reason.', false),
  ('hr.records_export.generate_pdf', 'Generate PDF employee exports', 'Generate employee record exports in PDF format.', false),
  ('hr.records_export.generate_csv', 'Generate CSV employee exports', 'Generate employee record exports in CSV format.', false)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;

insert into public.org_role_permissions (role_id, permission_key)
select distinct rp.role_id, m.new_permission
from public.org_role_permissions rp
join (
  values
    ('hr.view_records', 'hr.records_export.view_all'),
    ('hr.view_direct_reports', 'hr.records_export.view_direct_reports'),
    ('hr.view_own', 'hr.records_export.view_own'),
    ('hr.manage_records', 'hr.records_export.include_sensitive'),
    ('hr.view_records', 'hr.records_export.generate_pdf'),
    ('hr.view_records', 'hr.records_export.generate_csv')
) as m(source_permission, new_permission)
  on rp.permission_key = m.source_permission
on conflict do nothing;

create table if not exists public.employee_record_export_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  format text not null check (format in ('csv', 'pdf')),
  included_sections jsonb not null default '[]'::jsonb,
  include_sensitive boolean not null default false,
  reason text null,
  created_at timestamptz not null default now()
);

create index if not exists employee_record_export_events_org_idx
  on public.employee_record_export_events(org_id, created_at desc);

alter table public.employee_record_export_events enable row level security;
revoke all on public.employee_record_export_events from public;
grant select, insert on public.employee_record_export_events to authenticated;

drop policy if exists employee_record_export_events_select on public.employee_record_export_events;
create policy employee_record_export_events_select
on public.employee_record_export_events for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'privacy.erasure_request.audit_view', '{}'::jsonb)
);

drop policy if exists employee_record_export_events_insert on public.employee_record_export_events;
create policy employee_record_export_events_insert
on public.employee_record_export_events for insert
to authenticated
with check (
  org_id = public.current_org_id()
);
