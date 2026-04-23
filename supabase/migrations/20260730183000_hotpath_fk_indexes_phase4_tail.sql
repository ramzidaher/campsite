-- Phase 4 tail cleanup for remaining db_fk_missing_index_audit entries.
-- Goal: close remaining FK-leading index gaps with a small explicit batch.

create index if not exists broadcast_replies_author_id_idx
  on public.broadcast_replies (author_id);

create index if not exists employee_training_records_user_id_idx
  on public.employee_training_records (user_id);

create index if not exists job_application_screening_answers_org_id_idx
  on public.job_application_screening_answers (org_id);
create index if not exists job_application_screening_answers_source_question_id_idx
  on public.job_application_screening_answers (source_question_id);
create index if not exists job_application_screening_scores_reviewer_profile_id_idx
  on public.job_application_screening_scores (reviewer_profile_id);

create index if not exists job_listing_screening_questions_org_id_idx
  on public.job_listing_screening_questions (org_id);

create index if not exists leave_finance_notifications_actor_user_id_idx
  on public.leave_finance_notifications (actor_user_id);
create index if not exists leave_finance_notifications_encashment_request_id_idx
  on public.leave_finance_notifications (encashment_request_id);
create index if not exists leave_finance_notifications_org_id_idx
  on public.leave_finance_notifications (org_id);

create index if not exists org_application_question_set_items_org_id_idx
  on public.org_application_question_set_items (org_id);
create index if not exists org_application_question_sets_created_by_idx
  on public.org_application_question_sets (created_by);

create index if not exists payroll_employee_pay_profiles_updated_by_idx
  on public.payroll_employee_pay_profiles (updated_by);
create index if not exists payroll_employee_pay_profiles_user_id_idx
  on public.payroll_employee_pay_profiles (user_id);

create index if not exists payroll_manual_adjustments_approved_by_idx
  on public.payroll_manual_adjustments (approved_by);
create index if not exists payroll_manual_adjustments_created_by_idx
  on public.payroll_manual_adjustments (created_by);
create index if not exists payroll_manual_adjustments_updated_by_idx
  on public.payroll_manual_adjustments (updated_by);
create index if not exists payroll_manual_adjustments_user_id_idx
  on public.payroll_manual_adjustments (user_id);

create index if not exists payroll_pay_elements_created_by_idx
  on public.payroll_pay_elements (created_by);
create index if not exists payroll_policy_settings_updated_by_idx
  on public.payroll_policy_settings (updated_by);
create index if not exists payroll_role_hourly_rates_created_by_idx
  on public.payroll_role_hourly_rates (created_by);

create index if not exists payroll_wagesheet_reviews_finance_approved_by_idx
  on public.payroll_wagesheet_reviews (finance_approved_by);
create index if not exists payroll_wagesheet_reviews_paid_by_idx
  on public.payroll_wagesheet_reviews (paid_by);
create index if not exists payroll_wagesheet_reviews_user_id_idx
  on public.payroll_wagesheet_reviews (user_id);

create index if not exists platform_legal_settings_history_source_updated_by_idx
  on public.platform_legal_settings_history (source_updated_by);

create index if not exists rota_shift_overlap_cleanup_events_conflict_with_shift_id_idx
  on public.rota_shift_overlap_cleanup_events (conflict_with_shift_id);
create index if not exists rota_shift_overlap_cleanup_events_shift_id_idx
  on public.rota_shift_overlap_cleanup_events (shift_id);
create index if not exists rota_shift_overlap_cleanup_events_user_id_idx
  on public.rota_shift_overlap_cleanup_events (user_id);
