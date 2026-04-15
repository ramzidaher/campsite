-- Employee photo + ID document management (granular permissions, masked metadata, own-access).

-- 1) Permission catalog
insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('hr.employee_photo.view_all', 'View employee photos (all)', 'View employee profile photos across the organisation.', false),
  ('hr.employee_photo.manage_all', 'Manage employee photos (all)', 'Upload, replace, and delete employee photos across the organisation.', false),
  ('hr.employee_photo.view_own', 'View own employee photo', 'View and download your own employee photo files.', false),
  ('hr.employee_photo.upload_own', 'Upload own employee photo', 'Upload or replace your own employee photo files.', false),
  ('hr.employee_photo.delete_own', 'Delete own employee photo', 'Delete your own employee photo files.', false),
  ('hr.id_document.view_all', 'View ID documents (all)', 'View employee identity documents across the organisation.', false),
  ('hr.id_document.manage_all', 'Manage ID documents (all)', 'Upload, replace, and delete employee identity documents across the organisation.', false),
  ('hr.id_document.view_own', 'View own ID documents', 'View and download your own identity documents.', false),
  ('hr.id_document.upload_own', 'Upload own ID documents', 'Upload your own identity documents.', false),
  ('hr.id_document.delete_own', 'Delete own ID documents', 'Delete your own identity documents.', false)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;

-- 2) Derive role grants from existing HR grants
insert into public.org_role_permissions (role_id, permission_key)
select distinct rp.role_id, new_perm.permission_key
from public.org_role_permissions rp
join (
  values
    ('hr.view_own', 'hr.employee_photo.view_own'),
    ('hr.view_own', 'hr.employee_photo.upload_own'),
    ('hr.view_own', 'hr.employee_photo.delete_own'),
    ('hr.view_own', 'hr.id_document.view_own'),
    ('hr.view_own', 'hr.id_document.upload_own'),
    ('hr.view_own', 'hr.id_document.delete_own'),
    ('hr.view_direct_reports', 'hr.employee_photo.view_all'),
    ('hr.view_direct_reports', 'hr.id_document.view_all'),
    ('hr.view_records', 'hr.employee_photo.view_all'),
    ('hr.view_records', 'hr.id_document.view_all'),
    ('hr.manage_records', 'hr.employee_photo.view_all'),
    ('hr.manage_records', 'hr.employee_photo.manage_all'),
    ('hr.manage_records', 'hr.id_document.view_all'),
    ('hr.manage_records', 'hr.id_document.manage_all')
) as new_perm(source_permission, permission_key)
  on rp.permission_key = new_perm.source_permission
on conflict do nothing;

-- 3) Extend table columns
alter table public.employee_hr_documents
  add column if not exists bucket_id text not null default 'employee-hr-documents',
  add column if not exists document_kind text not null default 'supporting_document',
  add column if not exists is_current boolean not null default true,
  add column if not exists replaced_by_document_id uuid null references public.employee_hr_documents(id) on delete set null,
  add column if not exists id_document_type text null,
  add column if not exists id_number_last4 text null,
  add column if not exists expires_on date null;

update public.employee_hr_documents
set document_kind = case
  when category in ('employee_photo') then 'employee_photo'
  when category in ('id_document') then 'id_document'
  else 'supporting_document'
end
where document_kind is distinct from case
  when category in ('employee_photo') then 'employee_photo'
  when category in ('id_document') then 'id_document'
  else 'supporting_document'
end;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_hr_documents'::regclass
      and conname = 'employee_hr_documents_category_check'
  ) then
    alter table public.employee_hr_documents drop constraint employee_hr_documents_category_check;
  end if;
end $$;

alter table public.employee_hr_documents
  add constraint employee_hr_documents_category_check
  check (category in ('right_to_work', 'passport', 'contract', 'signed_other', 'other', 'employee_photo', 'id_document'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_hr_documents'::regclass
      and conname = 'employee_hr_documents_kind_check'
  ) then
    alter table public.employee_hr_documents
      add constraint employee_hr_documents_kind_check
      check (document_kind in ('supporting_document', 'employee_photo', 'id_document'));
  end if;
end $$;

create index if not exists employee_hr_documents_kind_current_idx
  on public.employee_hr_documents (org_id, user_id, document_kind, is_current, created_at desc);

-- 4) Replace table RLS with per-kind permission checks
drop policy if exists employee_hr_documents_select on public.employee_hr_documents;
drop policy if exists employee_hr_documents_insert_manage on public.employee_hr_documents;
drop policy if exists employee_hr_documents_update_manage on public.employee_hr_documents;
drop policy if exists employee_hr_documents_delete_manage on public.employee_hr_documents;
drop policy if exists employee_hr_documents_insert_photo_or_id on public.employee_hr_documents;
drop policy if exists employee_hr_documents_update_photo_or_id on public.employee_hr_documents;
drop policy if exists employee_hr_documents_delete_photo_or_id on public.employee_hr_documents;

create policy employee_hr_documents_select
on public.employee_hr_documents for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    (document_kind = 'employee_photo' and (
      public.has_permission(auth.uid(), org_id, 'hr.employee_photo.view_all', '{}'::jsonb)
      or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'hr.employee_photo.view_own', '{}'::jsonb))
    ))
    or
    (document_kind = 'id_document' and (
      public.has_permission(auth.uid(), org_id, 'hr.id_document.view_all', '{}'::jsonb)
      or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'hr.id_document.view_own', '{}'::jsonb))
    ))
    or
    (document_kind = 'supporting_document' and (
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
      or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'hr.view_own', '{}'::jsonb))
    ))
  )
);

create policy employee_hr_documents_insert_photo_or_id
on public.employee_hr_documents for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and uploaded_by = auth.uid()
  and exists (select 1 from public.profiles p where p.id = user_id and p.org_id = org_id)
  and (
    (document_kind = 'employee_photo' and category = 'employee_photo' and (
      public.has_permission(auth.uid(), org_id, 'hr.employee_photo.manage_all', '{}'::jsonb)
      or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'hr.employee_photo.upload_own', '{}'::jsonb))
    ))
    or
    (document_kind = 'id_document' and category = 'id_document' and (
      public.has_permission(auth.uid(), org_id, 'hr.id_document.manage_all', '{}'::jsonb)
      or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'hr.id_document.upload_own', '{}'::jsonb))
    ))
    or
    (document_kind = 'supporting_document' and category in ('right_to_work', 'passport', 'contract', 'signed_other', 'other')
      and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb))
  )
);

create policy employee_hr_documents_update_photo_or_id
on public.employee_hr_documents for update
to authenticated
using (
  org_id = public.current_org_id()
  and (
    (document_kind = 'employee_photo' and (
      public.has_permission(auth.uid(), org_id, 'hr.employee_photo.manage_all', '{}'::jsonb)
      or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'hr.employee_photo.upload_own', '{}'::jsonb))
    ))
    or
    (document_kind = 'id_document' and (
      public.has_permission(auth.uid(), org_id, 'hr.id_document.manage_all', '{}'::jsonb)
      or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'hr.id_document.upload_own', '{}'::jsonb))
    ))
    or
    (document_kind = 'supporting_document' and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb))
  )
)
with check (
  org_id = public.current_org_id()
);

create policy employee_hr_documents_delete_photo_or_id
on public.employee_hr_documents for delete
to authenticated
using (
  org_id = public.current_org_id()
  and (
    (document_kind = 'employee_photo' and (
      public.has_permission(auth.uid(), org_id, 'hr.employee_photo.manage_all', '{}'::jsonb)
      or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'hr.employee_photo.delete_own', '{}'::jsonb))
    ))
    or
    (document_kind = 'id_document' and (
      public.has_permission(auth.uid(), org_id, 'hr.id_document.manage_all', '{}'::jsonb)
      or (user_id = auth.uid() and public.has_permission(auth.uid(), org_id, 'hr.id_document.delete_own', '{}'::jsonb))
    ))
    or
    (document_kind = 'supporting_document' and public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb))
  )
);

-- 5) Add dedicated private buckets for stronger segregation
insert into storage.buckets (id, name, public)
values
  ('employee-photos', 'employee-photos', false),
  ('employee-id-documents', 'employee-id-documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists employee_photo_storage_select on storage.objects;
drop policy if exists employee_photo_storage_insert on storage.objects;
drop policy if exists employee_photo_storage_update on storage.objects;
drop policy if exists employee_photo_storage_delete on storage.objects;
drop policy if exists employee_id_storage_select on storage.objects;
drop policy if exists employee_id_storage_insert on storage.objects;
drop policy if exists employee_id_storage_update on storage.objects;
drop policy if exists employee_id_storage_delete on storage.objects;

create policy employee_photo_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'employee-photos'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1 from public.employee_hr_documents d
    where d.storage_path = name and d.bucket_id = 'employee-photos' and d.document_kind = 'employee_photo'
      and d.org_id = public.current_org_id()
  )
);
create policy employee_photo_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'employee-photos' and split_part(name, '/', 1)::uuid = public.current_org_id());
create policy employee_photo_storage_update on storage.objects for update to authenticated
using (bucket_id = 'employee-photos' and split_part(name, '/', 1)::uuid = public.current_org_id())
with check (bucket_id = 'employee-photos' and split_part(name, '/', 1)::uuid = public.current_org_id());
create policy employee_photo_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'employee-photos' and split_part(name, '/', 1)::uuid = public.current_org_id());

create policy employee_id_storage_select on storage.objects for select to authenticated
using (
  bucket_id = 'employee-id-documents'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1 from public.employee_hr_documents d
    where d.storage_path = name and d.bucket_id = 'employee-id-documents' and d.document_kind = 'id_document'
      and d.org_id = public.current_org_id()
  )
);
create policy employee_id_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'employee-id-documents' and split_part(name, '/', 1)::uuid = public.current_org_id());
create policy employee_id_storage_update on storage.objects for update to authenticated
using (bucket_id = 'employee-id-documents' and split_part(name, '/', 1)::uuid = public.current_org_id())
with check (bucket_id = 'employee-id-documents' and split_part(name, '/', 1)::uuid = public.current_org_id());
create policy employee_id_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'employee-id-documents' and split_part(name, '/', 1)::uuid = public.current_org_id());
