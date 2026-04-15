-- Reusable org-level custom categories for employee documents.

create table if not exists public.employee_document_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  document_kind_scope text not null default 'supporting_document'
    check (document_kind_scope in ('supporting_document', 'employee_photo', 'id_document', 'any')),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists employee_document_categories_org_name_unique
  on public.employee_document_categories (org_id, lower(name));

alter table public.employee_document_categories enable row level security;

revoke all on public.employee_document_categories from public;
grant select, insert, update, delete on public.employee_document_categories to authenticated;

drop policy if exists employee_document_categories_select on public.employee_document_categories;
create policy employee_document_categories_select
on public.employee_document_categories for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
    or public.has_permission(auth.uid(), org_id, 'hr.view_records', '{}'::jsonb)
    or public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
  )
);

drop policy if exists employee_document_categories_insert on public.employee_document_categories;
create policy employee_document_categories_insert
on public.employee_document_categories for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and created_by = auth.uid()
  and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
);

drop policy if exists employee_document_categories_update on public.employee_document_categories;
create policy employee_document_categories_update
on public.employee_document_categories for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
)
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
);

drop policy if exists employee_document_categories_delete on public.employee_document_categories;
create policy employee_document_categories_delete
on public.employee_document_categories for delete
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
);

alter table public.employee_hr_documents
  add column if not exists custom_category_id uuid null references public.employee_document_categories(id) on delete set null;

create index if not exists employee_hr_documents_custom_category_idx
  on public.employee_hr_documents (custom_category_id);
