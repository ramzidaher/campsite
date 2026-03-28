-- Allow department managers (profile.role = manager + dept_managers row) to add/remove
-- org members from departments they manage. Org admins already have user_departments_org_admin_all.

drop policy if exists user_departments_dept_manager_insert on public.user_departments;
create policy user_departments_dept_manager_insert
  on public.user_departments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.departments d
      join public.dept_managers dm
        on dm.dept_id = d.id
        and dm.user_id = auth.uid()
      join public.profiles pv
        on pv.id = auth.uid()
        and pv.role = 'manager'
        and pv.status = 'active'
        and pv.org_id = d.org_id
      join public.profiles pt
        on pt.id = user_departments.user_id
        and pt.org_id = d.org_id
        and pt.status = 'active'
      where d.id = user_departments.dept_id
    )
  );

drop policy if exists user_departments_dept_manager_delete on public.user_departments;
create policy user_departments_dept_manager_delete
  on public.user_departments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.dept_managers dm
        on dm.dept_id = d.id
        and dm.user_id = auth.uid()
      join public.profiles pv
        on pv.id = auth.uid()
        and pv.role = 'manager'
        and pv.status = 'active'
        and pv.org_id = d.org_id
      where d.id = user_departments.dept_id
    )
  );
