-- Fix profiles SELECT recursion by moving visibility checks into
-- a security-definer helper that does not query public.profiles.

create or replace function public.profile_visible_without_profiles_lookup(
  p_viewer uuid,
  p_target uuid,
  p_target_org uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_viewer is not null
    and p_target is not null
    and (
      p_viewer = p_target
      or exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = p_viewer
      )
      or (
        p_target_org is not null
        and exists (
          select 1
          from public.user_org_memberships vm
          where vm.user_id = p_viewer
            and vm.org_id = p_target_org
        )
        and (
          exists (
            select 1
            from public.user_org_role_assignments ua
            join public.org_roles r
              on r.id = ua.role_id
             and r.org_id = ua.org_id
            where ua.user_id = p_viewer
              and ua.org_id = p_target_org
              and r.key = 'org_admin'
          )
          or exists (
            select 1
            from public.user_departments viewer_ud
            join public.user_departments target_ud
              on target_ud.dept_id = viewer_ud.dept_id
             and target_ud.user_id = p_target
            join public.departments d
              on d.id = viewer_ud.dept_id
             and d.org_id = p_target_org
            where viewer_ud.user_id = p_viewer
              and not d.is_archived
          )
        )
      )
    );
$$;

comment on function public.profile_visible_without_profiles_lookup(uuid, uuid, uuid) is
  'Profiles SELECT helper that avoids querying public.profiles inside policy evaluation.';

revoke all on function public.profile_visible_without_profiles_lookup(uuid, uuid, uuid) from public;
grant execute on function public.profile_visible_without_profiles_lookup(uuid, uuid, uuid) to authenticated, service_role;

drop policy if exists profiles_select_department_isolation on public.profiles;
create policy profiles_select_department_isolation
  on public.profiles
  for select
  to authenticated
  using (
    public.profile_visible_without_profiles_lookup(auth.uid(), id, org_id)
  );
