-- Phase 2: predefined role hierarchy + ranked assignment enforcement.
-- Extends existing RBAC without removing legacy role keys.

-- ---------------------------------------------------------------------------
-- 1) org_roles ranking fields
-- ---------------------------------------------------------------------------

alter table public.org_roles
  add column if not exists rank_level smallint not null default 0;

alter table public.org_roles
  add column if not exists rank_order smallint not null default 0;

alter table public.org_roles
  add column if not exists is_assignable boolean not null default true;

comment on column public.org_roles.rank_level is
  'Role seniority tier. Higher values are more senior. org_admin is a special role and enforced separately in assignment RPCs.';

comment on column public.org_roles.rank_order is
  'Ordering within a rank_level tier. Higher values are considered more senior within the same tier.';

comment on column public.org_roles.is_assignable is
  'Whether role can be assigned through standard flows. System roles remain non-deletable regardless.';

-- Ensure rank fields stay non-negative.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'org_roles_rank_level_nonnegative'
      and conrelid = 'public.org_roles'::regclass
  ) then
    alter table public.org_roles
      add constraint org_roles_rank_level_nonnegative check (rank_level >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'org_roles_rank_order_nonnegative'
      and conrelid = 'public.org_roles'::regclass
  ) then
    alter table public.org_roles
      add constraint org_roles_rank_order_nonnegative check (rank_order >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Role seed helper
-- ---------------------------------------------------------------------------

create or replace function public.seed_predefined_roles_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    return;
  end if;

  if not exists (select 1 from public.organisations o where o.id = p_org_id) then
    return;
  end if;

  -- Org admin remains a special system role and is kept separate from standard hierarchy.
  insert into public.org_roles (org_id, key, label, description, is_system, rank_level, rank_order, is_assignable)
  values
    (p_org_id, 'org_admin', 'Org admin', 'Special system role with unrestricted organisation access.', true, 99, 99, true),

    -- Executive
    (p_org_id, 'board_of_directors', 'Board of Directors', 'Executive system role.', true, 6, 1, true),
    (p_org_id, 'chairperson', 'Chairperson', 'Executive system role.', true, 6, 2, true),
    (p_org_id, 'ceo', 'CEO', 'Executive system role.', true, 6, 3, true),
    (p_org_id, 'coo', 'COO', 'Executive system role.', true, 6, 4, true),
    (p_org_id, 'cfo', 'CFO', 'Executive system role.', true, 6, 5, true),
    (p_org_id, 'cto', 'CTO', 'Executive system role.', true, 6, 6, true),
    (p_org_id, 'cmo', 'CMO', 'Executive system role.', true, 6, 7, true),
    (p_org_id, 'chro_hr_director', 'CHRO / HR Director', 'Executive system role.', true, 6, 8, true),

    -- Senior leadership
    (p_org_id, 'slt', 'SLT', 'Senior leadership system role.', true, 5, 1, true),
    (p_org_id, 'head_operations', 'Head of Operations', 'Senior leadership system role.', true, 5, 2, true),
    (p_org_id, 'head_finance', 'Head of Finance', 'Senior leadership system role.', true, 5, 3, true),
    (p_org_id, 'head_hr', 'Head of HR', 'Senior leadership system role.', true, 5, 4, true),
    (p_org_id, 'head_it', 'Head of IT', 'Senior leadership system role.', true, 5, 5, true),
    (p_org_id, 'head_sales', 'Head of Sales', 'Senior leadership system role.', true, 5, 6, true),
    (p_org_id, 'head_marketing', 'Head of Marketing', 'Senior leadership system role.', true, 5, 7, true),
    (p_org_id, 'head_product', 'Head of Product', 'Senior leadership system role.', true, 5, 8, true),

    -- Middle management
    (p_org_id, 'department_manager', 'Department Managers', 'Middle management system role.', true, 4, 1, true),
    (p_org_id, 'team_manager', 'Team Managers', 'Middle management system role.', true, 4, 2, true),
    (p_org_id, 'project_manager', 'Project Managers', 'Middle management system role.', true, 4, 3, true),
    (p_org_id, 'operations_manager', 'Operations Managers', 'Middle management system role.', true, 4, 4, true),

    -- Senior staff
    (p_org_id, 'senior_developer', 'Senior Developers', 'Senior staff system role.', true, 3, 1, true),
    (p_org_id, 'senior_analyst', 'Senior Analysts', 'Senior staff system role.', true, 3, 2, true),
    (p_org_id, 'senior_accountant', 'Senior Accountants', 'Senior staff system role.', true, 3, 3, true),
    (p_org_id, 'senior_engineer', 'Senior Engineers', 'Senior staff system role.', true, 3, 4, true),

    -- Core staff
    (p_org_id, 'developer_engineer', 'Developers / Engineers', 'Core staff system role.', true, 2, 1, true),
    (p_org_id, 'it_admin_devops_engineer', 'IT Admins / DevOps Engineers', 'Core staff system role.', true, 2, 2, true),
    (p_org_id, 'hr_officer', 'HR Officers', 'Core staff system role.', true, 2, 3, true),
    (p_org_id, 'marketing_executive', 'Marketing Executives', 'Core staff system role.', true, 2, 4, true),
    (p_org_id, 'sales_executive', 'Sales Executives', 'Core staff system role.', true, 2, 5, true),
    (p_org_id, 'finance_officer', 'Finance Officers', 'Core staff system role.', true, 2, 6, true),

    -- Junior / support
    (p_org_id, 'coordinator', 'Coordinators', 'Junior / support system role.', true, 1, 1, true),
    (p_org_id, 'assistant', 'Assistants', 'Junior / support system role.', true, 1, 2, true),
    (p_org_id, 'junior_staff', 'Junior Staff', 'Junior / support system role.', true, 1, 3, true),
    (p_org_id, 'intern_trainee', 'Interns / Trainees', 'Junior / support system role.', true, 1, 4, true),

    -- Legacy compatibility keys (kept, ranked for continuity)
    (p_org_id, 'manager', 'Manager', 'Legacy compatibility role key.', true, 4, 5, true),
    (p_org_id, 'administrator', 'Administrator', 'Legacy compatibility role key.', true, 2, 7, true),
    (p_org_id, 'duty_manager', 'Duty manager', 'Legacy compatibility role key.', true, 4, 6, true),
    (p_org_id, 'csa', 'CSA', 'Legacy compatibility role key.', true, 1, 5, true),
    (p_org_id, 'society_leader', 'Society leader', 'Legacy compatibility role key.', true, 3, 5, true)
  on conflict (org_id, key) do update
  set
    label = excluded.label,
    description = excluded.description,
    is_system = excluded.is_system,
    rank_level = excluded.rank_level,
    rank_order = excluded.rank_order,
    is_assignable = excluded.is_assignable,
    is_archived = false,
    updated_at = now();
end;
$$;

revoke all on function public.seed_predefined_roles_for_org(uuid) from public;
grant execute on function public.seed_predefined_roles_for_org(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Permission mappings for predefined roles
-- ---------------------------------------------------------------------------

create or replace function public.seed_predefined_role_permissions_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    return;
  end if;

  -- org_admin gets all non-founder permissions.
  insert into public.org_role_permissions (role_id, permission_key)
  select r.id, pc.key
  from public.org_roles r
  join public.permission_catalog pc
    on pc.is_founder_only = false
  where r.org_id = p_org_id
    and r.key = 'org_admin'
    and r.is_archived = false
  on conflict do nothing;

  -- Tier defaults for all predefined roles.
  insert into public.org_role_permissions (role_id, permission_key)
  select r.id, p.permission_key
  from public.org_roles r
  join (
    values
      -- Executive
      ('board_of_directors', 'members.view'),
      ('board_of_directors', 'members.create'),
      ('board_of_directors', 'members.invite'),
      ('board_of_directors', 'members.edit_roles'),
      ('board_of_directors', 'members.edit_status'),
      ('board_of_directors', 'roles.view'),
      ('board_of_directors', 'departments.view'),
      ('board_of_directors', 'teams.view'),
      ('board_of_directors', 'broadcasts.view'),
      ('board_of_directors', 'rota.view'),
      ('board_of_directors', 'recruitment.view'),
      ('board_of_directors', 'jobs.view'),
      ('board_of_directors', 'applications.view'),
      ('board_of_directors', 'offers.view'),
      ('board_of_directors', 'interviews.view'),
      ('board_of_directors', 'leave.view_own'),
      ('board_of_directors', 'leave.view_direct_reports'),
      ('board_of_directors', 'hr.view_records'),
      ('board_of_directors', 'performance.view_reports'),
      ('board_of_directors', 'performance.view_own'),

      ('chairperson', 'members.view'),
      ('chairperson', 'members.create'),
      ('chairperson', 'members.invite'),
      ('chairperson', 'members.edit_roles'),
      ('chairperson', 'members.edit_status'),
      ('chairperson', 'roles.view'),
      ('chairperson', 'departments.view'),
      ('chairperson', 'teams.view'),
      ('chairperson', 'broadcasts.view'),
      ('chairperson', 'rota.view'),
      ('chairperson', 'recruitment.view'),
      ('chairperson', 'jobs.view'),
      ('chairperson', 'applications.view'),
      ('chairperson', 'offers.view'),
      ('chairperson', 'interviews.view'),
      ('chairperson', 'leave.view_own'),
      ('chairperson', 'leave.view_direct_reports'),
      ('chairperson', 'hr.view_records'),
      ('chairperson', 'performance.view_reports'),
      ('chairperson', 'performance.view_own'),

      ('ceo', 'members.view'),
      ('ceo', 'members.create'),
      ('ceo', 'members.invite'),
      ('ceo', 'members.edit_roles'),
      ('ceo', 'members.edit_status'),
      ('ceo', 'roles.view'),
      ('ceo', 'roles.manage'),
      ('ceo', 'departments.manage'),
      ('ceo', 'teams.manage'),
      ('ceo', 'broadcasts.view'),
      ('ceo', 'broadcasts.compose'),
      ('ceo', 'broadcasts.publish'),
      ('ceo', 'broadcasts.approve'),
      ('ceo', 'rota.view'),
      ('ceo', 'rota.manage'),
      ('ceo', 'recruitment.manage'),
      ('ceo', 'jobs.manage'),
      ('ceo', 'applications.manage'),
      ('ceo', 'offers.manage'),
      ('ceo', 'interviews.manage'),
      ('ceo', 'leave.manage_org'),
      ('ceo', 'hr.manage_records'),
      ('ceo', 'onboarding.manage_templates'),
      ('ceo', 'onboarding.manage_runs'),
      ('ceo', 'performance.manage_cycles'),
      ('ceo', 'performance.view_reports'),
      ('ceo', 'integrations.manage'),

      ('coo', 'members.view'),
      ('coo', 'members.invite'),
      ('coo', 'departments.manage'),
      ('coo', 'teams.manage'),
      ('coo', 'broadcasts.compose'),
      ('coo', 'broadcasts.publish'),
      ('coo', 'rota.manage'),
      ('coo', 'recruitment.manage'),
      ('coo', 'jobs.manage'),
      ('coo', 'applications.manage'),
      ('coo', 'interviews.manage'),
      ('coo', 'leave.manage_org'),
      ('coo', 'hr.manage_records'),
      ('coo', 'onboarding.manage_runs'),
      ('coo', 'performance.view_reports'),

      ('cfo', 'members.view'),
      ('cfo', 'departments.view'),
      ('cfo', 'teams.view'),
      ('cfo', 'broadcasts.view'),
      ('cfo', 'recruitment.view'),
      ('cfo', 'jobs.view'),
      ('cfo', 'applications.view'),
      ('cfo', 'offers.manage'),
      ('cfo', 'leave.view_direct_reports'),
      ('cfo', 'hr.view_records'),
      ('cfo', 'performance.view_reports'),

      ('cto', 'members.view'),
      ('cto', 'departments.view'),
      ('cto', 'teams.manage'),
      ('cto', 'broadcasts.view'),
      ('cto', 'integrations.manage'),
      ('cto', 'recruitment.view'),
      ('cto', 'jobs.view'),
      ('cto', 'applications.view'),
      ('cto', 'interviews.view'),
      ('cto', 'performance.view_reports'),

      ('cmo', 'members.view'),
      ('cmo', 'departments.view'),
      ('cmo', 'teams.view'),
      ('cmo', 'broadcasts.compose'),
      ('cmo', 'broadcasts.publish'),
      ('cmo', 'jobs.view'),
      ('cmo', 'applications.view'),
      ('cmo', 'performance.view_reports'),

      ('chro_hr_director', 'members.view'),
      ('chro_hr_director', 'members.invite'),
      ('chro_hr_director', 'members.edit_roles'),
      ('chro_hr_director', 'members.edit_status'),
      ('chro_hr_director', 'approvals.members.review'),
      ('chro_hr_director', 'roles.view'),
      ('chro_hr_director', 'departments.manage'),
      ('chro_hr_director', 'teams.manage'),
      ('chro_hr_director', 'recruitment.manage'),
      ('chro_hr_director', 'jobs.manage'),
      ('chro_hr_director', 'applications.manage'),
      ('chro_hr_director', 'offers.manage'),
      ('chro_hr_director', 'interviews.manage'),
      ('chro_hr_director', 'leave.manage_org'),
      ('chro_hr_director', 'hr.manage_records'),
      ('chro_hr_director', 'onboarding.manage_templates'),
      ('chro_hr_director', 'onboarding.manage_runs'),
      ('chro_hr_director', 'performance.manage_cycles'),
      ('chro_hr_director', 'performance.view_reports'),
      ('chro_hr_director', 'performance.review_direct_reports'),

      -- Senior leadership
      ('slt', 'members.view'),
      ('slt', 'members.invite'),
      ('slt', 'departments.manage'),
      ('slt', 'teams.manage'),
      ('slt', 'broadcasts.view'),
      ('slt', 'broadcasts.compose'),
      ('slt', 'broadcasts.publish'),
      ('slt', 'rota.manage'),
      ('slt', 'recruitment.manage'),
      ('slt', 'jobs.manage'),
      ('slt', 'applications.manage'),
      ('slt', 'offers.manage'),
      ('slt', 'interviews.manage'),
      ('slt', 'leave.approve_direct_reports'),
      ('slt', 'hr.view_records'),
      ('slt', 'performance.review_direct_reports'),
      ('slt', 'performance.view_reports'),
      ('slt', 'onboarding.manage_runs'),

      ('head_operations', 'members.view'),
      ('head_operations', 'departments.view'),
      ('head_operations', 'teams.manage'),
      ('head_operations', 'broadcasts.compose'),
      ('head_operations', 'broadcasts.publish'),
      ('head_operations', 'rota.manage'),
      ('head_operations', 'leave.approve_direct_reports'),
      ('head_operations', 'performance.review_direct_reports'),

      ('head_finance', 'members.view'),
      ('head_finance', 'departments.view'),
      ('head_finance', 'teams.view'),
      ('head_finance', 'offers.view'),
      ('head_finance', 'hr.view_records'),
      ('head_finance', 'performance.view_reports'),

      ('head_hr', 'members.view'),
      ('head_hr', 'members.invite'),
      ('head_hr', 'approvals.members.review'),
      ('head_hr', 'departments.manage'),
      ('head_hr', 'teams.manage'),
      ('head_hr', 'recruitment.manage'),
      ('head_hr', 'jobs.manage'),
      ('head_hr', 'applications.manage'),
      ('head_hr', 'offers.manage'),
      ('head_hr', 'interviews.manage'),
      ('head_hr', 'leave.manage_org'),
      ('head_hr', 'hr.manage_records'),
      ('head_hr', 'onboarding.manage_runs'),
      ('head_hr', 'performance.manage_cycles'),
      ('head_hr', 'performance.view_reports'),

      ('head_it', 'members.view'),
      ('head_it', 'departments.view'),
      ('head_it', 'teams.manage'),
      ('head_it', 'integrations.manage'),
      ('head_it', 'performance.review_direct_reports'),

      ('head_sales', 'members.view'),
      ('head_sales', 'departments.view'),
      ('head_sales', 'teams.manage'),
      ('head_sales', 'broadcasts.compose'),
      ('head_sales', 'jobs.view'),
      ('head_sales', 'applications.view'),
      ('head_sales', 'interviews.view'),
      ('head_sales', 'performance.review_direct_reports'),

      ('head_marketing', 'members.view'),
      ('head_marketing', 'departments.view'),
      ('head_marketing', 'teams.view'),
      ('head_marketing', 'broadcasts.compose'),
      ('head_marketing', 'broadcasts.publish'),
      ('head_marketing', 'jobs.view'),
      ('head_marketing', 'performance.review_direct_reports'),

      ('head_product', 'members.view'),
      ('head_product', 'departments.view'),
      ('head_product', 'teams.manage'),
      ('head_product', 'jobs.view'),
      ('head_product', 'applications.view'),
      ('head_product', 'interviews.view'),
      ('head_product', 'performance.review_direct_reports'),

      -- Middle management
      ('department_manager', 'members.view'),
      ('department_manager', 'approvals.members.review'),
      ('department_manager', 'departments.view'),
      ('department_manager', 'teams.manage'),
      ('department_manager', 'broadcasts.compose'),
      ('department_manager', 'broadcasts.publish'),
      ('department_manager', 'rota.view'),
      ('department_manager', 'rota.manage'),
      ('department_manager', 'recruitment.view'),
      ('department_manager', 'jobs.view'),
      ('department_manager', 'applications.view'),
      ('department_manager', 'interviews.view'),
      ('department_manager', 'leave.view_direct_reports'),
      ('department_manager', 'leave.approve_direct_reports'),
      ('department_manager', 'hr.view_records'),
      ('department_manager', 'performance.review_direct_reports'),
      ('department_manager', 'performance.view_own'),
      ('department_manager', 'onboarding.manage_runs'),

      ('team_manager', 'members.view'),
      ('team_manager', 'departments.view'),
      ('team_manager', 'teams.view'),
      ('team_manager', 'broadcasts.compose'),
      ('team_manager', 'rota.view'),
      ('team_manager', 'rota.edit'),
      ('team_manager', 'leave.view_direct_reports'),
      ('team_manager', 'leave.approve_direct_reports'),
      ('team_manager', 'performance.review_direct_reports'),
      ('team_manager', 'performance.view_own'),
      ('team_manager', 'onboarding.manage_runs'),

      ('project_manager', 'members.view'),
      ('project_manager', 'teams.view'),
      ('project_manager', 'broadcasts.compose'),
      ('project_manager', 'jobs.view'),
      ('project_manager', 'applications.view'),
      ('project_manager', 'interviews.view'),
      ('project_manager', 'leave.view_direct_reports'),
      ('project_manager', 'leave.approve_direct_reports'),
      ('project_manager', 'performance.review_direct_reports'),
      ('project_manager', 'performance.view_own'),

      ('operations_manager', 'members.view'),
      ('operations_manager', 'departments.view'),
      ('operations_manager', 'teams.view'),
      ('operations_manager', 'broadcasts.compose'),
      ('operations_manager', 'broadcasts.publish'),
      ('operations_manager', 'rota.manage'),
      ('operations_manager', 'leave.view_direct_reports'),
      ('operations_manager', 'leave.approve_direct_reports'),
      ('operations_manager', 'performance.review_direct_reports'),
      ('operations_manager', 'performance.view_own'),

      -- Senior staff
      ('senior_developer', 'members.view'),
      ('senior_developer', 'teams.view'),
      ('senior_developer', 'broadcasts.view'),
      ('senior_developer', 'rota.view'),
      ('senior_developer', 'jobs.view'),
      ('senior_developer', 'applications.view'),
      ('senior_developer', 'interviews.view'),
      ('senior_developer', 'leave.submit'),
      ('senior_developer', 'leave.view_own'),
      ('senior_developer', 'onboarding.complete_own_tasks'),
      ('senior_developer', 'performance.view_own'),

      ('senior_analyst', 'members.view'),
      ('senior_analyst', 'teams.view'),
      ('senior_analyst', 'broadcasts.view'),
      ('senior_analyst', 'rota.view'),
      ('senior_analyst', 'jobs.view'),
      ('senior_analyst', 'applications.view'),
      ('senior_analyst', 'leave.submit'),
      ('senior_analyst', 'leave.view_own'),
      ('senior_analyst', 'onboarding.complete_own_tasks'),
      ('senior_analyst', 'performance.view_own'),

      ('senior_accountant', 'members.view'),
      ('senior_accountant', 'departments.view'),
      ('senior_accountant', 'teams.view'),
      ('senior_accountant', 'offers.view'),
      ('senior_accountant', 'broadcasts.view'),
      ('senior_accountant', 'leave.submit'),
      ('senior_accountant', 'leave.view_own'),
      ('senior_accountant', 'onboarding.complete_own_tasks'),
      ('senior_accountant', 'performance.view_own'),

      ('senior_engineer', 'members.view'),
      ('senior_engineer', 'teams.view'),
      ('senior_engineer', 'broadcasts.view'),
      ('senior_engineer', 'rota.view'),
      ('senior_engineer', 'jobs.view'),
      ('senior_engineer', 'applications.view'),
      ('senior_engineer', 'leave.submit'),
      ('senior_engineer', 'leave.view_own'),
      ('senior_engineer', 'onboarding.complete_own_tasks'),
      ('senior_engineer', 'performance.view_own'),

      -- Core staff
      ('developer_engineer', 'broadcasts.view'),
      ('developer_engineer', 'rota.view'),
      ('developer_engineer', 'jobs.view'),
      ('developer_engineer', 'leave.submit'),
      ('developer_engineer', 'leave.view_own'),
      ('developer_engineer', 'onboarding.complete_own_tasks'),
      ('developer_engineer', 'performance.view_own'),

      ('it_admin_devops_engineer', 'broadcasts.view'),
      ('it_admin_devops_engineer', 'rota.view'),
      ('it_admin_devops_engineer', 'integrations.view'),
      ('it_admin_devops_engineer', 'leave.submit'),
      ('it_admin_devops_engineer', 'leave.view_own'),
      ('it_admin_devops_engineer', 'onboarding.complete_own_tasks'),
      ('it_admin_devops_engineer', 'performance.view_own'),

      ('hr_officer', 'members.view'),
      ('hr_officer', 'approvals.members.review'),
      ('hr_officer', 'departments.view'),
      ('hr_officer', 'teams.view'),
      ('hr_officer', 'recruitment.view'),
      ('hr_officer', 'jobs.view'),
      ('hr_officer', 'applications.view'),
      ('hr_officer', 'interviews.view'),
      ('hr_officer', 'leave.submit'),
      ('hr_officer', 'leave.view_own'),
      ('hr_officer', 'hr.view_records'),
      ('hr_officer', 'onboarding.manage_runs'),
      ('hr_officer', 'performance.view_own'),

      ('marketing_executive', 'broadcasts.view'),
      ('marketing_executive', 'broadcasts.compose'),
      ('marketing_executive', 'jobs.view'),
      ('marketing_executive', 'leave.submit'),
      ('marketing_executive', 'leave.view_own'),
      ('marketing_executive', 'onboarding.complete_own_tasks'),
      ('marketing_executive', 'performance.view_own'),

      ('sales_executive', 'broadcasts.view'),
      ('sales_executive', 'jobs.view'),
      ('sales_executive', 'applications.view'),
      ('sales_executive', 'interviews.view'),
      ('sales_executive', 'leave.submit'),
      ('sales_executive', 'leave.view_own'),
      ('sales_executive', 'onboarding.complete_own_tasks'),
      ('sales_executive', 'performance.view_own'),

      ('finance_officer', 'broadcasts.view'),
      ('finance_officer', 'offers.view'),
      ('finance_officer', 'leave.submit'),
      ('finance_officer', 'leave.view_own'),
      ('finance_officer', 'onboarding.complete_own_tasks'),
      ('finance_officer', 'performance.view_own'),

      -- Junior / support
      ('coordinator', 'members.view'),
      ('coordinator', 'broadcasts.view'),
      ('coordinator', 'broadcasts.compose'),
      ('coordinator', 'rota.view'),
      ('coordinator', 'leave.submit'),
      ('coordinator', 'leave.view_own'),
      ('coordinator', 'onboarding.complete_own_tasks'),
      ('coordinator', 'performance.view_own'),

      ('assistant', 'broadcasts.view'),
      ('assistant', 'rota.view'),
      ('assistant', 'leave.submit'),
      ('assistant', 'leave.view_own'),
      ('assistant', 'onboarding.complete_own_tasks'),
      ('assistant', 'performance.view_own'),

      ('junior_staff', 'broadcasts.view'),
      ('junior_staff', 'rota.view'),
      ('junior_staff', 'leave.submit'),
      ('junior_staff', 'leave.view_own'),
      ('junior_staff', 'onboarding.complete_own_tasks'),
      ('junior_staff', 'performance.view_own'),

      ('intern_trainee', 'broadcasts.view'),
      ('intern_trainee', 'leave.submit'),
      ('intern_trainee', 'leave.view_own'),
      ('intern_trainee', 'onboarding.complete_own_tasks'),
      ('intern_trainee', 'performance.view_own')
  ) as p(role_key, permission_key)
    on p.role_key = r.key
  where r.org_id = p_org_id
    and r.is_archived = false
    and exists (select 1 from public.permission_catalog pc where pc.key = p.permission_key)
  on conflict do nothing;
end;
$$;

revoke all on function public.seed_predefined_role_permissions_for_org(uuid) from public;
grant execute on function public.seed_predefined_role_permissions_for_org(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Non-deletable system roles
-- ---------------------------------------------------------------------------

create or replace function public.org_roles_block_system_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.is_system then
    raise exception 'System roles are non-deletable';
  end if;
  return old;
end;
$$;

drop trigger if exists org_roles_block_system_delete_trg on public.org_roles;
create trigger org_roles_block_system_delete_trg
before delete on public.org_roles
for each row
execute procedure public.org_roles_block_system_delete();

-- ---------------------------------------------------------------------------
-- 5) Assignment guard helpers
-- ---------------------------------------------------------------------------

create or replace function public.actor_can_assign_role(
  p_actor_user_id uuid,
  p_org_id uuid,
  p_target_role_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_is_founder boolean := false;
  v_actor_is_org_admin boolean := false;
  v_actor_max_rank_level smallint := null;
  v_actor_max_rank_order smallint := null;
  v_target_key text;
  v_target_rank_level smallint;
  v_target_rank_order smallint;
begin
  if p_actor_user_id is null or p_org_id is null or p_target_role_id is null then
    return false;
  end if;

  select public.is_platform_founder(p_actor_user_id) into v_actor_is_founder;
  if v_actor_is_founder then
    return true;
  end if;

  select r.key, r.rank_level, r.rank_order
  into v_target_key, v_target_rank_level, v_target_rank_order
  from public.org_roles r
  where r.id = p_target_role_id
    and r.org_id = p_org_id
    and r.is_archived = false
  limit 1;

  if v_target_key is null then
    return false;
  end if;

  -- Special path: org_admin can only be assigned by org_admin (or founder above).
  if v_target_key = 'org_admin' then
    select exists (
      select 1
      from public.user_org_role_assignments a
      join public.org_roles r on r.id = a.role_id
      where a.user_id = p_actor_user_id
        and a.org_id = p_org_id
        and r.org_id = p_org_id
        and r.is_archived = false
        and r.key = 'org_admin'
    ) into v_actor_is_org_admin;
    return v_actor_is_org_admin;
  end if;

  select
    max(r.rank_level),
    max(r.rank_order) filter (where r.rank_level = (select max(r2.rank_level)
                                                   from public.user_org_role_assignments a2
                                                   join public.org_roles r2 on r2.id = a2.role_id
                                                   where a2.user_id = p_actor_user_id
                                                     and a2.org_id = p_org_id
                                                     and r2.org_id = p_org_id
                                                     and r2.is_archived = false))
  into v_actor_max_rank_level, v_actor_max_rank_order
  from public.user_org_role_assignments a
  join public.org_roles r on r.id = a.role_id
  where a.user_id = p_actor_user_id
    and a.org_id = p_org_id
    and r.org_id = p_org_id
    and r.is_archived = false
    and r.key <> 'org_admin';

  if v_actor_max_rank_level is null then
    return false;
  end if;

  if v_actor_max_rank_level > v_target_rank_level then
    return true;
  end if;

  if v_actor_max_rank_level = v_target_rank_level
     and coalesce(v_actor_max_rank_order, 0) >= coalesce(v_target_rank_order, 0) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.actor_can_assign_role(uuid, uuid, uuid) from public;
grant execute on function public.actor_can_assign_role(uuid, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Enforce rank ceiling in role assignment RPCs
-- ---------------------------------------------------------------------------

create or replace function public.assign_user_org_role(
  p_org_id uuid,
  p_user_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), p_org_id, 'members.edit_roles', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_org_memberships m
    where m.user_id = p_user_id and m.org_id = p_org_id
  ) then
    raise exception 'target user is not a member of this organisation';
  end if;

  if not exists (
    select 1 from public.org_roles r
    where r.id = p_role_id and r.org_id = p_org_id and r.is_archived = false
  ) then
    raise exception 'invalid role';
  end if;

  if not public.actor_can_assign_role(auth.uid(), p_org_id, p_role_id) then
    raise exception 'cannot assign a role above your own level' using errcode = '42501';
  end if;

  delete from public.user_org_role_assignments a
  where a.user_id = p_user_id and a.org_id = p_org_id;

  insert into public.user_org_role_assignments (user_id, org_id, role_id, assigned_by)
  values (p_user_id, p_org_id, p_role_id, auth.uid());

  insert into public.audit_role_events (org_id, actor_user_id, target_user_id, event_type, payload)
  values (p_org_id, auth.uid(), p_user_id, 'role.assigned', jsonb_build_object('role_id', p_role_id));
end;
$$;

create or replace function public.approve_pending_profile(
  p_target uuid,
  p_approve boolean,
  p_rejection_note text default null,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org_id uuid;
  v_trim_role text := nullif(trim(p_role), '');
  v_target_role_id uuid;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org_id
  from public.profiles p
  where p.id = p_target and p.status = 'pending';
  if not found then
    raise exception 'profile not found or not pending';
  end if;

  if not public.has_permission(v_viewer, v_org_id, 'approvals.members.review', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not p_approve then
    update public.profiles
    set
      status = 'inactive',
      reviewed_at = now(),
      reviewed_by = v_viewer,
      rejection_note = nullif(trim(p_rejection_note), '')
    where id = p_target
      and status = 'pending';
    return;
  end if;

  if v_trim_role is null then
    raise exception 'Choose a role before approving this member';
  end if;

  select r.id
  into v_target_role_id
  from public.org_roles r
  where r.org_id = v_org_id
    and r.key = v_trim_role
    and r.is_archived = false
  limit 1;

  if v_target_role_id is null then
    raise exception 'Invalid role for this organisation';
  end if;

  if not public.actor_can_assign_role(v_viewer, v_org_id, v_target_role_id) then
    raise exception 'cannot assign a role above your own level' using errcode = '42501';
  end if;

  update public.profiles
  set
    status = 'active',
    role = v_trim_role,
    reviewed_at = now(),
    reviewed_by = v_viewer,
    rejection_note = null
  where id = p_target
    and status = 'pending';

  insert into public.user_org_role_assignments (user_id, org_id, role_id, assigned_by)
  values (p_target, v_org_id, v_target_role_id, v_viewer)
  on conflict (user_id, org_id, role_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Bootstrap parity for new and existing orgs
-- ---------------------------------------------------------------------------

create or replace function public.ensure_org_rbac_bootstrap(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org_id is null then
    return;
  end if;

  if not exists (select 1 from public.organisations o where o.id = p_org_id) then
    return;
  end if;

  perform public.seed_predefined_roles_for_org(p_org_id);
  perform public.seed_predefined_role_permissions_for_org(p_org_id);
end;
$$;

-- Backfill all existing orgs with ranked predefined system roles + permission mappings.
select public.ensure_org_rbac_bootstrap(o.id)
from public.organisations o;

