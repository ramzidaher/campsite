-- Phase 3 FK-leading indexes from db_fk_missing_index_audit.
-- Scope: onboarding, performance/review, and remaining employee HR event paths.

-- Employee bank/tax details and events
create index if not exists employee_bank_details_org_id_idx
  on public.employee_bank_details (org_id);
create index if not exists employee_bank_details_reviewed_by_idx
  on public.employee_bank_details (reviewed_by);
create index if not exists employee_bank_details_submitted_by_idx
  on public.employee_bank_details (submitted_by);
create index if not exists employee_bank_detail_events_actor_user_id_idx
  on public.employee_bank_detail_events (actor_user_id);
create index if not exists employee_bank_detail_events_bank_detail_id_idx
  on public.employee_bank_detail_events (bank_detail_id);
create index if not exists employee_bank_detail_events_org_id_idx
  on public.employee_bank_detail_events (org_id);

create index if not exists employee_uk_tax_details_org_id_idx
  on public.employee_uk_tax_details (org_id);
create index if not exists employee_uk_tax_details_reviewed_by_idx
  on public.employee_uk_tax_details (reviewed_by);
create index if not exists employee_uk_tax_details_submitted_by_idx
  on public.employee_uk_tax_details (submitted_by);
create index if not exists employee_uk_tax_detail_events_actor_user_id_idx
  on public.employee_uk_tax_detail_events (actor_user_id);
create index if not exists employee_uk_tax_detail_events_uk_tax_detail_id_idx
  on public.employee_uk_tax_detail_events (uk_tax_detail_id);
create index if not exists employee_uk_tax_detail_events_org_id_idx
  on public.employee_uk_tax_detail_events (org_id);

-- Employee records, notes, documents, and related audit/event tables
create index if not exists employee_case_records_org_id_idx
  on public.employee_case_records (org_id);
create index if not exists employee_case_records_created_by_idx
  on public.employee_case_records (created_by);
create index if not exists employee_case_records_investigator_user_id_idx
  on public.employee_case_records (investigator_user_id);
create index if not exists employee_case_records_owner_user_id_idx
  on public.employee_case_records (owner_user_id);
create index if not exists employee_case_records_updated_by_idx
  on public.employee_case_records (updated_by);
create index if not exists employee_case_record_events_created_by_idx
  on public.employee_case_record_events (created_by);
create index if not exists employee_case_record_events_org_id_idx
  on public.employee_case_record_events (org_id);

create index if not exists employee_medical_notes_org_id_idx
  on public.employee_medical_notes (org_id);
create index if not exists employee_medical_notes_created_by_idx
  on public.employee_medical_notes (created_by);
create index if not exists employee_medical_notes_updated_by_idx
  on public.employee_medical_notes (updated_by);
create index if not exists employee_medical_note_events_actor_user_id_idx
  on public.employee_medical_note_events (actor_user_id);
create index if not exists employee_medical_note_events_user_id_idx
  on public.employee_medical_note_events (user_id);
create index if not exists employee_medical_note_events_org_id_idx
  on public.employee_medical_note_events (org_id);

create index if not exists employee_employment_history_org_id_idx
  on public.employee_employment_history (org_id);
create index if not exists employee_employment_history_created_by_idx
  on public.employee_employment_history (created_by);
create index if not exists employee_employment_history_updated_by_idx
  on public.employee_employment_history (updated_by);

create index if not exists employee_document_categories_org_id_idx
  on public.employee_document_categories (org_id);
create index if not exists employee_document_categories_created_by_idx
  on public.employee_document_categories (created_by);

create index if not exists employee_training_records_org_id_idx
  on public.employee_training_records (org_id);
create index if not exists employee_training_records_created_by_idx
  on public.employee_training_records (created_by);
create index if not exists employee_training_records_updated_by_idx
  on public.employee_training_records (updated_by);

create index if not exists employee_tax_documents_org_id_idx
  on public.employee_tax_documents (org_id);
create index if not exists employee_tax_documents_uploaded_by_idx
  on public.employee_tax_documents (uploaded_by);
create index if not exists employee_tax_documents_replaced_by_document_id_idx
  on public.employee_tax_documents (replaced_by_document_id);

create index if not exists employee_record_export_events_org_id_idx
  on public.employee_record_export_events (org_id);
create index if not exists employee_record_export_events_actor_user_id_idx
  on public.employee_record_export_events (actor_user_id);
create index if not exists employee_record_export_events_target_user_id_idx
  on public.employee_record_export_events (target_user_id);

create index if not exists employee_hr_record_events_changed_by_idx
  on public.employee_hr_record_events (changed_by);

-- Onboarding workflow
create index if not exists onboarding_templates_org_id_idx
  on public.onboarding_templates (org_id);
create index if not exists onboarding_templates_created_by_idx
  on public.onboarding_templates (created_by);

create index if not exists onboarding_template_tasks_org_id_idx
  on public.onboarding_template_tasks (org_id);
create index if not exists onboarding_template_tasks_template_id_idx
  on public.onboarding_template_tasks (template_id);

create index if not exists onboarding_runs_org_id_idx
  on public.onboarding_runs (org_id);
create index if not exists onboarding_runs_offer_id_idx
  on public.onboarding_runs (offer_id);
create index if not exists onboarding_runs_started_by_idx
  on public.onboarding_runs (started_by);
create index if not exists onboarding_runs_template_id_idx
  on public.onboarding_runs (template_id);
create index if not exists onboarding_runs_user_id_idx
  on public.onboarding_runs (user_id);

create index if not exists onboarding_run_tasks_org_id_idx
  on public.onboarding_run_tasks (org_id);
create index if not exists onboarding_run_tasks_completed_by_idx
  on public.onboarding_run_tasks (completed_by);
create index if not exists onboarding_run_tasks_run_id_idx
  on public.onboarding_run_tasks (run_id);
create index if not exists onboarding_run_tasks_template_task_id_idx
  on public.onboarding_run_tasks (template_task_id);

-- Performance / review workflow
create index if not exists performance_reviews_cycle_id_idx
  on public.performance_reviews (cycle_id);
create index if not exists performance_reviews_org_id_idx
  on public.performance_reviews (org_id);
create index if not exists performance_reviews_reviewer_id_idx
  on public.performance_reviews (reviewer_id);

create index if not exists review_cycles_org_id_idx
  on public.review_cycles (org_id);
create index if not exists review_cycles_created_by_idx
  on public.review_cycles (created_by);

create index if not exists review_goals_org_id_idx
  on public.review_goals (org_id);
create index if not exists review_goals_review_id_idx
  on public.review_goals (review_id);
