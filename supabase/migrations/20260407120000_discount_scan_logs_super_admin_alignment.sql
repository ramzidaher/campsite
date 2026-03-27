-- Legacy `super_admin`: same org discount tier management and scan log visibility as `org_admin` (matches `isOrgAdminRole`).

drop policy if exists scan_logs_org_admin_select on public.scan_logs;
create policy scan_logs_org_admin_select
  on public.scan_logs
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('org_admin', 'super_admin')
        and p.status = 'active'
    )
  );

drop policy if exists discount_tiers_insert on public.discount_tiers;
create policy discount_tiers_insert
  on public.discount_tiers
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('org_admin', 'super_admin')
        and p.status = 'active'
    )
  );

drop policy if exists discount_tiers_update on public.discount_tiers;
create policy discount_tiers_update
  on public.discount_tiers
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('org_admin', 'super_admin')
        and p.status = 'active'
    )
  )
  with check (org_id = public.current_org_id());

drop policy if exists discount_tiers_delete on public.discount_tiers;
create policy discount_tiers_delete
  on public.discount_tiers
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('org_admin', 'super_admin')
        and p.status = 'active'
    )
  );
