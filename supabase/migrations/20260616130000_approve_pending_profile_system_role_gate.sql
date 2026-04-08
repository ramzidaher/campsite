-- Align member approval role selection with assign_user_org_role: non–org-admins
-- may not assign predefined (system) roles when approving pending profiles.

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
