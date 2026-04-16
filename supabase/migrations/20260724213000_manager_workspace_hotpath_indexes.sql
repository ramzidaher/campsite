-- Hot-path indexes for manager workspace + pending approvals scoped lookups.
-- Targets query shapes used in:
-- - loadWorkspaceDepartmentIds
-- - loadPendingApprovalRows
-- - manager dashboard/team/department pages

create index if not exists dept_managers_user_id_dept_id_idx
  on public.dept_managers (user_id, dept_id);

create index if not exists user_departments_user_id_dept_id_idx
  on public.user_departments (user_id, dept_id);

create index if not exists user_departments_dept_id_user_id_idx
  on public.user_departments (dept_id, user_id);

create index if not exists profiles_org_pending_created_idx
  on public.profiles (org_id, status, created_at desc)
  where status = 'pending';

create index if not exists employee_case_record_events_org_case_created_idx
  on public.employee_case_record_events (org_id, case_id, created_at desc);

create index if not exists employee_medical_note_events_org_note_created_idx
  on public.employee_medical_note_events (org_id, medical_note_id, created_at desc);

