-- Pending-member approvers must be active members (inactive managers/coordinators cannot approve).

create or replace function public.can_approve_profile(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pv
    join public.profiles pt on pt.id = target
    where pv.id = viewer
      and pv.status = 'active'
      and pv.org_id = pt.org_id
      and pt.status = 'pending'
      and viewer <> target
      and (
        pv.role = 'org_admin'
        or pv.role = 'super_admin'
        or (
          pv.role = 'manager'
          and exists (
            select 1
            from public.user_departments udt
            join public.dept_managers dm
              on dm.dept_id = udt.dept_id and dm.user_id = viewer
            where udt.user_id = target
          )
        )
        or (
          pv.role = 'coordinator'
          and exists (
            select 1
            from public.user_departments udt
            join public.user_departments udt2
              on udt2.dept_id = udt.dept_id and udt2.user_id = target
            where udt.user_id = viewer
          )
        )
      )
  );
$$;
