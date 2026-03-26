-- Plan 02: composer-friendly caps (auth.uid() only) + legacy super_admin parity in helpers.

create or replace function public.user_has_dept_broadcast_permission(
  p_user_id uuid,
  p_dept_id uuid,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_user_id is null or p_dept_id is null or p_permission is null then
    return false;
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = p_user_id
    and p.status = 'active';

  if v_role is null then
    return false;
  end if;

  if v_role in ('org_admin', 'super_admin') then
    return true;
  end if;

  return exists (
    select 1
    from public.dept_broadcast_permissions dbp
    where dbp.dept_id = p_dept_id
      and dbp.permission = p_permission
      and (
        (dbp.min_role = 'manager'
          and v_role = 'manager'
          and exists (
            select 1 from public.dept_managers dm
            where dm.user_id = p_user_id and dm.dept_id = p_dept_id
          ))
        or (dbp.min_role = 'coordinator'
          and v_role in ('manager', 'coordinator')
          and (
            exists (
              select 1 from public.dept_managers dm
              where dm.user_id = p_user_id and dm.dept_id = p_dept_id
            )
            or exists (
              select 1 from public.user_departments ud
              where ud.user_id = p_user_id and ud.dept_id = p_dept_id
            )
          ))
        or (dbp.min_role = 'coordinator_only'
          and v_role = 'coordinator'
          and exists (
            select 1 from public.user_departments ud
            where ud.user_id = p_user_id and ud.dept_id = p_dept_id
          ))
      )
  );
end;
$$;

create or replace function public.user_has_any_dept_broadcast_permission(
  p_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_user_id is null then
    return false;
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = p_user_id
    and p.status = 'active';

  if v_role in ('org_admin', 'super_admin') then
    return true;
  end if;

  return exists (
    select 1
    from public.dept_broadcast_permissions dbp
    where dbp.permission = p_permission
      and public.user_has_dept_broadcast_permission(p_user_id, dbp.dept_id, p_permission)
  );
end;
$$;

create or replace function public.broadcast_form_allowed(
  p_status text,
  p_dept_id uuid,
  p_is_org_wide boolean,
  p_is_mandatory boolean,
  p_is_pinned boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_uid
    and p.status = 'active';

  if v_role is null then
    return false;
  end if;

  if coalesce(p_is_org_wide, false)
    and not public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'send_org_wide') then
    return false;
  end if;

  if coalesce(p_is_mandatory, false)
    and not public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'mandatory_broadcast') then
    return false;
  end if;

  if coalesce(p_is_pinned, false)
    and not public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'pin_broadcasts') then
    return false;
  end if;

  if v_role in ('org_admin', 'super_admin', 'society_leader') then
    return p_status in ('draft', 'pending_approval', 'scheduled', 'sent');
  end if;

  if v_role in ('administrator', 'duty_manager', 'csa') then
    if coalesce(p_is_org_wide, false) or coalesce(p_is_mandatory, false) or coalesce(p_is_pinned, false) then
      return false;
    end if;
    return p_status in ('draft', 'pending_approval');
  end if;

  if v_role = 'coordinator' then
    if public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'send_no_approval') then
      return p_status in ('draft', 'pending_approval', 'scheduled', 'sent');
    end if;
    return p_status in ('draft', 'pending_approval');
  end if;

  if v_role = 'manager' then
    return p_status in ('draft', 'pending_approval', 'scheduled', 'sent');
  end if;

  return false;
end;
$$;

create or replace function public.get_my_dept_broadcast_caps(p_dept_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_dept_id is null then
    return jsonb_build_object(
      'send_org_wide', false,
      'mandatory_broadcast', false,
      'pin_broadcasts', false
    );
  end if;

  return jsonb_build_object(
    'send_org_wide', public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'send_org_wide'),
    'mandatory_broadcast', public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'mandatory_broadcast'),
    'pin_broadcasts', public.user_has_dept_broadcast_permission(v_uid, p_dept_id, 'pin_broadcasts')
  );
end;
$$;

revoke all on function public.get_my_dept_broadcast_caps(uuid) from public;
grant execute on function public.get_my_dept_broadcast_caps(uuid) to authenticated;

comment on function public.get_my_dept_broadcast_caps(uuid) is
  'Returns which broadcast delivery flags the current user may set for p_dept_id (Plan 02).';
