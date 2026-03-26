-- Self-registration creates `profiles.role = unassigned`. Approvers must pass `p_role` when approving.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (
    role in (
      'unassigned',
      'org_admin',
      'manager',
      'coordinator',
      'administrator',
      'duty_manager',
      'csa',
      'society_leader'
    )
  );

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (
    id = auth.uid()
    and org_id is not null
    and role in ('csa', 'unassigned')
  );

create or replace function public.apply_registration_from_user_meta(
  p_user_id uuid,
  p_email text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_full text;
  v_depts jsonb;
  v_subs jsonb;
  dept_count int;
  valid_dept_count int;
begin
  if exists (select 1 from public.profiles where id = p_user_id) then
    return;
  end if;

  v_org := nullif(trim(coalesce(p_meta->>'register_org_id', '')), '')::uuid;
  if v_org is null then
    return;
  end if;

  if not exists (
    select 1 from public.organisations o where o.id = v_org and o.is_active = true
  ) then
    raise exception 'Invalid organisation for registration';
  end if;

  v_full := coalesce(nullif(trim(coalesce(p_meta->>'full_name', '')), ''), 'Member');

  begin
    v_depts := (p_meta->>'register_dept_ids')::jsonb;
  exception
    when others then
      raise exception 'Invalid registration department data';
  end;

  if v_depts is null or jsonb_typeof(v_depts) <> 'array' or jsonb_array_length(v_depts) = 0 then
    raise exception 'Select at least one team';
  end if;

  select count(*)::int into dept_count from jsonb_array_elements_text(v_depts) q(did);

  select count(*)::int into valid_dept_count
  from jsonb_array_elements_text(v_depts) q(did)
  join public.departments d on d.id = q.did::uuid
  where d.org_id = v_org and d.is_archived = false;

  if valid_dept_count <> dept_count then
    raise exception 'Invalid department for registration';
  end if;

  insert into public.profiles (id, org_id, full_name, email, role, status)
  values (p_user_id, v_org, v_full, p_email, 'unassigned', 'pending');

  insert into public.user_departments (user_id, dept_id)
  select p_user_id, q.did::uuid
  from jsonb_array_elements_text(v_depts) q(did);

  begin
    v_subs := coalesce((p_meta->>'register_subscriptions')::jsonb, '[]'::jsonb);
  exception
    when others then
      v_subs := '[]'::jsonb;
  end;

  if jsonb_typeof(v_subs) = 'array' and jsonb_array_length(v_subs) > 0 then
    insert into public.user_subscriptions (user_id, cat_id, subscribed)
    select
      p_user_id,
      (s.item->>'cat_id')::uuid,
      coalesce((s.item->>'subscribed')::boolean, true)
    from jsonb_array_elements(v_subs) s(item)
    where exists (
      select 1
      from public.dept_categories c
      join public.departments d on d.id = c.dept_id
      where c.id = (s.item->>'cat_id')::uuid
        and d.org_id = v_org
        and d.is_archived = false
        and d.id in (select q.did::uuid from jsonb_array_elements_text(v_depts) q(did))
    );
  end if;
end;
$$;

drop function if exists public.approve_pending_profile(uuid, boolean, text);

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
  v_target_role text;
  v_viewer_role text;
  v_new_role text;
  v_trim_role text;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  if not public.can_approve_profile(v_viewer, p_target) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select role into v_target_role from public.profiles where id = p_target and status = 'pending';
  if not found then
    raise exception 'profile not found or not pending';
  end if;

  select role into v_viewer_role from public.profiles where id = v_viewer and status = 'active';

  if not p_approve then
    update public.profiles
    set
      status = 'inactive',
      reviewed_at = now(),
      reviewed_by = v_viewer,
      rejection_note = nullif(trim(p_rejection_note), '')
    where id = p_target
      and status = 'pending';
    if not found then
      raise exception 'profile not found or not pending';
    end if;
    return;
  end if;

  v_trim_role := nullif(trim(p_role), '');

  if v_target_role = 'unassigned' then
    if v_trim_role is null or v_trim_role = 'unassigned' then
      raise exception 'Choose a role before approving this member';
    end if;
    if v_trim_role not in (
      'org_admin',
      'manager',
      'coordinator',
      'administrator',
      'duty_manager',
      'csa',
      'society_leader'
    ) then
      raise exception 'Invalid role';
    end if;
    if v_trim_role = 'org_admin' and v_viewer_role not in ('org_admin', 'super_admin') then
      raise exception 'Only organisation admins can assign the org admin role';
    end if;
    if v_viewer_role in ('manager', 'coordinator') and v_trim_role in ('org_admin', 'manager') then
      raise exception 'You cannot assign manager or org admin roles';
    end if;
    v_new_role := v_trim_role;
  else
    v_new_role := coalesce(v_trim_role, v_target_role);
    if v_new_role = 'unassigned' or v_new_role not in (
      'org_admin',
      'manager',
      'coordinator',
      'administrator',
      'duty_manager',
      'csa',
      'society_leader'
    ) then
      raise exception 'Invalid role for approval';
    end if;
    if v_new_role = 'org_admin' and v_viewer_role not in ('org_admin', 'super_admin') then
      raise exception 'Only organisation admins can assign the org admin role';
    end if;
    if v_viewer_role in ('manager', 'coordinator') and v_new_role in ('org_admin', 'manager') then
      raise exception 'You cannot assign manager or org admin roles';
    end if;
  end if;

  update public.profiles
  set
    status = 'active',
    role = v_new_role,
    reviewed_at = now(),
    reviewed_by = v_viewer,
    rejection_note = null
  where id = p_target
    and status = 'pending';

  if not found then
    raise exception 'profile not found or not pending';
  end if;
end;
$$;

revoke all on function public.approve_pending_profile(uuid, boolean, text, text) from public;
grant execute on function public.approve_pending_profile(uuid, boolean, text, text) to authenticated;
