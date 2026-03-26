-- Allow legacy `super_admin` profile role to mutate dept broadcast toggles (matches isOrgAdminRole in app).

drop policy if exists dept_broadcast_permissions_mutate_org_admin on public.dept_broadcast_permissions;

create policy dept_broadcast_permissions_mutate_org_admin
  on public.dept_broadcast_permissions
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_broadcast_permissions.dept_id
        and d.org_id = p.org_id
        and p.role in ('org_admin', 'super_admin')
        and p.status = 'active'
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      join public.profiles p on p.id = auth.uid()
      where d.id = dept_broadcast_permissions.dept_id
        and d.org_id = p.org_id
        and p.role in ('org_admin', 'super_admin')
        and p.status = 'active'
    )
  );
