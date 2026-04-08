-- Phase 5: custom role builder — privilege caps on role definitions, system-role protection, custom-only assignment for non–org admins.

-- ---------------------------------------------------------------------------
-- create_org_role: cap permissions to actor; block founder-only keys for tenants
-- ---------------------------------------------------------------------------

create or replace function public.create_org_role(
  p_org_id uuid,
  p_key text,
  p_label text,
  p_description text default '',
  p_permission_keys text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_key text := lower(regexp_replace(trim(coalesce(p_key, '')), '[^a-z0-9_]+', '_', 'g'));
  v_perm text;
  v_trim text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.has_permission(auth.uid(), p_org_id, 'roles.manage', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_key = '' then
    raise exception 'role key required';
  end if;

  if trim(coalesce(p_label, '')) = '' then
    raise exception 'role label required';
  end if;

  foreach v_perm in array coalesce(p_permission_keys, '{}')
  loop
    v_trim := trim(v_perm);
    continue when v_trim = '';
    if not exists (select 1 from public.permission_catalog c where c.key = v_trim) then
      raise exception 'unknown permission: %', v_trim;
    end if;
    if exists (select 1 from public.permission_catalog c where c.key = v_trim and c.is_founder_only)
       and not public.is_platform_founder(auth.uid()) then
      raise exception 'founder-only permission cannot be added to org roles: %', v_trim;
    end if;
    if not public.is_effective_org_admin(auth.uid(), p_org_id)
       and not public.is_platform_founder(auth.uid())
       and not public.has_permission(auth.uid(), p_org_id, v_trim, '{}'::jsonb) then
      raise exception 'cannot include permission you do not hold: %', v_trim using errcode = '42501';
    end if;
  end loop;

  insert into public.org_roles (org_id, key, label, description, is_system, is_archived, created_by)
  values (p_org_id, v_key, trim(p_label), coalesce(p_description, ''), false, false, auth.uid())
  returning id into v_role_id;

  foreach v_perm in array coalesce(p_permission_keys, '{}')
  loop
    insert into public.org_role_permissions (role_id, permission_key)
    values (v_role_id, trim(v_perm))
    on conflict do nothing;
  end loop;

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (p_org_id, auth.uid(), null, 'role.created', jsonb_build_object('role_id', v_role_id, 'key', v_key));

  return v_role_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_org_role_permissions: system roles editable only by effective org admin; cap perms to actor
-- ---------------------------------------------------------------------------

create or replace function public.update_org_role_permissions(
  p_org_id uuid,
  p_role_id uuid,
  p_label text,
  p_description text,
  p_permission_keys text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perm text;
  v_trim text;
  v_is_system boolean := false;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.has_permission(auth.uid(), p_org_id, 'roles.manage', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select r.is_system
  into v_is_system
  from public.org_roles r
  where r.id = p_role_id and r.org_id = p_org_id and r.is_archived = false;

  if not found then
    raise exception 'role not found';
  end if;

  if v_is_system and not public.is_effective_org_admin(auth.uid(), p_org_id)
     and not public.is_platform_founder(auth.uid()) then
    raise exception 'system roles cannot be edited' using errcode = '42501';
  end if;

  foreach v_perm in array coalesce(p_permission_keys, '{}')
  loop
    v_trim := trim(v_perm);
    continue when v_trim = '';
    if not exists (select 1 from public.permission_catalog c where c.key = v_trim) then
      raise exception 'unknown permission: %', v_trim;
    end if;
    if exists (select 1 from public.permission_catalog c where c.key = v_trim and c.is_founder_only)
       and not public.is_platform_founder(auth.uid()) then
      raise exception 'founder-only permission cannot be added to org roles: %', v_trim;
    end if;
    if not public.is_effective_org_admin(auth.uid(), p_org_id)
       and not public.is_platform_founder(auth.uid())
       and not public.has_permission(auth.uid(), p_org_id, v_trim, '{}'::jsonb) then
      raise exception 'cannot include permission you do not hold: %', v_trim using errcode = '42501';
    end if;
  end loop;

  update public.org_roles r
  set
    label = trim(coalesce(p_label, r.label)),
    description = coalesce(p_description, r.description),
    updated_at = now()
  where r.id = p_role_id
    and r.org_id = p_org_id
    and r.is_archived = false;

  delete from public.org_role_permissions rp
  using public.org_roles r
  where rp.role_id = r.id
    and r.id = p_role_id
    and r.org_id = p_org_id;

  foreach v_perm in array coalesce(p_permission_keys, '{}')
  loop
    insert into public.org_role_permissions (role_id, permission_key)
    values (p_role_id, trim(v_perm))
    on conflict do nothing;
  end loop;

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (p_org_id, auth.uid(), null, 'role.permissions_updated', jsonb_build_object('role_id', p_role_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- archive_org_custom_role: soft-delete custom roles only
-- ---------------------------------------------------------------------------

create or replace function public.archive_org_custom_role(p_org_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_system boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.has_permission(auth.uid(), p_org_id, 'roles.manage', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select r.is_system into v_is_system
  from public.org_roles r
  where r.id = p_role_id and r.org_id = p_org_id and r.is_archived = false;

  if not found then
    raise exception 'role not found';
  end if;

  if v_is_system then
    raise exception 'system roles cannot be archived' using errcode = '42501';
  end if;

  if not public.is_effective_org_admin(auth.uid(), p_org_id)
     and not public.is_platform_founder(auth.uid()) then
    -- Non–org-admin: may only archive roles whose permission set is a subset of the actor's (same rule as edit).
    if exists (
      select 1
      from public.org_role_permissions rp
      where rp.role_id = p_role_id
        and not public.has_permission(auth.uid(), p_org_id, rp.permission_key, '{}'::jsonb)
    ) then
      raise exception 'cannot archive a role that includes permissions you do not hold' using errcode = '42501';
    end if;
  end if;

  update public.org_roles r
  set is_archived = true, updated_at = now()
  where r.id = p_role_id and r.org_id = p_org_id;

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (p_org_id, auth.uid(), null, 'role.archived', jsonb_build_object('role_id', p_role_id));
end;
$$;

revoke all on function public.archive_org_custom_role(uuid, uuid) from public;
grant execute on function public.archive_org_custom_role(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- assign_user_org_role: non–org admins may assign only custom (non-system) roles
-- ---------------------------------------------------------------------------

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

  select r.is_system
  into v_is_system
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

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (p_org_id, auth.uid(), p_user_id, 'role.assigned', jsonb_build_object('role_id', p_role_id));
end;
$$;

comment on column public.org_roles.is_system is
  'Predefined tenant roles (seeded, non-deletable). Custom roles from the role builder always have is_system = false.';
