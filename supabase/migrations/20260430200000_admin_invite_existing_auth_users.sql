-- Invites: existing auth.users emails cannot use inviteUserByEmail. Lookup by email + upsert profile in target org.

create or replace function public.admin_find_auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select u.id
  from auth.users u
  where lower(trim(u.email)) = lower(trim(p_email))
  order by u.created_at desc
  limit 1;
$$;

revoke all on function public.admin_find_auth_user_id_by_email(text) from public;
grant execute on function public.admin_find_auth_user_id_by_email(text) to service_role;

create or replace function public.admin_provision_invited_member(
  p_user_id uuid,
  p_org_id uuid,
  p_full_name text,
  p_role text,
  p_dept_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_name text;
  v_dept uuid;
  v_existing_org uuid;
begin
  if not exists (
    select 1 from public.organisations o where o.id = p_org_id and o.is_active = true
  ) then
    raise exception 'Invalid organisation';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'Auth user not found';
  end if;

  v_name := coalesce(nullif(trim(p_full_name), ''), 'Member');

  if p_role is null
    or trim(p_role) = ''
    or trim(p_role) not in (
      'org_admin',
      'manager',
      'coordinator',
      'administrator',
      'duty_manager',
      'csa',
      'society_leader'
    )
  then
    raise exception 'Invalid role for invite';
  end if;

  if p_dept_ids is not null then
    foreach v_dept in array p_dept_ids
    loop
      if not exists (
        select 1
        from public.departments d
        where d.id = v_dept and d.org_id = p_org_id and d.is_archived = false
      ) then
        raise exception 'Invalid department for organisation';
      end if;
    end loop;
  end if;

  select org_id into v_existing_org from public.profiles where id = p_user_id;

  if found then
    if v_existing_org is distinct from p_org_id then
      raise exception 'This account already belongs to another organisation';
    end if;

    update public.profiles
    set
      full_name = v_name,
      email = nullif(trim(v_email), ''),
      role = trim(p_role),
      status = 'active'
    where id = p_user_id;

    delete from public.user_departments where user_id = p_user_id;

    if p_dept_ids is not null and cardinality(p_dept_ids) > 0 then
      insert into public.user_departments (user_id, dept_id)
      select p_user_id, d
      from (select distinct unnest(p_dept_ids) as d) q;
    end if;

    return;
  end if;

  insert into public.profiles (id, org_id, full_name, email, role, status)
  values (
    p_user_id,
    p_org_id,
    v_name,
    nullif(trim(v_email), ''),
    trim(p_role),
    'active'
  );

  if p_dept_ids is not null and cardinality(p_dept_ids) > 0 then
    insert into public.user_departments (user_id, dept_id)
    select p_user_id, d
    from (select distinct unnest(p_dept_ids) as d) q;
  end if;
end;
$$;

revoke all on function public.admin_provision_invited_member(uuid, uuid, text, text, uuid[]) from public;
grant execute on function public.admin_provision_invited_member(uuid, uuid, text, text, uuid[]) to service_role;

comment on function public.admin_find_auth_user_id_by_email(text) is
  'service_role: resolve auth.users.id from email for admin invite fallback when inviteUserByEmail conflicts.';

comment on function public.admin_provision_invited_member(uuid, uuid, text, text, uuid[]) is
  'Creates or updates profiles in org after invite / existing-auth add; service_role only.';
