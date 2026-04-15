export const PERMISSION_KEYS = [
  // Members
  'members.view',
  'members.create',
  'members.invite',
  'members.edit_roles',
  'members.edit_status',
  'members.remove',
  'approvals.members.review',
  // Roles
  'roles.view',
  'roles.manage',
  // Org structure
  'departments.view',
  'departments.create',
  'departments.edit',
  'departments.manage',
  'teams.view',
  'teams.create',
  'teams.edit',
  'teams.manage',
  // Broadcasts
  'broadcasts.view',
  'broadcasts.compose',
  'broadcasts.publish',
  'broadcasts.publish_without_approval',
  'broadcasts.approve',
  // Rota
  'rota.view',
  'rota.create',
  'rota.edit',
  'rota.manage',
  'rota.final_approve',
  // Discounts
  'discounts.view',
  'discounts.verify_qr',
  // Organisation
  'org.settings.view',
  'org.settings.manage',
  // Integrations
  'integrations.view',
  'integrations.manage',
  // Recruitment requests
  'recruitment.view',
  'recruitment.create_request',
  'recruitment.approve_request',
  'recruitment.manage',
  // Jobs
  'jobs.view',
  'jobs.create',
  'jobs.edit',
  'jobs.publish',
  'jobs.archive',
  'jobs.manage',
  // Applications
  'applications.view',
  'applications.move_stage',
  'applications.notify_candidate',
  'applications.add_internal_notes',
  'applications.manage',
  // Offers
  'offers.view',
  'offers.generate',
  'offers.send_esign',
  'offers.view_signed_pdf',
  'offers.manage',
  // Interviews
  'interviews.view',
  'interviews.create_slot',
  'interviews.book_slot',
  'interviews.complete_slot',
  'interviews.manage',
  // Leave & sickness absence scoring
  'leave.submit',
  'leave.view_own',
  'leave.view_direct_reports',
  'leave.approve_direct_reports',
  'leave.manage_org',
  // HR records
  'hr.view_own',
  'hr.view_direct_reports',
  'hr.view_records',
  'hr.manage_records',
  'hr.employee_photo.view_all',
  'hr.employee_photo.manage_all',
  'hr.employee_photo.view_own',
  'hr.employee_photo.upload_own',
  'hr.employee_photo.delete_own',
  'hr.id_document.view_all',
  'hr.id_document.manage_all',
  'hr.id_document.view_own',
  'hr.id_document.upload_own',
  'hr.id_document.delete_own',
  'hr.employment_history.view_all',
  'hr.employment_history.manage_all',
  'hr.employment_history.view_own',
  'hr.employment_history.manage_own',
  'hr.disciplinary.view_all',
  'hr.disciplinary.manage_all',
  'hr.disciplinary.view_own',
  'hr.grievance.view_all',
  'hr.grievance.manage_all',
  'hr.grievance.view_own',
  'hr.medical_notes.view_all',
  'hr.medical_notes.manage_all',
  'hr.medical_notes.view_own_summary',
  'hr.medical_notes.reveal_sensitive',
  'hr.medical_notes.export',
  'hr.medical_notes.manage_own',
  'hr.custom_fields.view',
  'hr.custom_fields.manage_definitions',
  'hr.custom_fields.manage_values_all',
  'hr.custom_fields.manage_values_own',
  'privacy.retention_policy.view',
  'privacy.retention_policy.manage',
  'privacy.erasure_request.create',
  'privacy.erasure_request.review',
  'privacy.erasure_request.execute',
  'privacy.erasure_request.audit_view',
  'hr.records_export.view_all',
  'hr.records_export.view_own',
  'hr.records_export.view_direct_reports',
  'hr.records_export.include_sensitive',
  'hr.records_export.generate_pdf',
  'hr.records_export.generate_csv',
  // Payroll / wagesheets
  'payroll.view',
  'payroll.manage',
  'payroll.bank_details.view_all',
  'payroll.bank_details.manage_all',
  'payroll.bank_details.view_own',
  'payroll.bank_details.manage_own',
  'payroll.bank_details.export',
  'payroll.uk_tax.view_all',
  'payroll.uk_tax.manage_all',
  'payroll.uk_tax.view_own',
  'payroll.uk_tax.manage_own',
  'payroll.uk_tax.export',
  'payroll.tax_docs.view_all',
  'payroll.tax_docs.manage_all',
  'payroll.tax_docs.view_own',
  'payroll.tax_docs.upload_own',
  'payroll.tax_docs.export',
  // Staff resource library (upload/manage)
  'resources.manage',
  // Onboarding
  'onboarding.manage_templates',
  'onboarding.manage_runs',
  'onboarding.complete_own_tasks',
  // Performance reviews
  'performance.manage_cycles',
  'performance.view_reports',
  'performance.review_direct_reports',
  'performance.view_own',
  // 1:1 check-ins
  'one_on_one.view_own',
  'one_on_one.manage_direct_reports',
  'one_on_one.manage_templates',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const FOUNDER_ONLY_PERMISSION_KEYS = [
  'founder.platform.manage',
  'founder.billing.manage',
  'founder.feature_flags.manage',
] as const;

export type FounderOnlyPermissionKey = (typeof FOUNDER_ONLY_PERMISSION_KEYS)[number];

export type EffectivePermissionKey = PermissionKey | FounderOnlyPermissionKey;

export type PermissionCondition =
  | 'always'
  | 'requires_approval'
  | 'dept_scoped'
  | 'owner_scoped';

