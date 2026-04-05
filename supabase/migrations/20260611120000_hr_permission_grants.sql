-- Backfill permission_catalog and org_role_permissions for all HR/leave/onboarding/
-- performance permissions added since the RBAC rebuild.
--
-- Without this:
--   • new permissions are invisible in Admin → Roles & permissions UI
--   • org_admin role can't access HR records, leave admin, etc.
--   • managers can't approve leave or complete performance reviews
--   • employees can't see their own leave, onboarding, or reviews
--
-- Strategy:
--   org_admin  → full access to everything
--   manager    → leave approval for direct reports, performance review of reports
--   coordinator/administrator/duty_manager/csa/society_leader
--              → employee-level only (view own, submit, complete own tasks)
--   all roles  → leave.view_own, leave.submit, performance.view_own,
--                onboarding.complete_own_tasks

-- ---------------------------------------------------------------------------
-- 1. Upsert all missing permissions into permission_catalog
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  -- Leave (completing the set; leave.view_own already exists from earlier migration)
  ('leave.submit',                 'Submit leave',                      'Submit annual leave, TOIL, and sickness absences.',                                  false),
  ('leave.view_own',               'View own leave',                    'View own leave balances, requests, and sickness absence score.',                     false),
  ('leave.view_direct_reports',    'View team leave',                   'View leave and sickness records for direct reports.',                                false),
  ('leave.approve_direct_reports', 'Approve direct reports leave',      'Approve or reject leave requests from employees who report to you.',                 false),
  ('leave.manage_org',             'Manage organisation leave',         'Set allowances, org leave settings, approve any leave request.',                     false),
  -- HR records
  ('hr.view_records',              'View HR records',                   'View employee HR files including contract details and employment dates.',             false),
  ('hr.manage_records',            'Manage HR records',                 'Create and edit employee HR records, contract type, salary band, employment dates.', false),
  -- Onboarding
  ('onboarding.manage_templates',  'Manage onboarding templates',       'Create and edit reusable onboarding checklist templates.',                           false),
  ('onboarding.manage_runs',       'Manage onboarding runs',            'Start, view, and manage active employee onboarding runs.',                          false),
  ('onboarding.complete_own_tasks','Complete own onboarding tasks',     'Tick off tasks assigned to you in your own onboarding checklist.',                  false),
  -- Performance reviews
  ('performance.manage_cycles',    'Manage review cycles',              'Create and manage performance review cycles, enroll employees.',                     false),
  ('performance.view_reports',     'View all reviews',                  'View all performance reviews and ratings across the organisation.',                  false),
  ('performance.review_direct_reports', 'Review direct reports',        'Submit manager assessments for employees who report to you.',                        false),
  ('performance.view_own',         'View own reviews',                  'View and complete your own performance review self-assessment.',                     false)
on conflict (key) do update
  set label       = excluded.label,
      description = excluded.description;

-- ---------------------------------------------------------------------------
-- 2. Grant permissions to org_role_permissions for all existing orgs
--    Uses the same pattern as the RBAC rebuild: join on role key.
-- ---------------------------------------------------------------------------

insert into public.org_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.org_roles r
join (
  values
    -- ── org_admin: full HR suite ──────────────────────────────────────────
    ('org_admin', 'leave.submit'),
    ('org_admin', 'leave.view_own'),
    ('org_admin', 'leave.view_direct_reports'),
    ('org_admin', 'leave.approve_direct_reports'),
    ('org_admin', 'leave.manage_org'),
    ('org_admin', 'hr.view_records'),
    ('org_admin', 'hr.manage_records'),
    ('org_admin', 'onboarding.manage_templates'),
    ('org_admin', 'onboarding.manage_runs'),
    ('org_admin', 'onboarding.complete_own_tasks'),
    ('org_admin', 'performance.manage_cycles'),
    ('org_admin', 'performance.view_reports'),
    ('org_admin', 'performance.review_direct_reports'),
    ('org_admin', 'performance.view_own'),

    -- ── manager: approve leave + review direct reports ────────────────────
    ('manager', 'leave.submit'),
    ('manager', 'leave.view_own'),
    ('manager', 'leave.view_direct_reports'),
    ('manager', 'leave.approve_direct_reports'),
    ('manager', 'onboarding.complete_own_tasks'),
    ('manager', 'performance.view_own'),
    ('manager', 'performance.review_direct_reports'),

    -- ── coordinator: same as manager for HR purposes ──────────────────────
    ('coordinator', 'leave.submit'),
    ('coordinator', 'leave.view_own'),
    ('coordinator', 'leave.view_direct_reports'),
    ('coordinator', 'leave.approve_direct_reports'),
    ('coordinator', 'onboarding.complete_own_tasks'),
    ('coordinator', 'performance.view_own'),
    ('coordinator', 'performance.review_direct_reports'),

    -- ── administrator: employee-level ─────────────────────────────────────
    ('administrator', 'leave.submit'),
    ('administrator', 'leave.view_own'),
    ('administrator', 'onboarding.complete_own_tasks'),
    ('administrator', 'performance.view_own'),

    -- ── duty_manager: employee-level ──────────────────────────────────────
    ('duty_manager', 'leave.submit'),
    ('duty_manager', 'leave.view_own'),
    ('duty_manager', 'onboarding.complete_own_tasks'),
    ('duty_manager', 'performance.view_own'),

    -- ── csa: employee-level ───────────────────────────────────────────────
    ('csa', 'leave.submit'),
    ('csa', 'leave.view_own'),
    ('csa', 'onboarding.complete_own_tasks'),
    ('csa', 'performance.view_own'),

    -- ── society_leader: employee-level ────────────────────────────────────
    ('society_leader', 'leave.submit'),
    ('society_leader', 'leave.view_own'),
    ('society_leader', 'onboarding.complete_own_tasks'),
    ('society_leader', 'performance.view_own')

) as p(role_key, permission_key)
  on p.role_key = r.key
  and r.is_archived = false
on conflict do nothing;
