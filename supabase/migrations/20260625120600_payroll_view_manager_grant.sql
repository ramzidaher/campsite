-- Allow managers to view wagesheets (team payroll lines are still scoped in UI by filters).

insert into public.org_role_permissions (role_id, permission_key)
select r.id, 'payroll.view'
from public.org_roles r
where r.key = 'manager'
  and r.is_archived = false
on conflict do nothing;
