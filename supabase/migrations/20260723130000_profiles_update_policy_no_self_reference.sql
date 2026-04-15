-- Fix profiles UPDATE recursion by removing self-referential WITH CHECK subquery.
-- Keep approver behavior scoped to current org via current_org_id().

drop policy if exists profiles_update_by_approver on public.profiles;

create policy profiles_update_by_approver
  on public.profiles
  for update
  to authenticated
  using (
    can_approve_profile((select auth.uid()), id)
  )
  with check (
    org_id = current_org_id()
  );
