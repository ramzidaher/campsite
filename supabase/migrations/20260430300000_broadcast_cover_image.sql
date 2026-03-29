-- Broadcast detail cover image: column, storage bucket, RLS, and helper RPC for UI gating.

alter table public.broadcasts
  add column if not exists cover_image_url text;

comment on column public.broadcasts.cover_image_url is
  'Public URL for optional header/cover image on the broadcast detail view.';

insert into storage.buckets (id, name, public)
values ('broadcast-covers', 'broadcast-covers', true)
on conflict (id) do nothing;

drop policy if exists "Public read broadcast covers" on storage.objects;
create policy "Public read broadcast covers"
on storage.objects for select
to public
using (bucket_id = 'broadcast-covers');

drop policy if exists "broadcast_covers_insert_scoped" on storage.objects;
create policy "broadcast_covers_insert_scoped"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'broadcast-covers'
  and split_part(name, '/', 1) = (auth.uid())::text
  and exists (
    select 1
    from public.broadcasts b
    where b.id = (split_part(name, '/', 2))::uuid
      and b.org_id = public.current_org_id()
  )
);

drop policy if exists "broadcast_covers_update_own" on storage.objects;
create policy "broadcast_covers_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'broadcast-covers'
  and split_part(name, '/', 1) = (auth.uid())::text
)
with check (
  bucket_id = 'broadcast-covers'
  and split_part(name, '/', 1) = (auth.uid())::text
  and exists (
    select 1
    from public.broadcasts b
    where b.id = (split_part(name, '/', 2))::uuid
      and b.org_id = public.current_org_id()
  )
);

drop policy if exists "broadcast_covers_delete_own" on storage.objects;
create policy "broadcast_covers_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'broadcast-covers'
  and split_part(name, '/', 1) = (auth.uid())::text
);

-- True when the caller may update this broadcast row (cover_image_url) under current RLS update policies.
create or replace function public.broadcast_may_set_cover(p_broadcast_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.broadcasts;
  v_uid uuid := auth.uid();
begin
  if p_broadcast_id is null or v_uid is null then
    return false;
  end if;

  select * into b from public.broadcasts where id = p_broadcast_id;
  if not found then
    return false;
  end if;

  if b.org_id is distinct from public.current_org_id() then
    return false;
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = v_uid
      and p.org_id = b.org_id
      and p.role = 'org_admin'
      and p.status = 'active'
  ) then
    return true;
  end if;

  if b.status = 'pending_approval'
    and b.org_id = public.current_org_id()
    and (
      exists (
        select 1 from public.dept_managers dm
        where dm.user_id = v_uid and dm.dept_id = b.dept_id
      )
      or exists (
        select 1 from public.profiles p
        where p.id = v_uid
          and p.role = 'org_admin'
          and p.org_id = b.org_id
      )
    ) then
    return true;
  end if;

  if b.created_by = v_uid
    and b.status in ('draft', 'scheduled', 'pending_approval')
    and public.user_may_broadcast_to_dept(b.dept_id)
    and (
      public.broadcast_form_allowed(
        b.status,
        b.dept_id,
        coalesce(b.is_org_wide, false),
        coalesce(b.is_mandatory, false),
        coalesce(b.is_pinned, false)
      )
      or b.status = 'cancelled'
    ) then
    return true;
  end if;

  if b.created_by is distinct from v_uid
    and b.status in ('draft', 'pending_approval', 'scheduled', 'sent')
    and public.user_has_any_dept_broadcast_permission(v_uid, 'edit_others_broadcasts')
    and (
      public.broadcast_form_allowed(
        b.status,
        b.dept_id,
        coalesce(b.is_org_wide, false),
        coalesce(b.is_mandatory, false),
        coalesce(b.is_pinned, false)
      )
      or b.status = 'cancelled'
    ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.broadcast_may_set_cover(uuid) from public;
grant execute on function public.broadcast_may_set_cover(uuid) to authenticated;
