-- Administrators may use the same broadcast statuses as managers (sent / scheduled without manager approval).
-- Duty managers and CSAs remain draft + pending_approval only; org-wide / mandatory / pin still require toggles where applicable.

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

  if v_role in ('duty_manager', 'csa') then
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

  if v_role in ('manager', 'administrator') then
    return p_status in ('draft', 'pending_approval', 'scheduled', 'sent');
  end if;

  return false;
end;
$$;
