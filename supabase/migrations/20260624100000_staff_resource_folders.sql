-- Folders for staff resource library + search includes folder names.

create table if not exists public.staff_resource_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint staff_resource_folders_org_name_unique unique (org_id, name)
);

create index if not exists staff_resource_folders_org_id_idx on public.staff_resource_folders (org_id);

comment on table public.staff_resource_folders is 'Groups files in the staff resource library (org-scoped).';

alter table public.staff_resources
  add column if not exists folder_id uuid references public.staff_resource_folders (id) on delete set null;

create index if not exists staff_resources_folder_id_idx on public.staff_resources (folder_id);

alter table public.staff_resource_folders enable row level security;

-- Ensure folder_id (when set) belongs to the same org as the resource row.
create or replace function public.staff_resources_enforce_folder_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.folder_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.staff_resource_folders f
    where f.id = new.folder_id
      and f.org_id = new.org_id
  ) then
    raise exception 'folder must belong to the same organisation as the resource';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_resources_enforce_folder_org_trg on public.staff_resources;
create trigger staff_resources_enforce_folder_org_trg
  before insert or update of folder_id, org_id on public.staff_resources
  for each row execute procedure public.staff_resources_enforce_folder_org();

drop policy if exists staff_resource_folders_select on public.staff_resource_folders;
create policy staff_resource_folders_select
on public.staff_resource_folders for select
to authenticated
using (org_id = public.current_org_id());

drop policy if exists staff_resource_folders_insert on public.staff_resource_folders;
create policy staff_resource_folders_insert
on public.staff_resource_folders for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'resources.manage', '{}'::jsonb)
);

drop policy if exists staff_resource_folders_update on public.staff_resource_folders;
create policy staff_resource_folders_update
on public.staff_resource_folders for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'resources.manage', '{}'::jsonb)
)
with check (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'resources.manage', '{}'::jsonb)
);

drop policy if exists staff_resource_folders_delete on public.staff_resource_folders;
create policy staff_resource_folders_delete
on public.staff_resource_folders for delete
to authenticated
using (
  org_id = public.current_org_id()
  and public.has_permission(auth.uid(), org_id, 'resources.manage', '{}'::jsonb)
);

-- Search: match title/body tsvector OR folder name
create or replace function public.search_staff_resources(q text, limit_n int default 50)
returns setof public.staff_resources
language sql
stable
security definer
set search_path = public
as $$
  select sr.*
  from public.staff_resources sr
  left join public.staff_resource_folders f on f.id = sr.folder_id
  where trim(coalesce(q, '')) <> ''
    and sr.org_id = public.current_org_id()
    and (
      sr.search_tsv @@ plainto_tsquery('english', trim(q))
      or (
        f.id is not null
        and to_tsvector('english', coalesce(f.name, '')) @@ plainto_tsquery('english', trim(q))
      )
    )
  order by sr.updated_at desc nulls last
  limit greatest(1, least(coalesce(limit_n, 50), 200));
$$;

grant execute on function public.search_staff_resources(text, int) to authenticated;
