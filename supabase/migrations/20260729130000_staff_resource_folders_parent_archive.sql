-- Nested resource folders, folder archive, and safe reparenting.

alter table public.staff_resource_folders
  add column if not exists parent_id uuid references public.staff_resource_folders (id) on delete set null;

alter table public.staff_resource_folders
  add column if not exists archived_at timestamptz null;

comment on column public.staff_resource_folders.parent_id is
  'Optional parent folder for a nested library tree (same org).';

comment on column public.staff_resource_folders.archived_at is
  'When set, folder is hidden from the default library; managers can restore. Child folders should be archived first or via app bulk action.';

create index if not exists staff_resource_folders_parent_id_idx
  on public.staff_resource_folders (parent_id)
  where parent_id is not null;

create index if not exists staff_resource_folders_org_archived_idx
  on public.staff_resource_folders (org_id, archived_at);

-- Replace flat (org_id, name) uniqueness with per-parent uniqueness.
alter table public.staff_resource_folders
  drop constraint if exists staff_resource_folders_org_name_unique;

-- Root folders: unique name per org (case-insensitive).
create unique index if not exists staff_resource_folders_org_root_name_lower_uidx
  on public.staff_resource_folders (org_id, lower(trim(name)))
  where parent_id is null and archived_at is null;

-- Nested folders: unique name among siblings (case-insensitive).
create unique index if not exists staff_resource_folders_org_parent_name_lower_uidx
  on public.staff_resource_folders (org_id, parent_id, lower(trim(name)))
  where parent_id is not null and archived_at is null;

-- Relaxed uniqueness for archived rows (names may collide after archive); partial indexes above exclude archived_at.

create or replace function public.staff_resource_folders_prevent_cycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cur uuid := new.parent_id;
  hops int := 0;
begin
  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;
  if new.parent_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.staff_resource_folders p
    where p.id = new.parent_id
      and p.org_id = new.org_id
  ) then
    raise exception 'parent folder must belong to the same organisation';
  end if;
  if new.parent_id = new.id then
    raise exception 'folder cannot be its own parent';
  end if;
  while cur is not null and hops < 200 loop
    if cur = new.id then
      raise exception 'folder parent would create a cycle';
    end if;
    select f.parent_id into cur
    from public.staff_resource_folders f
    where f.id = cur;
    hops := hops + 1;
  end loop;
  return new;
end;
$$;

drop trigger if exists staff_resource_folders_prevent_cycle_trg on public.staff_resource_folders;
create trigger staff_resource_folders_prevent_cycle_trg
  before insert or update of parent_id on public.staff_resource_folders
  for each row execute procedure public.staff_resource_folders_prevent_cycle();

-- Staff see active folders; managers see archived too.
drop policy if exists staff_resource_folders_select on public.staff_resource_folders;
create policy staff_resource_folders_select
on public.staff_resource_folders for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    archived_at is null
    or public.has_permission(auth.uid(), org_id, 'resources.manage', '{}'::jsonb)
  )
);

-- Search: do not match archived folder names for default discovery.
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
    and sr.archived_at is null
    and (
      sr.search_tsv @@ plainto_tsquery('english', trim(q))
      or (
        f.id is not null
        and f.archived_at is null
        and to_tsvector('english', coalesce(f.name, '')) @@ plainto_tsquery('english', trim(q))
      )
    )
  order by sr.updated_at desc nulls last
  limit greatest(1, least(coalesce(limit_n, 50), 200));
$$;

grant execute on function public.search_staff_resources(text, int) to authenticated;

-- Archive a folder, all descendant folders, and all files in those folders (same org, manager-only).
create or replace function public.archive_staff_resource_folder_tree(p_folder_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.staff_resource_folders where id = p_folder_id;
  if v_org is null or v_org <> public.current_org_id() then
    raise exception 'folder not found';
  end if;
  if not public.has_permission(auth.uid(), v_org, 'resources.manage', '{}'::jsonb) then
    raise exception 'permission denied';
  end if;

  with recursive subtree as (
    select id from public.staff_resource_folders where id = p_folder_id
    union all
    select f.id
    from public.staff_resource_folders f
    inner join subtree t on f.parent_id = t.id
  )
  update public.staff_resources sr
  set archived_at = coalesce(sr.archived_at, now()),
      updated_at = now()
  where sr.org_id = v_org
    and sr.folder_id in (select id from subtree);

  with recursive subtree as (
    select id from public.staff_resource_folders where id = p_folder_id
    union all
    select f.id
    from public.staff_resource_folders f
    inner join subtree t on f.parent_id = t.id
  )
  update public.staff_resource_folders f
  set archived_at = now()
  where f.id in (select id from subtree)
    and f.org_id = v_org;
end;
$$;

grant execute on function public.archive_staff_resource_folder_tree(uuid) to authenticated;

-- Restore folder tree and un-archive files that sit in those folders (manager-only).
create or replace function public.restore_staff_resource_folder_tree(p_folder_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.staff_resource_folders where id = p_folder_id;
  if v_org is null or v_org <> public.current_org_id() then
    raise exception 'folder not found';
  end if;
  if not public.has_permission(auth.uid(), v_org, 'resources.manage', '{}'::jsonb) then
    raise exception 'permission denied';
  end if;

  with recursive subtree as (
    select id from public.staff_resource_folders where id = p_folder_id
    union all
    select f.id
    from public.staff_resource_folders f
    inner join subtree t on f.parent_id = t.id
  )
  update public.staff_resources sr
  set archived_at = null,
      updated_at = now()
  where sr.org_id = v_org
    and sr.folder_id in (select id from subtree);

  with recursive subtree as (
    select id from public.staff_resource_folders where id = p_folder_id
    union all
    select f.id
    from public.staff_resource_folders f
    inner join subtree t on f.parent_id = t.id
  )
  update public.staff_resource_folders f
  set archived_at = null
  where f.id in (select id from subtree)
    and f.org_id = v_org;
end;
$$;

grant execute on function public.restore_staff_resource_folder_tree(uuid) to authenticated;
