-- Read-only founder catalog draft loader for pages that may execute in read-only transactions.
-- Unlike platform_founder_catalog_draft(), this never creates draft rows.

create or replace function public.platform_founder_catalog_draft_readonly()
returns table (
  version_no bigint,
  key text,
  label text,
  description text,
  category text,
  is_founder_only boolean,
  is_archived boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_draft bigint;
  v_published bigint;
begin
  if not public.platform_is_founder(auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select max(version_no) into v_draft
  from public.platform_permission_catalog_versions
  where status = 'draft';

  if v_draft is not null then
    return query
    select
      e.version_no, e.key, e.label, e.description, e.category, e.is_founder_only, e.is_archived
    from public.platform_permission_catalog_entries e
    where e.version_no = v_draft
    order by e.category, e.key;
    return;
  end if;

  select public.platform_latest_published_catalog_version() into v_published;
  if v_published is null then
    return;
  end if;

  return query
  select
    e.version_no, e.key, e.label, e.description, e.category, e.is_founder_only, e.is_archived
  from public.platform_permission_catalog_entries e
  where e.version_no = v_published
  order by e.category, e.key;
end;
$$;

revoke all on function public.platform_founder_catalog_draft_readonly() from public;
grant execute on function public.platform_founder_catalog_draft_readonly() to authenticated, service_role;
