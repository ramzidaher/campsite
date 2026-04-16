-- Supporting documents for leave requests (e.g. fit notes).

create table if not exists public.leave_request_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  request_id uuid not null references public.leave_requests(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  document_kind text not null default 'supporting_note'
    check (document_kind in ('fit_note', 'medical_letter', 'adoption_document', 'bereavement_evidence', 'other')),
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leave_request_documents_org_request_idx
  on public.leave_request_documents (org_id, request_id, created_at desc);

alter table public.leave_request_documents enable row level security;

drop policy if exists leave_request_documents_select on public.leave_request_documents;
create policy leave_request_documents_select
on public.leave_request_documents
for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    requester_id = auth.uid()
    or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
    or (
      public.has_permission(auth.uid(), org_id, 'leave.approve_direct_reports', '{}'::jsonb)
      and exists (
        select 1 from public.profiles p
        where p.id = leave_request_documents.requester_id
          and p.reports_to_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists leave_request_documents_insert on public.leave_request_documents;
create policy leave_request_documents_insert
on public.leave_request_documents
for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and requester_id = auth.uid()
  and exists (
    select 1
    from public.leave_requests r
    where r.id = request_id
      and r.org_id = leave_request_documents.org_id
      and r.requester_id = auth.uid()
  )
);

drop policy if exists leave_request_documents_delete on public.leave_request_documents;
create policy leave_request_documents_delete
on public.leave_request_documents
for delete
to authenticated
using (
  org_id = public.current_org_id()
  and (
    requester_id = auth.uid()
    or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
  )
);

insert into storage.buckets (id, name, public)
values ('leave-supporting-documents', 'leave-supporting-documents', false)
on conflict (id) do nothing;

drop policy if exists leave_supporting_docs_select on storage.objects;
create policy leave_supporting_docs_select
on storage.objects for select to authenticated
using (
  bucket_id = 'leave-supporting-documents'
  and exists (
    select 1
    from public.leave_request_documents d
    where d.storage_path = name
      and d.org_id = public.current_org_id()
  )
);

drop policy if exists leave_supporting_docs_insert on storage.objects;
create policy leave_supporting_docs_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'leave-supporting-documents'
  and split_part(name, '/', 1) = public.current_org_id()::text
  and split_part(name, '/', 2) = auth.uid()::text
);

drop policy if exists leave_supporting_docs_update on storage.objects;
create policy leave_supporting_docs_update
on storage.objects for update to authenticated
using (
  bucket_id = 'leave-supporting-documents'
  and split_part(name, '/', 1) = public.current_org_id()::text
  and split_part(name, '/', 2) = auth.uid()::text
)
with check (
  bucket_id = 'leave-supporting-documents'
  and split_part(name, '/', 1) = public.current_org_id()::text
  and split_part(name, '/', 2) = auth.uid()::text
);

drop policy if exists leave_supporting_docs_delete on storage.objects;
create policy leave_supporting_docs_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'leave-supporting-documents'
  and (
    split_part(name, '/', 2) = auth.uid()::text
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.org_id::text = split_part(name, '/', 1)
        and public.has_permission(auth.uid(), p.org_id, 'leave.manage_org', '{}'::jsonb)
    )
  )
);
