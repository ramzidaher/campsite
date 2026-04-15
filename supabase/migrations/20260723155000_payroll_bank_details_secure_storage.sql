-- Secure bank details storage for payroll with approval workflow and audit events.

-- 1) Permission catalog entries
insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('payroll.bank_details.view_all', 'View bank details (all)', 'View masked payroll bank details for all employees.', false),
  ('payroll.bank_details.manage_all', 'Manage bank details (all)', 'Create, approve, reject, and activate payroll bank details for all employees.', false),
  ('payroll.bank_details.view_own', 'View own bank details', 'View your own masked payroll bank details.', false),
  ('payroll.bank_details.manage_own', 'Manage own bank details', 'Submit updates to your own payroll bank details.', false),
  ('payroll.bank_details.export', 'Export payroll bank details', 'Export decrypted payroll bank details for payroll runs.', false)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;

-- Derive role grants from existing payroll/hr grants
insert into public.org_role_permissions (role_id, permission_key)
select distinct rp.role_id, m.new_permission
from public.org_role_permissions rp
join (
  values
    ('payroll.view', 'payroll.bank_details.view_all'),
    ('payroll.manage', 'payroll.bank_details.view_all'),
    ('payroll.manage', 'payroll.bank_details.manage_all'),
    ('payroll.manage', 'payroll.bank_details.export'),
    ('hr.view_own', 'payroll.bank_details.view_own'),
    ('hr.view_own', 'payroll.bank_details.manage_own')
) as m(source_permission, new_permission)
  on rp.permission_key = m.source_permission
on conflict do nothing;

-- 2) Bank details table (encrypted payload, masked selectors only)
create table if not exists public.employee_bank_details (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  is_active boolean not null default false,
  encrypted_payload text not null,
  account_holder_display text not null default '',
  account_number_last4 text null,
  sort_code_last4 text null,
  iban_last4 text null,
  bank_country text null,
  currency text null,
  effective_from date null,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  review_note text null,
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_bank_details_org_user_idx
  on public.employee_bank_details(org_id, user_id, created_at desc);

create unique index if not exists employee_bank_details_active_one_per_user
  on public.employee_bank_details(org_id, user_id)
  where is_active = true;

comment on table public.employee_bank_details is
  'Encrypted payroll bank details with masked selectors and approval lifecycle.';

-- 3) Audit trail table
create table if not exists public.employee_bank_detail_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  bank_detail_id uuid null references public.employee_bank_details(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null
    check (event_type in ('submitted', 'approved', 'rejected', 'revealed', 'exported')),
  reason text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists employee_bank_detail_events_org_user_idx
  on public.employee_bank_detail_events(org_id, user_id, created_at desc);

-- 4) Updated-at trigger
create or replace function public.employee_bank_details_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_bank_details_set_updated_at_trg on public.employee_bank_details;
create trigger employee_bank_details_set_updated_at_trg
before update on public.employee_bank_details
for each row execute function public.employee_bank_details_set_updated_at();

-- 5) RLS
alter table public.employee_bank_details enable row level security;
alter table public.employee_bank_detail_events enable row level security;

revoke all on public.employee_bank_details from public;
revoke all on public.employee_bank_detail_events from public;
grant select, insert, update on public.employee_bank_details to authenticated;
grant select, insert on public.employee_bank_detail_events to authenticated;

drop policy if exists employee_bank_details_select on public.employee_bank_details;
create policy employee_bank_details_select
on public.employee_bank_details for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.bank_details.view_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.bank_details.view_own', '{}'::jsonb))
  )
);

drop policy if exists employee_bank_details_insert on public.employee_bank_details;
create policy employee_bank_details_insert
on public.employee_bank_details for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and submitted_by = auth.uid()
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.bank_details.manage_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.bank_details.manage_own', '{}'::jsonb))
  )
);

drop policy if exists employee_bank_details_update on public.employee_bank_details;
create policy employee_bank_details_update
on public.employee_bank_details for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'payroll.bank_details.manage_all', '{}'::jsonb)
)
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'payroll.bank_details.manage_all', '{}'::jsonb)
);

drop policy if exists employee_bank_detail_events_select on public.employee_bank_detail_events;
create policy employee_bank_detail_events_select
on public.employee_bank_detail_events for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.bank_details.view_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.bank_details.view_own', '{}'::jsonb))
  )
);

drop policy if exists employee_bank_detail_events_insert on public.employee_bank_detail_events;
create policy employee_bank_detail_events_insert
on public.employee_bank_detail_events for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and actor_user_id = auth.uid()
);
