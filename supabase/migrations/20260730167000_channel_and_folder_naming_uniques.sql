-- Enforce naming uniqueness rules:
-- 1) broadcast_channels: unique name per department (case-insensitive, trimmed)
-- 2) staff_resource_folders: unique active name per (org_id, parent_id) (case-insensitive, trimmed)

-- ---------------------------------------------------------------------------
-- 1) broadcast_channels per-department name normalization + dedupe
-- ---------------------------------------------------------------------------

update public.broadcast_channels
set name = trim(name)
where name is distinct from trim(name);

with ranked as (
  select
    id,
    dept_id,
    name,
    row_number() over (
      partition by dept_id, lower(trim(name))
      order by created_at asc, id asc
    ) as rn
  from public.broadcast_channels
)
update public.broadcast_channels c
set name = concat(c.name, ' (', r.rn::text, ')')
from ranked r
where c.id = r.id
  and r.rn > 1;

create unique index if not exists broadcast_channels_dept_name_ci_uq
  on public.broadcast_channels (dept_id, lower(trim(name)));

-- ---------------------------------------------------------------------------
-- 2) staff_resource_folders per-parent active-name normalization + dedupe
-- ---------------------------------------------------------------------------

update public.staff_resource_folders
set name = trim(name)
where name is distinct from trim(name);

with ranked as (
  select
    id,
    org_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) as parent_key,
    name,
    row_number() over (
      partition by org_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name))
      order by created_at asc, id asc
    ) as rn
  from public.staff_resource_folders
  where archived_at is null
)
update public.staff_resource_folders f
set name = concat(f.name, ' (', r.rn::text, ')')
from ranked r
where f.id = r.id
  and r.rn > 1;

create unique index if not exists staff_resource_folders_org_parent_name_ci_active_uq
  on public.staff_resource_folders (
    org_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  )
  where archived_at is null;
