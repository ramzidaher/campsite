-- Round 2: add covering indexes for foreign keys introduced after the first pass.
-- Keeps Supabase linter 0001 clean and reduces FK check overhead on deletes/updates.

create index if not exists calendar_event_attendees_invited_by_idx on public.calendar_event_attendees (invited_by);
create index if not exists calendar_event_attendees_org_id_idx on public.calendar_event_attendees (org_id);
create index if not exists calendar_event_notification_jobs_event_id_idx on public.calendar_event_notification_jobs (event_id);
create index if not exists calendar_event_notification_jobs_org_id_idx on public.calendar_event_notification_jobs (org_id);
create index if not exists calendar_event_notifications_org_id_idx on public.calendar_event_notifications (org_id);

create index if not exists employee_bank_detail_events_actor_user_id_idx on public.employee_bank_detail_events (actor_user_id);
create index if not exists employee_bank_detail_events_bank_detail_id_idx on public.employee_bank_detail_events (bank_detail_id);
create index if not exists employee_bank_detail_events_user_id_idx on public.employee_bank_detail_events (user_id);
create index if not exists employee_bank_details_reviewed_by_idx on public.employee_bank_details (reviewed_by);
create index if not exists employee_bank_details_submitted_by_idx on public.employee_bank_details (submitted_by);
create index if not exists employee_bank_details_user_id_idx on public.employee_bank_details (user_id);

create index if not exists employee_case_record_events_case_id_idx on public.employee_case_record_events (case_id);
create index if not exists employee_case_record_events_created_by_idx on public.employee_case_record_events (created_by);
create index if not exists employee_case_records_created_by_idx on public.employee_case_records (created_by);
create index if not exists employee_case_records_investigator_user_id_idx on public.employee_case_records (investigator_user_id);
create index if not exists employee_case_records_owner_user_id_idx on public.employee_case_records (owner_user_id);
create index if not exists employee_case_records_updated_by_idx on public.employee_case_records (updated_by);
create index if not exists employee_case_records_user_id_idx on public.employee_case_records (user_id);

create index if not exists employee_dependants_created_by_idx on public.employee_dependants (created_by);
create index if not exists employee_dependants_updated_by_idx on public.employee_dependants (updated_by);
create index if not exists employee_dependants_user_id_idx on public.employee_dependants (user_id);
create index if not exists employee_document_categories_created_by_idx on public.employee_document_categories (created_by);
create index if not exists employee_employment_history_created_by_idx on public.employee_employment_history (created_by);
create index if not exists employee_employment_history_updated_by_idx on public.employee_employment_history (updated_by);
create index if not exists employee_employment_history_user_id_idx on public.employee_employment_history (user_id);

create index if not exists employee_hr_documents_replaced_by_document_id_idx on public.employee_hr_documents (replaced_by_document_id);
create index if not exists employee_hr_documents_uploaded_by_idx on public.employee_hr_documents (uploaded_by);
create index if not exists employee_hr_documents_user_id_idx on public.employee_hr_documents (user_id);
create index if not exists employee_medical_note_events_actor_user_id_idx on public.employee_medical_note_events (actor_user_id);
create index if not exists employee_medical_note_events_medical_note_id_idx on public.employee_medical_note_events (medical_note_id);
create index if not exists employee_medical_note_events_user_id_idx on public.employee_medical_note_events (user_id);
create index if not exists employee_medical_notes_created_by_idx on public.employee_medical_notes (created_by);
create index if not exists employee_medical_notes_updated_by_idx on public.employee_medical_notes (updated_by);
create index if not exists employee_medical_notes_user_id_idx on public.employee_medical_notes (user_id);

create index if not exists employee_record_export_events_actor_user_id_idx on public.employee_record_export_events (actor_user_id);
create index if not exists employee_record_export_events_target_user_id_idx on public.employee_record_export_events (target_user_id);
create index if not exists employee_tax_documents_replaced_by_document_id_idx on public.employee_tax_documents (replaced_by_document_id);
create index if not exists employee_tax_documents_uploaded_by_idx on public.employee_tax_documents (uploaded_by);
create index if not exists employee_tax_documents_user_id_idx on public.employee_tax_documents (user_id);
create index if not exists employee_uk_tax_detail_events_actor_user_id_idx on public.employee_uk_tax_detail_events (actor_user_id);
create index if not exists employee_uk_tax_detail_events_uk_tax_detail_id_idx on public.employee_uk_tax_detail_events (uk_tax_detail_id);
create index if not exists employee_uk_tax_detail_events_user_id_idx on public.employee_uk_tax_detail_events (user_id);
create index if not exists employee_uk_tax_details_reviewed_by_idx on public.employee_uk_tax_details (reviewed_by);
create index if not exists employee_uk_tax_details_submitted_by_idx on public.employee_uk_tax_details (submitted_by);
create index if not exists employee_uk_tax_details_user_id_idx on public.employee_uk_tax_details (user_id);

create index if not exists hr_custom_field_definitions_created_by_idx on public.hr_custom_field_definitions (created_by);
create index if not exists hr_custom_field_definitions_updated_by_idx on public.hr_custom_field_definitions (updated_by);
create index if not exists hr_custom_field_events_actor_user_id_idx on public.hr_custom_field_events (actor_user_id);
create index if not exists hr_custom_field_events_definition_id_idx on public.hr_custom_field_events (definition_id);
create index if not exists hr_custom_field_events_user_id_idx on public.hr_custom_field_events (user_id);
create index if not exists hr_custom_field_values_created_by_idx on public.hr_custom_field_values (created_by);
create index if not exists hr_custom_field_values_definition_id_idx on public.hr_custom_field_values (definition_id);
create index if not exists hr_custom_field_values_updated_by_idx on public.hr_custom_field_values (updated_by);
create index if not exists hr_custom_field_values_user_id_idx on public.hr_custom_field_values (user_id);

create index if not exists leave_carryover_requests_decided_by_idx on public.leave_carryover_requests (decided_by);
create index if not exists leave_encashment_requests_decided_by_idx on public.leave_encashment_requests (decided_by);
create index if not exists leave_request_documents_request_id_idx on public.leave_request_documents (request_id);
create index if not exists leave_request_documents_requester_id_idx on public.leave_request_documents (requester_id);
create index if not exists org_leave_holiday_periods_created_by_idx on public.org_leave_holiday_periods (created_by);

create index if not exists privacy_erasure_audit_events_actor_user_id_idx on public.privacy_erasure_audit_events (actor_user_id);
create index if not exists privacy_erasure_audit_events_erasure_request_id_idx on public.privacy_erasure_audit_events (erasure_request_id);
create index if not exists privacy_erasure_audit_events_user_id_idx on public.privacy_erasure_audit_events (user_id);
create index if not exists privacy_erasure_requests_approved_by_idx on public.privacy_erasure_requests (approved_by);
create index if not exists privacy_erasure_requests_executed_by_idx on public.privacy_erasure_requests (executed_by);
create index if not exists privacy_erasure_requests_requester_user_id_idx on public.privacy_erasure_requests (requester_user_id);
create index if not exists privacy_erasure_requests_user_id_idx on public.privacy_erasure_requests (user_id);
create index if not exists privacy_retention_policies_created_by_idx on public.privacy_retention_policies (created_by);
create index if not exists privacy_retention_policies_updated_by_idx on public.privacy_retention_policies (updated_by);
