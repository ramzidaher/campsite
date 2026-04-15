-- Secure P45 / P60 storage with payroll + finance linkage.

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('payroll.tax_docs.view_all', 'View tax documents (all)', 'View employee P45/P60 payroll documents for the organisation.', false),
  ('payroll.tax_docs.manage_all', 'Manage tax documents (all)', 'Upload, replace, and delete employee P45/P60 payroll documents for the organisation.', false),
  ('payroll.tax_docs.view_own', 'View own tax documents', 'View and download your own P45/P60 documents.', false),
  ('payroll.tax_docs.upload_own', 'Upload own tax documents', 'Upload your own P45/P60 documents when enabled by policy.', false),
  ('payroll.tax_docs.export', 'Export tax document index', 'Export payroll tax document metadata for finance operations.', false)
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
    ('payroll.view', 'payroll.tax_docs.view_all'),
    ('payroll.manage', 'payroll.tax_docs.view_all'),
    ('payroll.manage', 'payroll.tax_docs.manage_all'),
    ('payroll.manage', 'payroll.tax_docs.export'),
    ('hr.view_own', 'payroll.tax_docs.view_own')
) as m(source_permission, new_permission)
  on rp.permission_key = m.source_permission
on conflict do nothing;

create table if not exists public.employee_tax_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (document_type in ('p45', 'p60')),
  tax_year text null,
  issue_date date null,
  payroll_period_end date null,
  status text not null default 'issued' check (status in ('draft', 'final', 'issued')),
  finance_reference text null,
  wagesheet_id uuid null,
  payroll_run_reference text null,
  bucket_id text not null default 'employee-tax-documents',
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  byte_size bigint not null default 0 check (byte_size >= 0),
  is_current boolean not null default true,
  replaced_by_document_id uuid null references public.employee_tax_documents(id) on delete set null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_tax_documents_org_user_idx
  on public.employee_tax_documents(org_id, user_id, created_at desc);

create index if not exists employee_tax_documents_type_year_idx
  on public.employee_tax_documents(org_id, document_type, tax_year, created_at desc);

create unique index if not exists employee_tax_documents_storage_path_key
  on public.employee_tax_documents(storage_path);

create or replace function public.employee_tax_documents_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_tax_documents_set_updated_at_trg on public.employee_tax_documents;
create trigger employee_tax_documents_set_updated_at_trg
before update on public.employee_tax_documents
for each row execute function public.employee_tax_documents_set_updated_at();

alter table public.employee_tax_documents enable row level security;

revoke all on public.employee_tax_documents from public;
grant select, insert, update, delete on public.employee_tax_documents to authenticated;

drop policy if exists employee_tax_documents_select on public.employee_tax_documents;
create policy employee_tax_documents_select
on public.employee_tax_documents for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.tax_docs.view_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.tax_docs.view_own', '{}'::jsonb))
  )
);

drop policy if exists employee_tax_documents_insert on public.employee_tax_documents;
create policy employee_tax_documents_insert
on public.employee_tax_documents for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and uploaded_by = auth.uid()
  and exists (select 1 from public.profiles p where p.id = user_id and p.org_id = org_id)
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.tax_docs.manage_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.tax_docs.upload_own', '{}'::jsonb))
  )
);

drop policy if exists employee_tax_documents_update on public.employee_tax_documents;
create policy employee_tax_documents_update
on public.employee_tax_documents for update
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.tax_docs.manage_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.tax_docs.upload_own', '{}'::jsonb))
  )
)
with check (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.tax_docs.manage_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.tax_docs.upload_own', '{}'::jsonb))
  )
);

drop policy if exists employee_tax_documents_delete on public.employee_tax_documents;
create policy employee_tax_documents_delete
on public.employee_tax_documents for delete
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'payroll.tax_docs.manage_all', '{}'::jsonb)
    or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'payroll.tax_docs.upload_own', '{}'::jsonb))
  )
);

insert into storage.buckets (id, name, public)
values ('employee-tax-documents', 'employee-tax-documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists employee_tax_documents_storage_select on storage.objects;
create policy employee_tax_documents_storage_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'employee-tax-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_tax_documents d
    where d.storage_path = name
      and d.org_id = public.current_org_id()
      and (
        public.has_permission(auth.uid(), d.org_id, 'payroll.tax_docs.view_all', '{}'::jsonb)
        or (d.user_id = auth.uid() and public.has_permission(auth.uid(), d.org_id, 'payroll.tax_docs.view_own', '{}'::jsonb))
      )
  )
);

drop policy if exists employee_tax_documents_storage_insert on storage.objects;
create policy employee_tax_documents_storage_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'employee-tax-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and coalesce(array_length(string_to_array(name, '/'), 1), 0) >= 3
);

drop policy if exists employee_tax_documents_storage_update on storage.objects;
create policy employee_tax_documents_storage_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'employee-tax-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
)
with check (
  bucket_id = 'employee-tax-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
);

drop policy if exists employee_tax_documents_storage_delete on storage.objects;
create policy employee_tax_documents_storage_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'employee-tax-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
);
