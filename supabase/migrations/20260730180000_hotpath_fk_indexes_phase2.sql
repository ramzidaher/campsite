-- Phase 2 FK-leading indexes from db_fk_missing_index_audit.
-- Conservative batch: leave/recruitment/payroll/employee-HR paths only.

-- Leave + timesheet workflow
create index if not exists leave_requests_org_id_idx
  on public.leave_requests (org_id);

create index if not exists leave_requests_decided_by_idx
  on public.leave_requests (decided_by);

create index if not exists leave_notifications_leave_request_id_idx
  on public.leave_notifications (leave_request_id);

create index if not exists leave_notifications_recipient_id_idx
  on public.leave_notifications (recipient_id);

create index if not exists leave_finance_notifications_leave_request_id_idx
  on public.leave_finance_notifications (leave_request_id);

create index if not exists leave_finance_notifications_recipient_id_idx
  on public.leave_finance_notifications (recipient_id);

create index if not exists leave_finance_notifications_subject_user_id_idx
  on public.leave_finance_notifications (subject_user_id);

create index if not exists leave_encashment_requests_org_id_idx
  on public.leave_encashment_requests (org_id);

create index if not exists leave_encashment_requests_requester_id_idx
  on public.leave_encashment_requests (requester_id);

create index if not exists leave_carryover_requests_org_id_idx
  on public.leave_carryover_requests (org_id);

create index if not exists weekly_timesheets_org_id_idx
  on public.weekly_timesheets (org_id);

create index if not exists weekly_timesheets_submitted_by_idx
  on public.weekly_timesheets (submitted_by);

-- Recruitment and applications
create index if not exists job_applications_org_id_idx
  on public.job_applications (org_id);

create index if not exists job_application_messages_job_application_id_idx
  on public.job_application_messages (job_application_id);

create index if not exists job_application_messages_org_id_idx
  on public.job_application_messages (org_id);

create index if not exists job_application_notes_job_application_id_idx
  on public.job_application_notes (job_application_id);

create index if not exists job_application_notes_org_id_idx
  on public.job_application_notes (org_id);

create index if not exists recruitment_requests_org_id_idx
  on public.recruitment_requests (org_id);

create index if not exists recruitment_request_status_events_request_id_idx
  on public.recruitment_request_status_events (request_id);

create index if not exists recruitment_request_status_events_org_id_idx
  on public.recruitment_request_status_events (org_id);

create index if not exists recruitment_notifications_request_id_idx
  on public.recruitment_notifications (request_id);

-- Payroll workflow
create index if not exists payroll_manual_adjustments_org_id_idx
  on public.payroll_manual_adjustments (org_id);

create index if not exists payroll_manual_adjustments_requested_by_idx
  on public.payroll_manual_adjustments (requested_by);

create index if not exists payroll_wagesheet_reviews_org_id_idx
  on public.payroll_wagesheet_reviews (org_id);

create index if not exists payroll_wagesheet_reviews_manager_approved_by_idx
  on public.payroll_wagesheet_reviews (manager_approved_by);

-- Employee HR core
create index if not exists employee_hr_records_org_id_idx
  on public.employee_hr_records (org_id);

create index if not exists employee_hr_record_events_record_id_idx
  on public.employee_hr_record_events (record_id);

create index if not exists employee_hr_record_events_org_id_idx
  on public.employee_hr_record_events (org_id);
