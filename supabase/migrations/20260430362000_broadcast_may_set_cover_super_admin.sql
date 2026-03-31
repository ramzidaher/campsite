-- Align broadcast_may_set_cover with isOrgAdminRole (org_admin + legacy super_admin).

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
      and p.role in ('org_admin', 'super_admin')
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
          and p.role in ('org_admin', 'super_admin')
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
