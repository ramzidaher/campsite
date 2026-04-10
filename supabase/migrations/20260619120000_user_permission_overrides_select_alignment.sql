-- Align user_permission_overrides read visibility with manage semantics.
-- If an actor can manage overrides for a target report, they must also be able to read
-- those rows; otherwise the UI can incorrectly show "None".

drop policy if exists user_permission_overrides_select on public.user_permission_overrides;

create policy user_permission_overrides_select on public.user_permission_overrides
for select to authenticated
using (
  org_id = public.current_org_id()
  and (
    user_id = auth.uid()
    or public.is_effective_org_admin(auth.uid(), org_id)
    or public.is_reports_descendant_in_org(org_id, auth.uid(), user_id)
    or public.profile_visible_under_department_isolation(auth.uid(), user_id)
  )
);
