-- CHRO / HR director should complete their own review on /performance like other staff roles.
-- Phase-2 predefined role seed granted cycle admin + org reports but omitted performance.view_own.

insert into public.org_role_permissions (role_id, permission_key)
select r.id, 'performance.view_own'
from public.org_roles r
where r.key = 'chro_hr_director'
  and r.is_archived = false
  and not exists (
    select 1
    from public.org_role_permissions p
    where p.role_id = r.id
      and p.permission_key = 'performance.view_own'
  );
