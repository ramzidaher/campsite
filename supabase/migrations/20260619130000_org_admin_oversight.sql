-- Enforce org-admin oversight: keep at least two org admins in each organisation
-- and require org-admin approvers for org-admin promotions from pending.

create or replace function public.assign_user_org_role(
  p_org_id uuid,
  p_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_system boolean := false;
  v_role_key text;
  v_current_role text;
  v_active_org_admin_count int := 0;
begin
  if not public.has_permission(auth.uid(), p_org_id, 'members.edit_roles', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_org_memberships m
    where m.user_id = p_user_id and m.org_id = p_org_id
  ) then
    raise exception 'target user is not a member of this organisation';
  end if;

  if not exists (
    select 1 from public.org_roles r
    where r.id = p_role_id and r.org_id = p_org_id and r.is_archived = false
  ) then
    raise exception 'invalid role';
  end if;

  select r.is_system, r.key
  into v_is_system, v_role_key
  from public.org_roles r
  where r.id = p_role_id and r.org_id = p_org_id and r.is_archived = false;

  if not public.actor_can_assign_role(auth.uid(), p_org_id, p_role_id) then
    raise exception 'cannot assign a role above your own level' using errcode = '42501';
  end if;

  if not public.is_effective_org_admin(auth.uid(), p_org_id) then
    if auth.uid() = p_user_id then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if not public.is_reports_descendant_in_org(p_org_id, auth.uid(), p_user_id) then
      raise exception 'role assignment allowed only for direct or indirect reports' using errcode = '42501';
    end if;
    if coalesce(v_is_system, false) then
      raise exception 'only org admins may assign system (predefined) roles' using errcode = '42501';
    end if;
  end if;

  select p.role
  into v_current_role
  from public.profiles p
  where p.id = p_user_id
    and p.org_id = p_org_id
    and p.status = 'active'
  limit 1;

  if coalesce(v_current_role, '') in ('org_admin', 'super_admin')
     and coalesce(v_role_key, '') not in ('org_admin', 'super_admin') then
    select count(*)::int
    into v_active_org_admin_count
    from public.profiles p
    where p.org_id = p_org_id
      and p.status = 'active'
      and p.role in ('org_admin', 'super_admin');

    if v_active_org_admin_count <= 2 then
      raise exception 'cannot reduce org admins below 2 for this organisation';
    end if;
  end if;

  delete from public.user_org_role_assignments a
  where a.user_id = p_user_id and a.org_id = p_org_id;

  insert into public.user_org_role_assignments (user_id, org_id, role_id, assigned_by)
  values (p_user_id, p_org_id, p_role_id, auth.uid());

  update public.profiles pr
  set
    role = coalesce(v_role_key, pr.role),
    updated_at = now()
  where pr.id = p_user_id and pr.org_id = p_org_id;

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (p_org_id, auth.uid(), p_user_id, 'role.assigned', jsonb_build_object('role_id', p_role_id));
end;
$$;

create or replace function public.approve_pending_profile(
  p_target uuid,
  p_approve boolean,
  p_rejection_note text default null,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org_id uuid;
  v_trim_role text := nullif(trim(p_role), '');
  v_target_role_id uuid;
  v_is_system boolean := false;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org_id
  from public.profiles p
  where p.id = p_target and p.status = 'pending';
  if not found then
    raise exception 'profile not found or not pending';
  end if;

  if not public.has_permission(v_viewer, v_org_id, 'approvals.members.review', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not public.approver_can_act_on_pending_member(v_viewer, p_target, v_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not p_approve then
    update public.profiles
    set
      status = 'inactive',
      reviewed_at = now(),
      reviewed_by = v_viewer,
      rejection_note = nullif(trim(p_rejection_note), '')
    where id = p_target
      and status = 'pending';
    return;
  end if;

  if v_trim_role is null then
    raise exception 'Choose a role before approving this member';
  end if;

  select r.id, r.is_system
  into v_target_role_id, v_is_system
  from public.org_roles r
  where r.org_id = v_org_id
    and r.key = v_trim_role
    and r.is_archived = false
  limit 1;

  if v_target_role_id is null then
    raise exception 'Invalid role for this organisation';
  end if;

  if not public.actor_can_assign_role(v_viewer, v_org_id, v_target_role_id) then
    raise exception 'cannot assign a role above your own level' using errcode = '42501';
  end if;

  if not public.is_effective_org_admin(v_viewer, v_org_id)
     and not public.is_platform_founder(v_viewer) then
    if coalesce(v_is_system, false) then
      raise exception 'only org admins may assign system (predefined) roles' using errcode = '42501';
    end if;
  end if;

  if v_trim_role in ('org_admin', 'super_admin') then
    if not public.is_effective_org_admin(v_viewer, v_org_id)
       and not public.is_platform_founder(v_viewer) then
      raise exception 'org admin approvals require another existing org admin' using errcode = '42501';
    end if;
  end if;

  update public.profiles
  set
    status = 'active',
    role = v_trim_role,
    reviewed_at = now(),
    reviewed_by = v_viewer,
    rejection_note = null
  where id = p_target
    and status = 'pending';

  insert into public.user_org_role_assignments (user_id, org_id, role_id, assigned_by)
  values (p_target, v_org_id, v_target_role_id, v_viewer)
  on conflict (user_id, org_id, role_id) do nothing;
end;
$$;

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
  v_fallback uuid;
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
      and status = 'active'
      and role in ('org_admin', 'super_admin');

    if v_org_admin_count <= 2 then
      raise exception 'cannot reduce org admins below 2 for this organisation';
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
  using public.broadcast_channels c
  join public.departments d on d.id = c.dept_id
  where us.user_id = p_target
    and us.channel_id = c.id
    and d.org_id = v_org;

  delete from public.broadcast_reads br
  using public.broadcasts b
  where br.user_id = p_target
    and br.broadcast_id = b.id
    and b.org_id = v_org;

  delete from public.rota_shifts
  where org_id = v_org
    and user_id = p_target;

  delete from public.user_org_memberships
  where user_id = p_target
    and org_id = v_org;

  select m.org_id
  into v_fallback
  from public.user_org_memberships m
  where m.user_id = p_target
  order by m.updated_at desc
  limit 1;

  if v_fallback is not null then
    update public.profiles p
    set
      org_id = m.org_id,
      full_name = m.full_name,
      email = m.email,
      role = m.role,
      status = m.status,
      reviewed_at = m.reviewed_at,
      reviewed_by = m.reviewed_by,
      rejection_note = m.rejection_note
    from public.user_org_memberships m
    where p.id = p_target
      and m.user_id = p.id
      and m.org_id = v_fallback;
  else
    update public.profiles
    set
      org_id = null,
      role = 'unassigned',
      status = 'inactive',
      reviewed_at = now(),
      reviewed_by = v_viewer,
      rejection_note = null
    where id = p_target;
  end if;
end;
$$;
