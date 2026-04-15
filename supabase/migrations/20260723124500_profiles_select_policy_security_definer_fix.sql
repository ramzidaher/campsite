-- Fix recursive profiles RLS by evaluating viewer visibility in a SECURITY DEFINER
-- helper that does not depend on RLS-evaluated policies for helper tables.

create or replace function public.can_view_profile_row(
  p_viewer_user_id uuid,
  p_target_user_id uuid,
  p_target_org_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_viewer_user_id is not null
    and p_target_user_id is not null
    and p_target_org_id is not null
    and (
      p_viewer_user_id = p_target_user_id
      or public.is_platform_founder(p_viewer_user_id)
      or (
        exists (
          select 1
          from public.user_org_memberships vm
          where vm.user_id = p_viewer_user_id
            and vm.org_id = p_target_org_id
        )
        and (
          exists (
            select 1
            from public.user_org_role_assignments ua
            join public.org_roles r
              on r.id = ua.role_id
             and r.org_id = ua.org_id
            where ua.user_id = p_viewer_user_id
              and ua.org_id = p_target_org_id
              and r.key = 'org_admin'
          )
          or exists (
            select 1
            from public.user_departments viewer_ud
            join public.user_departments target_ud
              on target_ud.dept_id = viewer_ud.dept_id
             and target_ud.user_id = p_target_user_id
            join public.departments d
              on d.id = viewer_ud.dept_id
             and d.org_id = p_target_org_id
            where viewer_ud.user_id = p_viewer_user_id
              and not d.is_archived
          )
        )
      )
    );
$$;

drop policy if exists profiles_select_department_isolation on public.profiles;

create policy profiles_select_department_isolation
  on public.profiles
  for select
  to authenticated
  using (
    public.can_view_profile_row((select auth.uid()), profiles.id, profiles.org_id)
  );
