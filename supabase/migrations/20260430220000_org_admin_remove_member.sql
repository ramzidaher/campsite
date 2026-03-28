-- Org admins may remove a member from their organisation (detach profile from org).
-- Direct UPDATE to org_id = null is blocked by profiles_update_org_admin with_check.

create or replace function public.org_admin_remove_member(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org uuid;
  v_viewer_role text;
  v_viewer_status text;
  v_target_org uuid;
  v_target_role text;
  v_org_admin_count int;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select org_id, role, status
  into v_org, v_viewer_role, v_viewer_status
  from public.profiles
  where id = v_viewer;

  if v_org is null
    or v_viewer_status is distinct from 'active'
    or v_viewer_role not in ('org_admin', 'super_admin')
  then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_target = v_viewer then
    raise exception 'cannot remove yourself from the organisation';
  end if;

  select org_id, role
  into v_target_org, v_target_role
  from public.profiles
  where id = p_target;

  if not found then
    raise exception 'profile not found';
  end if;

  if v_target_org is null then
    raise exception 'user is not a member of an organisation';
  end if;

  if v_target_org is distinct from v_org then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_target_role in ('org_admin', 'super_admin') then
    select count(*)::int
    into v_org_admin_count
    from public.profiles
    where org_id = v_org
      and role in ('org_admin', 'super_admin');

    if v_org_admin_count <= 1 then
      raise exception 'cannot remove the last org admin for this organisation';
    end if;
  end if;

  delete from public.user_departments ud
  using public.departments d
  where ud.user_id = p_target
    and ud.dept_id = d.id
    and d.org_id = v_org;

  delete from public.dept_managers dm
  using public.departments d
  where dm.user_id = p_target
    and dm.dept_id = d.id
    and d.org_id = v_org;

  delete from public.user_subscriptions us
  using public.dept_categories c
  join public.departments d on d.id = c.dept_id
  where us.user_id = p_target
    and us.cat_id = c.id
    and d.org_id = v_org;

  delete from public.broadcast_reads br
  using public.broadcasts b
  where br.user_id = p_target
    and br.broadcast_id = b.id
    and b.org_id = v_org;

  delete from public.rota_shifts
  where org_id = v_org
    and user_id = p_target;

  update public.profiles
  set
    org_id = null,
    role = 'unassigned',
    status = 'inactive',
    reviewed_at = now(),
    reviewed_by = v_viewer,
    rejection_note = null
  where id = p_target;

  if not found then
    raise exception 'profile not found';
  end if;
end;
$$;

revoke all on function public.org_admin_remove_member(uuid) from public;
grant execute on function public.org_admin_remove_member(uuid) to authenticated;

comment on function public.org_admin_remove_member(uuid) is
  'Active org_admin detaches a user from the current org (org_id null, unassigned, inactive); cleans dept links and org-scoped rota/broadcast reads.';
