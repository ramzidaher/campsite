-- Re-fix ambiguous `d.*` / variable `d` in user_may_broadcast_to_dept (reintroduced in 20260331210000).

create or replace function public.user_may_broadcast_to_dept(p_dept_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org uuid;
  dept_row record;
begin
  select p.role, p.org_id into v_role, v_org
  from public.profiles p
  where p.id = auth.uid();

  if v_org is null or v_role is null then
    return false;
  end if;

  select dept.*
  into dept_row
  from public.departments dept
  where dept.id = p_dept_id;

  if not found then
    return false;
  end if;

  if dept_row.org_id is distinct from v_org then
    return false;
  end if;

  case v_role
    when 'org_admin', 'super_admin' then
      return true;
    when 'manager' then
      return exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid() and dm.dept_id = p_dept_id
      );
    when 'coordinator' then
      return exists (
        select 1 from public.user_departments ud
        where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
      );
    when 'administrator', 'duty_manager', 'csa' then
      return exists (
        select 1 from public.user_departments ud
        where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
      );
    when 'society_leader' then
      return dept_row.type in ('society', 'club')
        and exists (
          select 1 from public.user_departments ud
          where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
        );
    else
      return false;
  end case;
end;
$$;
