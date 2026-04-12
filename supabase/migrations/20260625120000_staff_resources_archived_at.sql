-- Soft-archive staff resources (hide from staff); managers can view, restore, or delete permanently.

alter table public.staff_resources
  add column if not exists archived_at timestamptz null;

comment on column public.staff_resources.archived_at is
  'When set, resource is hidden from the default library and full-text search; users with resources.manage can still list, restore, or delete.';

create index if not exists staff_resources_org_active_idx
  on public.staff_resources (org_id, updated_at desc)
  where archived_at is null;

-- Staff see active only; managers see active + archived for their org.
drop policy if exists staff_resources_select_same_org on public.staff_resources;
create policy staff_resources_select_same_org
on public.staff_resources for select
to authenticated
using (
  org_id = public.current_org_id()
  and (
    archived_at is null
    or public.has_permission(auth.uid(), org_id, 'resources.manage', '{}'::jsonb)
  )
);

-- Full-text search: never surface archived items (managers browse archived via direct list filter).
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
        and to_tsvector('english', coalesce(f.name, '')) @@ plainto_tsquery('english', trim(q))
      )
    )
  order by sr.updated_at desc nulls last
  limit greatest(1, least(coalesce(limit_n, 50), 200));
$$;

grant execute on function public.search_staff_resources(text, int) to authenticated;
