-- Per-employee HR evidence documents (private storage, RLS aligned with hr_employee_file).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.employee_hr_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null
    check (category in ('right_to_work', 'passport', 'contract', 'signed_other', 'other')),
  label text not null default '',
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  byte_size bigint not null default 0 check (byte_size >= 0),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists employee_hr_documents_storage_path_key
  on public.employee_hr_documents (storage_path);

create index if not exists employee_hr_documents_org_user_idx
  on public.employee_hr_documents (org_id, user_id);

create index if not exists employee_hr_documents_created_idx
  on public.employee_hr_documents (created_at desc);

comment on table public.employee_hr_documents is
  'Private HR evidence per employee; files live in employee-hr-documents bucket (path org_id/document_id/filename).';

alter table public.employee_hr_documents enable row level security;

revoke all on public.employee_hr_documents from public;
grant select, insert, update, delete on public.employee_hr_documents to authenticated;

drop policy if exists employee_hr_documents_select on public.employee_hr_documents;
create policy employee_hr_documents_select
on public.employee_hr_documents for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    public.has_permission(auth.uid(), org_id, 'hr.view_records', '{}'::jsonb)
    or (
      public.has_permission(auth.uid(), org_id, 'hr.view_direct_reports', '{}'::jsonb)
      and exists (
        select 1
        from public.profiles p
        where p.id = employee_hr_documents.user_id
          and p.org_id = org_id
          and p.reports_to_user_id is not distinct from auth.uid()
      )
    )
    or (
      employee_hr_documents.user_id = auth.uid()
      and public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb)
    )
  )
);

drop policy if exists employee_hr_documents_insert_manage on public.employee_hr_documents;
create policy employee_hr_documents_insert_manage
on public.employee_hr_documents for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and uploaded_by = auth.uid()
  and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
  and exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.org_id = org_id
  )
);

drop policy if exists employee_hr_documents_update_manage on public.employee_hr_documents;
create policy employee_hr_documents_update_manage
on public.employee_hr_documents for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
  and exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.org_id = org_id
  )
)
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
  and exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.org_id = org_id
  )
);

drop policy if exists employee_hr_documents_delete_manage on public.employee_hr_documents;
create policy employee_hr_documents_delete_manage
on public.employee_hr_documents for delete
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
  and exists (
    select 1
    from public.profiles p
    where p.id = user_id
      and p.org_id = org_id
  )
);

-- ---------------------------------------------------------------------------
-- Storage: private bucket; path = {org_id}/{document_id}/{filename}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('employee-hr-documents', 'employee-hr-documents', false)
on conflict (id) do update
  set public = excluded.public;

drop policy if exists employee_hr_documents_storage_select on storage.objects;
create policy employee_hr_documents_storage_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'employee-hr-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.employee_hr_documents d
    where d.storage_path = name
      and d.org_id = public.current_org_id()
  )
);

drop policy if exists employee_hr_documents_storage_insert on storage.objects;
create policy employee_hr_documents_storage_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'employee-hr-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and coalesce(array_length(string_to_array(name, '/'), 1), 0) >= 3
  and public.has_permission(
    auth.uid(),
    split_part(name, '/', 1)::uuid,
    'hr.manage_records',
    '{}'::jsonb
  )
);

drop policy if exists employee_hr_documents_storage_update on storage.objects;
create policy employee_hr_documents_storage_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'employee-hr-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and public.has_permission(
    auth.uid(),
    split_part(name, '/', 1)::uuid,
    'hr.manage_records',
    '{}'::jsonb
  )
)
with check (
  bucket_id = 'employee-hr-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and public.has_permission(
    auth.uid(),
    split_part(name, '/', 1)::uuid,
    'hr.manage_records',
    '{}'::jsonb
  )
);

drop policy if exists employee_hr_documents_storage_delete on storage.objects;
create policy employee_hr_documents_storage_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'employee-hr-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and public.has_permission(
    auth.uid(),
    split_part(name, '/', 1)::uuid,
    'hr.manage_records',
    '{}'::jsonb
  )
);
