-- Backfill one_on_one.* into org_role_permissions for all existing org_roles (legacy keys).

insert into public.org_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.org_roles r
join (
  values
    ('org_admin', 'one_on_one.view_own'),
    ('org_admin', 'one_on_one.manage_direct_reports'),
    ('org_admin', 'one_on_one.manage_templates'),
    ('manager', 'one_on_one.view_own'),
    ('manager', 'one_on_one.manage_direct_reports'),
    ('coordinator', 'one_on_one.view_own'),
    ('coordinator', 'one_on_one.manage_direct_reports'),
    ('administrator', 'one_on_one.view_own'),
    ('duty_manager', 'one_on_one.view_own'),
    ('duty_manager', 'one_on_one.manage_direct_reports'),
    ('csa', 'one_on_one.view_own'),
    ('society_leader', 'one_on_one.view_own')
) as p(role_key, permission_key) on p.role_key = r.key
where r.is_archived = false
on conflict do nothing;
