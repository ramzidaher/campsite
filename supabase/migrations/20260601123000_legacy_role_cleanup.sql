-- Legacy role cleanup for custom RBAC cutover.
-- Keep legacy columns for compatibility, but remove hard enum checks.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role is not null and length(trim(role)) > 0);

alter table public.user_org_memberships
  drop constraint if exists user_org_memberships_role_check;

alter table public.user_org_memberships
  add constraint user_org_memberships_role_check
  check (role is not null and length(trim(role)) > 0);

alter table public.discount_tiers
  drop constraint if exists discount_tiers_role_check;

alter table public.discount_tiers
  add constraint discount_tiers_role_check
  check (role is not null and length(trim(role)) > 0);

create or replace function public.can_approve_profile(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(viewer, p.org_id, 'approvals.members.review', '{}'::jsonb)
  from public.profiles p
  where p.id = target
    and p.status = 'pending';
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
  if not exists (
    select 1 from public.org_roles r
    where r.org_id = v_org_id
      and r.key = v_trim_role
      and r.is_archived = false
  ) then
    raise exception 'Invalid role for this organisation';
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
  select p_target, v_org_id, r.id, v_viewer
  from public.org_roles r
  where r.org_id = v_org_id
    and r.key = v_trim_role
    and r.is_archived = false
  on conflict (user_id, org_id, role_id) do nothing;
end;
$$;

