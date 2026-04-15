-- Fix profiles RLS recursion by avoiding helper chains that can re-enter profiles policies.
-- Use direct membership/role/department checks only.

drop policy if exists profiles_select_department_isolation on public.profiles;

create policy profiles_select_department_isolation
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.is_platform_founder((select auth.uid()))
    or (
      exists (
        select 1
        from public.user_org_memberships vm
        where vm.user_id = (select auth.uid())
          and vm.org_id = profiles.org_id
      )
      and (
        exists (
          select 1
          from public.user_org_role_assignments ua
          join public.org_roles r
            on r.id = ua.role_id
           and r.org_id = ua.org_id
          where ua.user_id = (select auth.uid())
            and ua.org_id = profiles.org_id
            and r.key = 'org_admin'
        )
        or exists (
          select 1
          from public.user_departments viewer_ud
          join public.user_departments target_ud
            on target_ud.dept_id = viewer_ud.dept_id
           and target_ud.user_id = profiles.id
          join public.departments d
            on d.id = viewer_ud.dept_id
           and d.org_id = profiles.org_id
          where viewer_ud.user_id = (select auth.uid())
            and not d.is_archived
        )
      )
    )
  );
