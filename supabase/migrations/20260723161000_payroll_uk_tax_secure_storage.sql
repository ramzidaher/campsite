-- Secure UK NI / Tax code storage with approval workflow and audit trail.

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('payroll.uk_tax.view_all', 'View UK tax details (all)', 'View masked NI/tax details for all employees.', false),
  ('payroll.uk_tax.manage_all', 'Manage UK tax details (all)', 'Create, approve, reject, and activate UK tax details for all employees.', false),
  ('payroll.uk_tax.view_own', 'View own UK tax details', 'View your own masked NI/tax details.', false),
  ('payroll.uk_tax.manage_own', 'Manage own UK tax details', 'Submit updates to your own NI/tax details.', false),
  ('payroll.uk_tax.export', 'Export UK tax details', 'Export decrypted NI/tax details for payroll.', false)
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
    ('payroll.view', 'payroll.uk_tax.view_all'),
    ('payroll.manage', 'payroll.uk_tax.view_all'),
    ('payroll.manage', 'payroll.uk_tax.manage_all'),
    ('payroll.manage', 'payroll.uk_tax.export'),
    ('hr.view_own', 'payroll.uk_tax.view_own'),
    ('hr.view_own', 'payroll.uk_tax.manage_own')
) as m(source_permission, new_permission)
  on rp.permission_key = m.source_permission
on conflict do nothing;

create table if not exists public.employee_uk_tax_details (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  is_active boolean not null default false,
  encrypted_payload text not null,
  ni_number_masked text null,
  ni_number_last2 text null,
  tax_code_masked text null,
  tax_code_last2 text null,
  effective_from date null,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  review_note text null,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employee_uk_tax_details_active_one_per_user
  on public.employee_uk_tax_details(org_id, user_id)
  where is_active = true;

create index if not exists employee_uk_tax_details_org_user_idx
  on public.employee_uk_tax_details(org_id, user_id, created_at desc);

create table if not exists public.employee_uk_tax_detail_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  uk_tax_detail_id uuid null references public.employee_uk_tax_details(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null
    check (event_type in ('submitted', 'approved', 'rejected', 'revealed', 'exported')),
  reason text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists employee_uk_tax_detail_events_org_user_idx
  on public.employee_uk_tax_detail_events(org_id, user_id, created_at desc);

create or replace function public.employee_uk_tax_details_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_uk_tax_details_set_updated_at_trg on public.employee_uk_tax_details;
create trigger employee_uk_tax_details_set_updated_at_trg
before update on public.employee_uk_tax_details
for each row execute function public.employee_uk_tax_details_set_updated_at();

alter table public.employee_uk_tax_details enable row level security;
alter table public.employee_uk_tax_detail_events enable row level security;

revoke all on public.employee_uk_tax_details from public;
revoke all on public.employee_uk_tax_detail_events from public;
grant select, insert, update on public.employee_uk_tax_details to authenticated;
grant select, insert on public.employee_uk_tax_detail_events to authenticated;

drop policy if exists employee_uk_tax_details_select on public.employee_uk_tax_details;
create policy employee_uk_tax_details_select
on public.employee_uk_tax_details for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.uk_tax.view_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.uk_tax.view_own', '{}'::jsonb))
  )
);

drop policy if exists employee_uk_tax_details_insert on public.employee_uk_tax_details;
create policy employee_uk_tax_details_insert
on public.employee_uk_tax_details for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and submitted_by = auth.uid()
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.uk_tax.manage_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.uk_tax.manage_own', '{}'::jsonb))
  )
);

drop policy if exists employee_uk_tax_details_update on public.employee_uk_tax_details;
create policy employee_uk_tax_details_update
on public.employee_uk_tax_details for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'payroll.uk_tax.manage_all', '{}'::jsonb)
)
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'payroll.uk_tax.manage_all', '{}'::jsonb)
);

drop policy if exists employee_uk_tax_detail_events_select on public.employee_uk_tax_detail_events;
create policy employee_uk_tax_detail_events_select
on public.employee_uk_tax_detail_events for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.uk_tax.view_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.uk_tax.view_own', '{}'::jsonb))
  )
);

drop policy if exists employee_uk_tax_detail_events_insert on public.employee_uk_tax_detail_events;
create policy employee_uk_tax_detail_events_insert
on public.employee_uk_tax_detail_events for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and actor_user_id = auth.uid()
);
