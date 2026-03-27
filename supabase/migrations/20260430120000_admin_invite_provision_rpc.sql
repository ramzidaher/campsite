-- Provision org member row after Auth admin invite (service_role only). Self-service sign-up cannot call this.

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
begin
  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Profile already exists for this user';
  end if;

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

comment on function public.admin_provision_invited_member(uuid, uuid, text, text, uuid[]) is
  'Creates profiles + optional user_departments after inviteUserByEmail; invoke with service_role JWT only.';
