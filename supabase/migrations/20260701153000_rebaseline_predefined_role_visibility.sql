-- Rebaseline predefined role visibility to least-privilege.
-- Keep org-wide people visibility (`members.view`) and HR record visibility for management tiers only.
-- Future-proofing is enforced in 20260701154000_guard_predefined_role_visibility_seed.sql.

with restricted_roles as (
  select unnest(array[
    'senior_developer',
    'senior_analyst',
    'senior_accountant',
    'senior_engineer',
    'developer_engineer',
    'it_admin_devops_engineer',
    'marketing_executive',
    'sales_executive',
    'finance_officer',
    'coordinator',
    'assistant',
    'junior_staff',
    'intern_trainee'
  ]) as key
)
delete from public.org_role_permissions rp
using public.org_roles r, restricted_roles rr
where rp.role_id = r.id
  and r.key = rr.key
  and rp.permission_key in ('members.view', 'hr.view_records');
