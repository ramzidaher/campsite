-- Align broadcast_channels mutations with tenant org-admin resolution (legacy super_admin,
-- RBAC org_admin assignment via user_org_role_assignments, platform founder bypass).
-- Depends on: public.is_effective_org_admin (phase3 department isolation).

drop policy if exists broadcast_channels_mutate_org_admin on public.broadcast_channels;

create policy broadcast_channels_mutate_org_admin
  on public.broadcast_channels
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.departments d
      where d.id = broadcast_channels.dept_id
        and public.is_effective_org_admin(auth.uid(), d.org_id)
    )
  )
  with check (
    exists (
      select 1
      from public.departments d
      where d.id = broadcast_channels.dept_id
        and public.is_effective_org_admin(auth.uid(), d.org_id)
    )
  );

comment on policy broadcast_channels_mutate_org_admin on public.broadcast_channels is
  'Insert/update/delete broadcast_channels for departments in the viewer''s org when is_effective_org_admin (profile org_admin/super_admin, RBAC org_admin role, or platform founder).';
