-- Phase 6: keep profiles.role in sync with RBAC assignment; list roles the actor may assign;
-- allow managers (members.edit_roles) to update reports_to via RPC (profiles UPDATE is org-admin only).

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

create or replace function public.update_member_reports_to(
  p_org_id uuid,
  p_target_user_id uuid,
  p_reports_to_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_org_id is null or p_org_id <> public.current_org_id() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not public.has_permission(auth.uid(), p_org_id, 'members.edit_roles', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_org_memberships m
    where m.user_id = p_target_user_id
      and m.org_id = p_org_id
      and m.status = 'active'
  ) then
    raise exception 'target is not an active member of this organisation';
  end if;

  if not public.is_effective_org_admin(auth.uid(), p_org_id) then
    if auth.uid() = p_target_user_id then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if not public.is_reports_descendant_in_org(p_org_id, auth.uid(), p_target_user_id) then
      raise exception 'role assignment allowed only for direct or indirect reports' using errcode = '42501';
    end if;
  end if;

  if p_reports_to_user_id is not null then
    if p_reports_to_user_id = p_target_user_id then
      raise exception 'invalid manager';
    end if;
    if not exists (
      select 1
      from public.profiles p
      where p.id = p_reports_to_user_id
        and p.org_id = p_org_id
        and p.status = 'active'
    ) then
      raise exception 'manager not found in this organisation';
    end if;
    if public.is_reports_descendant_in_org(p_org_id, p_target_user_id, p_reports_to_user_id) then
      raise exception 'cannot set reporting line that creates a cycle' using errcode = '42501';
    end if;
  end if;

  update public.profiles pr
  set
    reports_to_user_id = p_reports_to_user_id,
    updated_at = now()
  where pr.id = p_target_user_id
    and pr.org_id = p_org_id;
end;
$$;

revoke all on function public.update_member_reports_to(uuid, uuid, uuid) from public;
grant execute on function public.update_member_reports_to(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.list_assignable_org_roles(p_org_id uuid)
returns table (
  id uuid,
  key text,
  label text,
  is_system boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_org_id is null or p_org_id <> public.current_org_id() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not (
    public.has_permission(auth.uid(), p_org_id, 'members.edit_roles', '{}'::jsonb)
    or public.has_permission(auth.uid(), p_org_id, 'approvals.members.review', '{}'::jsonb)
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.key,
    r.label,
    r.is_system
  from public.org_roles r
  where r.org_id = p_org_id
    and r.is_archived = false
    and public.actor_can_assign_role(auth.uid(), p_org_id, r.id)
    and (
      public.is_effective_org_admin(auth.uid(), p_org_id)
      or public.is_platform_founder(auth.uid())
      or coalesce(r.is_system, false) = false
    )
  order by r.is_system desc, r.rank_level desc, r.rank_order desc, r.label;
end;
$$;

revoke all on function public.list_assignable_org_roles(uuid) from public;
grant execute on function public.list_assignable_org_roles(uuid) to authenticated, service_role;
