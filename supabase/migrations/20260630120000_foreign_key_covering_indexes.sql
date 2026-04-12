-- Linter 0001 (unindexed_foreign keys): btree indexes on referencing FK columns for DELETE/UPDATE on parents.
-- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

-- application_notifications
create index if not exists application_notifications_org_id_idx
  on public.application_notifications (org_id);
create index if not exists application_notifications_job_listing_id_idx
  on public.application_notifications (job_listing_id);

-- application_offers
create index if not exists application_offers_created_by_idx
  on public.application_offers (created_by);
create index if not exists application_offers_template_id_idx
  on public.application_offers (template_id);

-- attendance_events
create index if not exists attendance_events_user_id_idx
  on public.attendance_events (user_id);
create index if not exists attendance_events_work_site_id_idx
  on public.attendance_events (work_site_id);
create index if not exists attendance_events_created_by_idx
  on public.attendance_events (created_by);

-- audit_role_events
create index if not exists audit_role_events_actor_user_id_idx
  on public.audit_role_events (actor_user_id);
create index if not exists audit_role_events_target_user_id_idx
  on public.audit_role_events (target_user_id);

-- broadcasts
create index if not exists broadcasts_reviewed_by_idx
  on public.broadcasts (reviewed_by);

-- calendar_events
create index if not exists calendar_events_dept_id_idx
  on public.calendar_events (dept_id);
create index if not exists calendar_events_shift_id_idx
  on public.calendar_events (shift_id);
create index if not exists calendar_events_created_by_idx
  on public.calendar_events (created_by);

-- dept_broadcast_permissions
create index if not exists dept_broadcast_permissions_granted_by_idx
  on public.dept_broadcast_permissions (granted_by);

-- employee_hr_record_events
create index if not exists employee_hr_record_events_org_id_idx
  on public.employee_hr_record_events (org_id);
create index if not exists employee_hr_record_events_changed_by_idx
  on public.employee_hr_record_events (changed_by);

-- employee_hr_records
create index if not exists employee_hr_records_created_by_idx
  on public.employee_hr_records (created_by);
create index if not exists employee_hr_records_updated_by_idx
  on public.employee_hr_records (updated_by);
create index if not exists employee_hr_records_hired_from_application_id_idx
  on public.employee_hr_records (hired_from_application_id);
create index if not exists employee_hr_records_probation_check_completed_by_idx
  on public.employee_hr_records (probation_check_completed_by);

-- founder_acting_org
create index if not exists founder_acting_org_org_id_idx
  on public.founder_acting_org (org_id);

-- hr_metric_notifications
create index if not exists hr_metric_notifications_subject_user_id_idx
  on public.hr_metric_notifications (subject_user_id);
create index if not exists hr_metric_notifications_subject_job_listing_id_idx
  on public.hr_metric_notifications (subject_job_listing_id);

-- interview_slot_google_events
create index if not exists interview_slot_google_events_profile_id_idx
  on public.interview_slot_google_events (profile_id);

-- interview_slots
create index if not exists interview_slots_job_listing_id_idx
  on public.interview_slots (job_listing_id);
create index if not exists interview_slots_created_by_idx
  on public.interview_slots (created_by);

-- job_application_messages
create index if not exists job_application_messages_org_id_idx
  on public.job_application_messages (org_id);
create index if not exists job_application_messages_created_by_idx
  on public.job_application_messages (created_by);

-- job_application_notes
create index if not exists job_application_notes_org_id_idx
  on public.job_application_notes (org_id);
create index if not exists job_application_notes_created_by_idx
  on public.job_application_notes (created_by);

-- job_application_rate_limit_events
create index if not exists job_application_rate_limit_events_org_id_idx
  on public.job_application_rate_limit_events (org_id);

-- job_applications
create index if not exists job_applications_department_id_idx
  on public.job_applications (department_id);
create index if not exists job_applications_candidate_user_id_idx
  on public.job_applications (candidate_user_id);

-- job_listing_public_metrics
create index if not exists job_listing_public_metrics_job_listing_id_idx
  on public.job_listing_public_metrics (job_listing_id);

-- job_listings
create index if not exists job_listings_department_id_idx
  on public.job_listings (department_id);
create index if not exists job_listings_created_by_idx
  on public.job_listings (created_by);

-- leave_allowances
create index if not exists leave_allowances_user_id_idx
  on public.leave_allowances (user_id);

-- leave_notifications
create index if not exists leave_notifications_org_id_idx
  on public.leave_notifications (org_id);

-- leave_requests
create index if not exists leave_requests_decided_by_idx
  on public.leave_requests (decided_by);

-- offer_letter_templates
create index if not exists offer_letter_templates_created_by_idx
  on public.offer_letter_templates (created_by);

-- onboarding_run_tasks
create index if not exists onboarding_run_tasks_org_id_idx
  on public.onboarding_run_tasks (org_id);
create index if not exists onboarding_run_tasks_template_task_id_idx
  on public.onboarding_run_tasks (template_task_id);
create index if not exists onboarding_run_tasks_completed_by_idx
  on public.onboarding_run_tasks (completed_by);

-- onboarding_runs
create index if not exists onboarding_runs_template_id_idx
  on public.onboarding_runs (template_id);
create index if not exists onboarding_runs_offer_id_idx
  on public.onboarding_runs (offer_id);
create index if not exists onboarding_runs_started_by_idx
  on public.onboarding_runs (started_by);

-- onboarding_template_tasks
create index if not exists onboarding_template_tasks_org_id_idx
  on public.onboarding_template_tasks (org_id);

-- onboarding_templates
create index if not exists onboarding_templates_created_by_idx
  on public.onboarding_templates (created_by);

-- one_on_one_meetings
create index if not exists one_on_one_meetings_manager_user_id_idx
  on public.one_on_one_meetings (manager_user_id);
create index if not exists one_on_one_meetings_report_user_id_idx
  on public.one_on_one_meetings (report_user_id);
create index if not exists one_on_one_meetings_template_id_idx
  on public.one_on_one_meetings (template_id);
create index if not exists one_on_one_meetings_created_by_idx
  on public.one_on_one_meetings (created_by);

-- one_on_one_note_edit_requests
create index if not exists one_on_one_note_edit_requests_org_id_idx
  on public.one_on_one_note_edit_requests (org_id);
create index if not exists one_on_one_note_edit_requests_requester_id_idx
  on public.one_on_one_note_edit_requests (requester_id);
create index if not exists one_on_one_note_edit_requests_resolved_by_idx
  on public.one_on_one_note_edit_requests (resolved_by);

-- one_on_one_notification_jobs
create index if not exists one_on_one_notification_jobs_org_id_idx
  on public.one_on_one_notification_jobs (org_id);
create index if not exists one_on_one_notification_jobs_meeting_id_idx
  on public.one_on_one_notification_jobs (meeting_id);

-- one_on_one_overdue_nudge_sent
create index if not exists one_on_one_overdue_nudge_sent_manager_user_id_idx
  on public.one_on_one_overdue_nudge_sent (manager_user_id);
create index if not exists one_on_one_overdue_nudge_sent_report_user_id_idx
  on public.one_on_one_overdue_nudge_sent (report_user_id);

-- one_on_one_pair_settings
create index if not exists one_on_one_pair_settings_manager_user_id_idx
  on public.one_on_one_pair_settings (manager_user_id);
create index if not exists one_on_one_pair_settings_report_user_id_idx
  on public.one_on_one_pair_settings (report_user_id);

-- one_on_one_templates
create index if not exists one_on_one_templates_created_by_idx
  on public.one_on_one_templates (created_by);

-- org_permission_policies
create index if not exists org_permission_policies_permission_key_idx
  on public.org_permission_policies (permission_key);
create index if not exists org_permission_policies_created_by_idx
  on public.org_permission_policies (created_by);

-- org_role_permissions
create index if not exists org_role_permissions_permission_key_idx
  on public.org_role_permissions (permission_key);

-- org_roles
create index if not exists org_roles_source_preset_id_idx
  on public.org_roles (source_preset_id);
create index if not exists org_roles_created_by_idx
  on public.org_roles (created_by);

-- performance_reviews
create index if not exists performance_reviews_org_id_idx
  on public.performance_reviews (org_id);

-- platform_audit_events
create index if not exists platform_audit_events_actor_user_id_idx
  on public.platform_audit_events (actor_user_id);

-- platform_legal_settings
create index if not exists platform_legal_settings_updated_by_idx
  on public.platform_legal_settings (updated_by);

-- platform_permission_catalog_versions
create index if not exists platform_permission_catalog_versions_created_by_idx
  on public.platform_permission_catalog_versions (created_by);
create index if not exists platform_permission_catalog_versions_published_by_idx
  on public.platform_permission_catalog_versions (published_by);

-- platform_role_presets
create index if not exists platform_role_presets_created_by_idx
  on public.platform_role_presets (created_by);

-- profiles
create index if not exists profiles_reviewed_by_idx
  on public.profiles (reviewed_by);

-- recruitment_notifications
create index if not exists recruitment_notifications_org_id_idx
  on public.recruitment_notifications (org_id);

-- recruitment_request_status_events
create index if not exists recruitment_request_status_events_org_id_idx
  on public.recruitment_request_status_events (org_id);
create index if not exists recruitment_request_status_events_changed_by_idx
  on public.recruitment_request_status_events (changed_by);

-- recruitment_requests
create index if not exists recruitment_requests_department_id_idx
  on public.recruitment_requests (department_id);
create index if not exists recruitment_requests_created_by_idx
  on public.recruitment_requests (created_by);

-- review_cycles
create index if not exists review_cycles_created_by_idx
  on public.review_cycles (created_by);

-- review_goals
create index if not exists review_goals_org_id_idx
  on public.review_goals (org_id);

-- rota_change_requests
create index if not exists rota_change_requests_primary_shift_id_idx
  on public.rota_change_requests (primary_shift_id);
create index if not exists rota_change_requests_counterparty_shift_id_idx
  on public.rota_change_requests (counterparty_shift_id);
create index if not exists rota_change_requests_resolved_by_idx
  on public.rota_change_requests (resolved_by);

-- rota_notification_jobs
create index if not exists rota_notification_jobs_org_id_idx
  on public.rota_notification_jobs (org_id);
create index if not exists rota_notification_jobs_rota_shift_id_idx
  on public.rota_notification_jobs (rota_shift_id);
create index if not exists rota_notification_jobs_change_request_id_idx
  on public.rota_notification_jobs (change_request_id);

-- rota_sheets_sync_log
create index if not exists rota_sheets_sync_log_triggered_by_idx
  on public.rota_sheets_sync_log (triggered_by);
create index if not exists rota_sheets_sync_log_target_rota_id_idx
  on public.rota_sheets_sync_log (target_rota_id);

-- rota_shift_reminder_sent
create index if not exists rota_shift_reminder_sent_user_id_idx
  on public.rota_shift_reminder_sent (user_id);

-- rota_staff_availability_override
create index if not exists rota_staff_availability_override_user_id_idx
  on public.rota_staff_availability_override (user_id);

-- rota_staff_availability_template
create index if not exists rota_staff_availability_template_user_id_idx
  on public.rota_staff_availability_template (user_id);

-- rotas
create index if not exists rotas_department_team_id_idx
  on public.rotas (department_team_id);

-- scan_logs
create index if not exists scan_logs_scanner_id_idx
  on public.scan_logs (scanner_id);
create index if not exists scan_logs_scanned_user_id_idx
  on public.scan_logs (scanned_user_id);

-- sheets_mappings
create index if not exists sheets_mappings_connection_id_idx
  on public.sheets_mappings (connection_id);
create index if not exists sheets_mappings_target_rota_id_idx
  on public.sheets_mappings (target_rota_id);

-- sickness_absences
create index if not exists sickness_absences_user_id_idx
  on public.sickness_absences (user_id);
create index if not exists sickness_absences_created_by_idx
  on public.sickness_absences (created_by);
create index if not exists sickness_absences_voided_by_idx
  on public.sickness_absences (voided_by);

-- staff_resources
create index if not exists staff_resources_created_by_idx
  on public.staff_resources (created_by);

-- toil_credit_requests
create index if not exists toil_credit_requests_decided_by_idx
  on public.toil_credit_requests (decided_by);

-- user_org_memberships
create index if not exists user_org_memberships_reviewed_by_idx
  on public.user_org_memberships (reviewed_by);

-- user_org_role_assignments
create index if not exists user_org_role_assignments_role_id_idx
  on public.user_org_role_assignments (role_id);
create index if not exists user_org_role_assignments_assigned_by_idx
  on public.user_org_role_assignments (assigned_by);

-- user_permission_overrides
create index if not exists user_permission_overrides_user_id_idx
  on public.user_permission_overrides (user_id);
create index if not exists user_permission_overrides_permission_key_idx
  on public.user_permission_overrides (permission_key);
create index if not exists user_permission_overrides_created_by_idx
  on public.user_permission_overrides (created_by);

-- user_subscriptions
create index if not exists user_subscriptions_channel_id_idx
  on public.user_subscriptions (channel_id);

-- wagesheet_lines
create index if not exists wagesheet_lines_user_id_idx
  on public.wagesheet_lines (user_id);

-- weekly_timesheets
create index if not exists weekly_timesheets_user_id_idx
  on public.weekly_timesheets (user_id);
create index if not exists weekly_timesheets_submitted_by_idx
  on public.weekly_timesheets (submitted_by);
create index if not exists weekly_timesheets_decided_by_idx
  on public.weekly_timesheets (decided_by);
