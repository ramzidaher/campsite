-- Guard against recursive/stack-depth failures while switching active org.
-- Keep `set_my_active_org` focused on state switch only.

create or replace function public.set_my_active_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.user_org_memberships m
    where m.user_id = v_uid
      and m.org_id = p_org_id
      and m.status = 'active'
  ) then
    raise exception 'not an active member of this organisation' using errcode = '42501';
  end if;

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
  where p.id = v_uid
    and m.user_id = p.id
    and m.org_id = p_org_id
    and m.status = 'active'
    and (
      p.org_id is distinct from m.org_id
      or p.full_name is distinct from m.full_name
      or p.email is distinct from m.email
      or p.role is distinct from m.role
      or p.status is distinct from m.status
      or p.reviewed_at is distinct from m.reviewed_at
      or p.reviewed_by is distinct from m.reviewed_by
      or p.rejection_note is distinct from m.rejection_note
    );
end;
$$;

revoke all on function public.set_my_active_org(uuid) from public;
grant execute on function public.set_my_active_org(uuid) to authenticated;

