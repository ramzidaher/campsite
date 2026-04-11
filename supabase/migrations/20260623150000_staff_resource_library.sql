-- Staff resource library: org-wide documents, HR-managed uploads (resources.manage), search, private storage.

-- ---------------------------------------------------------------------------
-- Permission catalog + grant to every org_admin (mirrors non-founder catalog grants)
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (key, label, description, is_founder_only)
values (
  'resources.manage',
  'Manage staff resource library',
  'Upload, edit, and remove files in the organisation staff resource library.',
  false
)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description;

insert into public.org_role_permissions (role_id, permission_key)
select r.id, 'resources.manage'
from public.org_roles r
where r.key = 'org_admin'
  and r.is_archived = false
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.staff_resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  title text not null,
  description text not null default '',
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  byte_size bigint not null default 0 check (byte_size >= 0),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
      || setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) stored
);

create index if not exists staff_resources_org_id_idx on public.staff_resources (org_id);
create index if not exists staff_resources_created_at_idx on public.staff_resources (created_at desc);
create index if not exists staff_resources_search_tsv_idx on public.staff_resources using gin (search_tsv);

comment on table public.staff_resources is 'Organisation staff-facing resource library (files in staff-resources bucket).';

alter table public.staff_resources enable row level security;

drop policy if exists staff_resources_select_same_org on public.staff_resources;
create policy staff_resources_select_same_org
on public.staff_resources for select
to authenticated
using (org_id = public.current_org_id());

drop policy if exists staff_resources_insert_manage on public.staff_resources;
create policy staff_resources_insert_manage
on public.staff_resources for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and created_by = auth.uid()
  and public.has_permission(auth.uid(), org_id, 'resources.manage', '{}'::jsonb)
);

drop policy if exists staff_resources_update_manage on public.staff_resources;
create policy staff_resources_update_manage
on public.staff_resources for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'resources.manage', '{}'::jsonb)
)
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'resources.manage', '{}'::jsonb)
);

drop policy if exists staff_resources_delete_manage on public.staff_resources;
create policy staff_resources_delete_manage
on public.staff_resources for delete
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'resources.manage', '{}'::jsonb)
);

-- ---------------------------------------------------------------------------
-- Full-text search (same pattern as search_broadcasts)
-- ---------------------------------------------------------------------------

create or replace function public.search_staff_resources(q text, limit_n int default 50)
returns setof public.staff_resources
language sql
stable
security definer
set search_path = public
as $$
  select sr.*
  from public.staff_resources sr
  where trim(coalesce(q, '')) <> ''
    and sr.org_id = public.current_org_id()
    and sr.search_tsv @@ plainto_tsquery('english', trim(q))
  order by sr.updated_at desc nulls last
  limit greatest(1, least(coalesce(limit_n, 50), 200));
$$;

revoke all on function public.search_staff_resources(text, int) from public;
grant execute on function public.search_staff_resources(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket; path = {org_id}/{resource_id}/{filename}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('staff-resources', 'staff-resources', false)
on conflict (id) do update
  set public = excluded.public;

drop policy if exists staff_resources_storage_select on storage.objects;
create policy staff_resources_storage_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'staff-resources'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and exists (
    select 1
    from public.staff_resources sr
    where sr.storage_path = name
      and sr.org_id = public.current_org_id()
  )
);

drop policy if exists staff_resources_storage_insert on storage.objects;
create policy staff_resources_storage_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'staff-resources'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and public.has_permission(
    auth.uid(),
    split_part(name, '/', 1)::uuid,
    'resources.manage',
    '{}'::jsonb
  )
);

drop policy if exists staff_resources_storage_update on storage.objects;
create policy staff_resources_storage_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'staff-resources'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and public.has_permission(
    auth.uid(),
    split_part(name, '/', 1)::uuid,
    'resources.manage',
    '{}'::jsonb
  )
)
with check (
  bucket_id = 'staff-resources'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and public.has_permission(
    auth.uid(),
    split_part(name, '/', 1)::uuid,
    'resources.manage',
    '{}'::jsonb
  )
);

drop policy if exists staff_resources_storage_delete on storage.objects;
create policy staff_resources_storage_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'staff-resources'
  and split_part(name, '/', 1)::uuid = public.current_org_id()
  and public.has_permission(
    auth.uid(),
    split_part(name, '/', 1)::uuid,
    'resources.manage',
    '{}'::jsonb
  )
);
