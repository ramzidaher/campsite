-- Tenant integrity guardrails phase 2:
-- Extend org-membership reference checks to additional org-scoped tables.

-- ---------------------------------------------------------------------------
-- Leave / approvals
-- ---------------------------------------------------------------------------

drop trigger if exists leave_carryover_requests_org_membership_refs_trg on public.leave_carryover_requests;
create trigger leave_carryover_requests_org_membership_refs_trg
before insert or update of org_id, requester_id, decided_by
on public.leave_carryover_requests
for each row
execute function public.enforce_org_membership_refs('requester_id', 'decided_by');

drop trigger if exists leave_encashment_requests_org_membership_refs_trg on public.leave_encashment_requests;
create trigger leave_encashment_requests_org_membership_refs_trg
before insert or update of org_id, requester_id, decided_by
on public.leave_encashment_requests
for each row
execute function public.enforce_org_membership_refs('requester_id', 'decided_by');

drop trigger if exists toil_credit_requests_org_membership_refs_trg on public.toil_credit_requests;
create trigger toil_credit_requests_org_membership_refs_trg
before insert or update of org_id, requester_id, decided_by
on public.toil_credit_requests
for each row
execute function public.enforce_org_membership_refs('requester_id', 'decided_by');

drop trigger if exists leave_request_documents_org_membership_refs_trg on public.leave_request_documents;
create trigger leave_request_documents_org_membership_refs_trg
before insert or update of org_id, requester_id
on public.leave_request_documents
for each row
execute function public.enforce_org_membership_refs('requester_id');

-- ---------------------------------------------------------------------------
-- HR / records
-- ---------------------------------------------------------------------------

drop trigger if exists employee_bank_details_org_membership_refs_trg on public.employee_bank_details;
create trigger employee_bank_details_org_membership_refs_trg
before insert or update of org_id, user_id, submitted_by, reviewed_by
on public.employee_bank_details
for each row
execute function public.enforce_org_membership_refs('user_id', 'submitted_by', 'reviewed_by');

drop trigger if exists employee_uk_tax_details_org_membership_refs_trg on public.employee_uk_tax_details;
create trigger employee_uk_tax_details_org_membership_refs_trg
before insert or update of org_id, user_id, submitted_by, reviewed_by
on public.employee_uk_tax_details
for each row
execute function public.enforce_org_membership_refs('user_id', 'submitted_by', 'reviewed_by');

drop trigger if exists employee_medical_notes_org_membership_refs_trg on public.employee_medical_notes;
create trigger employee_medical_notes_org_membership_refs_trg
before insert or update of org_id, user_id, created_by, updated_by
on public.employee_medical_notes
for each row
execute function public.enforce_org_membership_refs('user_id', 'created_by', 'updated_by');

drop trigger if exists employee_case_records_org_membership_refs_trg on public.employee_case_records;
create trigger employee_case_records_org_membership_refs_trg
before insert or update of org_id, user_id, owner_user_id, investigator_user_id, created_by, updated_by
on public.employee_case_records
for each row
execute function public.enforce_org_membership_refs(
  'user_id',
  'owner_user_id',
  'investigator_user_id',
  'created_by',
  'updated_by'
);

drop trigger if exists employee_dependants_org_membership_refs_trg on public.employee_dependants;
create trigger employee_dependants_org_membership_refs_trg
before insert or update of org_id, user_id, created_by, updated_by
on public.employee_dependants
for each row
execute function public.enforce_org_membership_refs('user_id', 'created_by', 'updated_by');

drop trigger if exists employee_training_records_org_membership_refs_trg on public.employee_training_records;
create trigger employee_training_records_org_membership_refs_trg
before insert or update of org_id, user_id, created_by, updated_by
on public.employee_training_records
for each row
execute function public.enforce_org_membership_refs('user_id', 'created_by', 'updated_by');

drop trigger if exists employee_employment_history_org_membership_refs_trg on public.employee_employment_history;
create trigger employee_employment_history_org_membership_refs_trg
before insert or update of org_id, user_id, created_by, updated_by
on public.employee_employment_history
for each row
execute function public.enforce_org_membership_refs('user_id', 'created_by', 'updated_by');

drop trigger if exists employee_hr_documents_org_membership_refs_trg on public.employee_hr_documents;
create trigger employee_hr_documents_org_membership_refs_trg
before insert or update of org_id, user_id, uploaded_by
on public.employee_hr_documents
for each row
execute function public.enforce_org_membership_refs('user_id', 'uploaded_by');

drop trigger if exists hr_custom_field_values_org_membership_refs_trg on public.hr_custom_field_values;
create trigger hr_custom_field_values_org_membership_refs_trg
before insert or update of org_id, user_id, created_by, updated_by
on public.hr_custom_field_values
for each row
execute function public.enforce_org_membership_refs('user_id', 'created_by', 'updated_by');

-- ---------------------------------------------------------------------------
-- 1:1 / calendar / recruitment / payroll
-- ---------------------------------------------------------------------------

drop trigger if exists one_on_one_meetings_org_membership_refs_trg on public.one_on_one_meetings;
create trigger one_on_one_meetings_org_membership_refs_trg
before insert or update of org_id, manager_user_id, report_user_id, created_by
on public.one_on_one_meetings
for each row
execute function public.enforce_org_membership_refs('manager_user_id', 'report_user_id', 'created_by');

drop trigger if exists one_on_one_note_edit_requests_org_membership_refs_trg on public.one_on_one_note_edit_requests;
create trigger one_on_one_note_edit_requests_org_membership_refs_trg
before insert or update of org_id, requester_id, resolved_by
on public.one_on_one_note_edit_requests
for each row
execute function public.enforce_org_membership_refs('requester_id', 'resolved_by');

drop trigger if exists one_on_one_notification_jobs_org_membership_refs_trg on public.one_on_one_notification_jobs;
create trigger one_on_one_notification_jobs_org_membership_refs_trg
before insert or update of org_id
on public.one_on_one_notification_jobs
for each row
execute function public.enforce_org_membership_refs();

drop trigger if exists calendar_event_notifications_org_membership_refs_trg on public.calendar_event_notifications;
create trigger calendar_event_notifications_org_membership_refs_trg
before insert or update of org_id, recipient_id
on public.calendar_event_notifications
for each row
execute function public.enforce_org_membership_refs('recipient_id');

drop trigger if exists recruitment_requests_org_membership_refs_trg on public.recruitment_requests;
create trigger recruitment_requests_org_membership_refs_trg
before insert or update of org_id, created_by
on public.recruitment_requests
for each row
execute function public.enforce_org_membership_refs('created_by');

drop trigger if exists payroll_manual_adjustments_org_membership_refs_trg on public.payroll_manual_adjustments;
create trigger payroll_manual_adjustments_org_membership_refs_trg
before insert or update of org_id, user_id, created_by, updated_by, requested_by, approved_by
on public.payroll_manual_adjustments
for each row
execute function public.enforce_org_membership_refs(
  'user_id',
  'created_by',
  'updated_by',
  'requested_by',
  'approved_by'
);

drop trigger if exists payroll_wagesheet_reviews_org_membership_refs_trg on public.payroll_wagesheet_reviews;
create trigger payroll_wagesheet_reviews_org_membership_refs_trg
before insert or update of org_id, user_id, manager_approved_by, finance_approved_by, paid_by
on public.payroll_wagesheet_reviews
for each row
execute function public.enforce_org_membership_refs(
  'user_id',
  'manager_approved_by',
  'finance_approved_by',
  'paid_by'
);
