-- Centralised member + broadcast approval (security definer with explicit auth checks).
-- Clients call these RPCs so behaviour is consistent on web, mobile, and any future API.

create or replace function public.approve_pending_profile(
  p_target uuid,
  p_approve boolean,
  p_rejection_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  if not public.can_approve_profile(v_viewer, p_target) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_approve then
    update public.profiles
    set
      status = 'active',
      reviewed_at = now(),
      reviewed_by = v_viewer,
      rejection_note = null
    where id = p_target
      and status = 'pending';
  else
    update public.profiles
    set
      status = 'inactive',
      reviewed_at = now(),
      reviewed_by = v_viewer,
      rejection_note = nullif(trim(p_rejection_note), '')
    where id = p_target
      and status = 'pending';
  end if;

  if not found then
    raise exception 'profile not found or not pending';
  end if;
end;
$$;

create or replace function public.decide_pending_broadcast(
  p_broadcast_id uuid,
  p_action text,
  p_rejection_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  rec public.broadcasts%rowtype;
  v_role text;
  v_org uuid;
  v_ok boolean := false;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  if p_action not in ('approve_send', 'reject') then
    raise exception 'invalid action';
  end if;

  select * into rec from public.broadcasts where id = p_broadcast_id;
  if not found then
    raise exception 'broadcast not found';
  end if;

  if rec.status is distinct from 'pending_approval' then
    raise exception 'broadcast is not pending approval';
  end if;

  select p.role, p.org_id into v_role, v_org
  from public.profiles p
  where p.id = v_viewer
    and p.status = 'active';

  if v_org is null or v_role is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if rec.org_id is distinct from v_org then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if v_role in ('super_admin', 'senior_manager') then
    v_ok := true;
  elsif exists (
    select 1
    from public.dept_managers dm
    where dm.user_id = v_viewer
      and dm.dept_id = rec.dept_id
  ) then
    v_ok := true;
  end if;

  if not v_ok then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_action = 'approve_send' then
    update public.broadcasts
    set
      status = 'sent',
      sent_at = coalesce(sent_at, now()),
      reviewed_by = v_viewer,
      reviewed_at = now(),
      rejection_note = null
    where id = p_broadcast_id
      and status = 'pending_approval';
  else
    update public.broadcasts
    set
      status = 'draft',
      reviewed_by = v_viewer,
      reviewed_at = now(),
      rejection_note = coalesce(nullif(trim(p_rejection_note), ''), 'Rejected')
    where id = p_broadcast_id
      and status = 'pending_approval';
  end if;

  if not found then
    raise exception 'broadcast was modified or not pending';
  end if;
end;
$$;

revoke all on function public.approve_pending_profile(uuid, boolean, text) from public;
grant execute on function public.approve_pending_profile(uuid, boolean, text) to authenticated;

revoke all on function public.decide_pending_broadcast(uuid, text, text) from public;
grant execute on function public.decide_pending_broadcast(uuid, text, text) to authenticated;
