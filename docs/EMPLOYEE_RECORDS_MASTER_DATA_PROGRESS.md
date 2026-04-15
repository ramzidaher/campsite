# 1. Employee Records & Master Data

## Progress Log

### 2026-04-15 - Employee photo and ID document management foundation

Implemented secure employee document management across backend + frontend with RBAC, privacy controls, and audit-friendly versioning.

### Features Added

- **Granular RBAC permissions (photo + ID):**
  - `hr.employee_photo.view_all`
  - `hr.employee_photo.manage_all`
  - `hr.employee_photo.view_own`
  - `hr.employee_photo.upload_own`
  - `hr.employee_photo.delete_own`
  - `hr.id_document.view_all`
  - `hr.id_document.manage_all`
  - `hr.id_document.view_own`
  - `hr.id_document.upload_own`
  - `hr.id_document.delete_own`

- **Supabase schema and policy updates:**
  - Extended `employee_hr_documents` with:
    - `document_kind`, `bucket_id`
    - `is_current`, `replaced_by_document_id` (versioning chain)
    - `id_document_type`, `id_number_last4`, `expires_on`
  - Added strict RLS for table access by document kind and role scope.
  - Added private storage buckets:
    - `employee-photos`
    - `employee-id-documents`
  - Added storage policies scoped by org and linked document records.

- **Privacy and security controls:**
  - ID number stored/displayed as **last 4 only**.
  - Sensitive documents stay in private buckets only.
  - Own-access and org-wide access are separated by permission keys.

- **MIME and bucket hardening:**
  - Employee photos: image files only.
  - ID documents: image or PDF only.
  - DB constraints enforce bucket-kind and mime-kind compatibility.

- **Expiry reminders:**
  - Added `id_document_expiry` metric notification kind.
  - Added org runners + daily cron generation for due/expired ID document alerts.
  - Alerts target HR viewers and line managers with dedupe logic.

- **Frontend (admin HR file):**
  - Upload/view/remove flows for employee photos and ID docs.
  - ID metadata capture (type, masked number, expiry).
  - Superseded/current indicators for document history.

- **Frontend (employee self-service profile):**
  - Employees can view/download own photo + ID docs.
  - Employees can upload/delete own docs when permissioned.
  - ID display remains masked.

- **Roles & permissions UX:**
  - Added Employee Document Permission Matrix in roles UI showing role coverage for all new document permissions.

### 2026-04-15 - Custom document categories (org reusable)

Implemented reusable HR categories so uploaders can classify what a document is at upload time.

### Features Added

- **New reusable category model:**
  - Table: `employee_document_categories`
  - Org-scoped categories with optional scope field by document kind.
  - RLS:
    - read for HR viewers
    - create/update/delete for `hr.manage_records`

- **Document linkage:**
  - Added `custom_category_id` to `employee_hr_documents`.
  - Uploaded records can be linked to an org reusable category.

- **HR upload UX enhancements:**
  - For `Other` document type:
    - Select existing custom category
    - Create and save a new reusable category inline
  - Document list displays custom category name when present.

### 2026-04-15 - Dependants / beneficiary information

Implemented dependant and beneficiary management for both HR/admin and employee self-service.

### Features Added

- **Backend model:**
  - New table: `employee_dependants`
  - Fields include:
    - full name, relationship, date of birth
    - student/disabled flags
    - beneficiary flag + beneficiary percentage
    - phone, email, address, notes
    - emergency contact flag
  - Added org/user indexes and updated-at trigger.

- **Security and access (RLS):**
  - `hr.view_records` can view org-wide.
  - `hr.view_direct_reports` can view direct reports.
  - `hr.manage_records` can manage any employee dependants.
  - Employee can manage own dependants with `hr.view_own` self-scope.

- **Beneficiary allocation validation:**
  - Added `employee_dependants_replace(p_user_id, p_dependants jsonb)` RPC.
  - Save flow replaces full dependant set in one transaction.
  - If beneficiary entries exist, percentages must total exactly **100%**.

- **Frontend integration:**
  - HR/Admin employee file (`/admin/hr/[userId]`):
    - Added Dependants & beneficiaries section
    - HR edit when `hr.manage_records`; manager/direct-report viewers are read-only
  - Employee self-service profile (`/profile`):
    - Added editable Dependants & beneficiaries section for own record

- **Reusable UI component:**
  - `DependantsEditorClient` used in both admin and self-service flows.

### 2026-04-15 - Payroll bank details secure storage

Implemented encrypted payroll bank detail storage with masked defaults, approval workflow, audited reveal/export actions, and key-rotation tooling.

### Features Added

- **Backend model + audit:**
  - New table: `employee_bank_details`
  - New event table: `employee_bank_detail_events`
  - Status lifecycle:
    - `pending` -> `approved` / `rejected`
  - One active approved payroll record per employee.

- **Dedicated permissions:**
  - `payroll.bank_details.view_all`
  - `payroll.bank_details.manage_all`
  - `payroll.bank_details.view_own`
  - `payroll.bank_details.manage_own`
  - `payroll.bank_details.export`

- **Security controls:**
  - Application-layer encryption via `BANK_DETAILS_ENCRYPTION_KEY`
  - Masked account/sort/IBAN values in UI by default
  - Reveal requires reason and writes audit event
  - Export requires dedicated permission and writes audit event
  - Changes submitted as `pending` until explicit approval

- **Frontend integration:**
  - Admin HR file (`/admin/hr/[userId]`) with all-user payroll workflows
  - Self-service profile (`/profile`) for own view/submit workflows

- **API endpoints:**
  - `/api/payroll/bank-details`
  - `/api/payroll/bank-details/[id]/approve`
  - `/api/payroll/bank-details/[id]/reject`
  - `/api/payroll/bank-details/[id]/reveal`
  - `/api/payroll/bank-details/export`

- **Key rotation readiness:**
  - Script: `scripts/rotate-bank-details-key.mjs`
  - Runbook: `docs/BANK_DETAILS_KEY_ROTATION_RUNBOOK.md`

### 2026-04-15 - National Insurance / Tax code storage (UK)

Implemented encrypted UK tax identity storage with masked defaults, approval workflow, and audited reveal/export controls.

### Features Added

- **Backend model + audit:**
  - New table: `employee_uk_tax_details`
  - New event table: `employee_uk_tax_detail_events`
  - One active approved tax record per employee
  - Status lifecycle: `pending` -> `approved` or `rejected`

- **Dedicated permissions:**
  - `payroll.uk_tax.view_all`
  - `payroll.uk_tax.manage_all`
  - `payroll.uk_tax.view_own`
  - `payroll.uk_tax.manage_own`
  - `payroll.uk_tax.export`

- **Security controls:**
  - Application-layer encryption via `UK_TAX_ENCRYPTION_KEY`
  - NI/tax values masked in default UI
  - Reveal requires reason and writes audit event
  - Export requires dedicated permission and writes audit event
  - Manager/direct-report HR permissions do not grant UK tax access

- **Frontend integration:**
  - Admin HR file (`/admin/hr/[userId]`) with payroll all-user workflows
  - Self-service profile (`/profile`) for own view/manage workflows

- **API endpoints:**
  - `/api/payroll/uk-tax`
  - `/api/payroll/uk-tax/[id]/approve`
  - `/api/payroll/uk-tax/[id]/reject`
  - `/api/payroll/uk-tax/[id]/reveal`
  - `/api/payroll/uk-tax/export`

### 2026-04-15 - P45 / P60 document storage (payroll + finance ready)

Implemented secure payroll tax-document management for P45/P60 records with dedicated permissions, private storage, and org/user scoped access in both admin and self-service experiences.

### Features Added

- **Backend model + storage:**
  - New table: `employee_tax_documents`
  - Private bucket: `employee-tax-documents`
  - Supports:
    - `document_type` (`p45` / `p60`)
    - tax year, issue date, payroll period end
    - finance linkage metadata (`finance_reference`, `wagesheet_id`, `payroll_run_reference`)
    - replacement chain/versioning via `is_current` + `replaced_by_document_id`

- **Dedicated permissions:**
  - `payroll.tax_docs.view_all`
  - `payroll.tax_docs.manage_all`
  - `payroll.tax_docs.view_own`
  - `payroll.tax_docs.upload_own`
  - `payroll.tax_docs.export`

- **Security controls:**
  - Documents are stored in a private Supabase Storage bucket only.
  - Table and storage are both org-scoped and permission-gated via RLS.
  - Self-service access is strictly own-scope and permission driven.
  - File upload policy supports PDF/images with controlled max file size in UI.

- **Frontend integration:**
  - Admin HR file (`/admin/hr/[userId]`) now includes P45/P60 section for payroll/HR workflows.
  - Self-service profile (`/profile`) includes own P45/P60 section when permissioned.
  - Users can open/download signed URLs; managers with manage rights can remove/replace.

- **API endpoint:**
  - `/api/payroll/tax-documents/export` (metadata index export, permission-gated)

### 2026-04-15 - Employment history (previous roles within org)

Implemented organisation employment history timelines for HR/admin and employee self-service, with role-scoped access and manager visibility for direct reports.

### Features Added

- **Backend model + access control:**
  - New table: `employee_employment_history`
  - Timeline fields include:
    - role title, department, team, manager
    - employment type, contract type, FTE, location type
    - start/end dates, change reason, pay grade, salary band, notes
    - source (`manual`, `auto_from_hr_record`, `employee_request`)
  - RLS supports:
    - org-wide view/manage via dedicated employment history permissions
    - direct-report viewing for managers with `hr.view_direct_reports`
    - self-view/self-manage via own-scope employment history permissions

- **Dedicated permissions:**
  - `hr.employment_history.view_all`
  - `hr.employment_history.manage_all`
  - `hr.employment_history.view_own`
  - `hr.employment_history.manage_own`

- **Transactional write RPC:**
  - Added `employee_employment_history_replace(p_user_id, p_history jsonb)` for atomic timeline saves.

- **Frontend integration:**
  - Admin HR file (`/admin/hr/[userId]`):
    - Added employment history section for HR workflows.
  - Self-service profile (`/profile`):
    - Added employment history section for own timeline view/edit when permissioned.

- **Roles matrix UX:**
  - Added Employment History Permission Matrix in `/admin/roles`.

### 2026-04-15 - Disciplinary & grievance record log

Implemented sensitive disciplinary and grievance case logging with lifecycle statuses, scoped visibility, event audit trail, and soft-archive controls.

### Features Added

- **Backend model + audit:**
  - New case table: `employee_case_records`
  - New event table: `employee_case_record_events`
  - Case types:
    - `disciplinary`
    - `grievance`
  - Status lifecycle:
    - `open`, `investigating`, `hearing`, `outcome_issued`, `appeal`, `closed`
  - Soft delete behavior:
    - cases are archived with `archived_at` (no hard-delete workflow)
  - Triggered event log for create/update/status/outcome/archive changes.

- **Dedicated permissions:**
  - `hr.disciplinary.view_all`
  - `hr.disciplinary.manage_all`
  - `hr.disciplinary.view_own`
  - `hr.grievance.view_all`
  - `hr.grievance.manage_all`
  - `hr.grievance.view_own`

- **Security and visibility model:**
  - HR all-access is permission gated by case type.
  - Managers with `hr.view_direct_reports` can view direct report cases.
  - Employees can view own cases when own-scope permissioned.
  - Sensitive fields (internal/investigation details) are shown only in HR all-access contexts.

- **Frontend integration:**
  - Admin HR file (`/admin/hr/[userId]`) includes full case log management.
  - Self-service profile (`/profile`) includes own case visibility (read-only, redacted sensitive notes).
  - Case timeline panel displays recent audit events.

- **Roles matrix UX:**
  - Added Disciplinary & Grievance Permission Matrix in `/admin/roles`.

### 2026-04-15 - Medical / occupational health notes (access controlled)

Implemented encrypted medical and occupational health note records with strict access controls, summary-only self access, audited sensitive reveal, and key rotation tooling.

### Features Added

- **Backend model + audit:**
  - New table: `employee_medical_notes`
  - New event table: `employee_medical_note_events`
  - Sensitive clinical payload encrypted at application layer in `encrypted_sensitive_payload`
  - Soft archive support with `archived_at`
  - Event logging for create/update/archive/reveal/export

- **Dedicated permissions:**
  - `hr.medical_notes.view_all`
  - `hr.medical_notes.manage_all`
  - `hr.medical_notes.view_own_summary`
  - `hr.medical_notes.reveal_sensitive`
  - `hr.medical_notes.export`
  - `hr.medical_notes.manage_own`

- **Security controls:**
  - Encrypted sensitive fields via `MEDICAL_NOTES_ENCRYPTION_KEY`
  - Self-service views are summary/outcome only
  - Sensitive reveal requires explicit reason and audit event
  - Key rotation script/runbook included:
    - `scripts/rotate-medical-notes-key.mjs`
    - `docs/MEDICAL_NOTES_KEY_ROTATION_RUNBOOK.md`

- **Frontend integration:**
  - Admin HR file (`/admin/hr/[userId]`) includes full medical note management
  - Self-service profile (`/profile`) includes summary view and own submissions (if permissioned)
  - Roles page includes Medical Notes Permission Matrix

### 2026-04-15 - Custom HR fields (org-configurable extra fields)

Implemented org-configurable custom HR field definitions with scoped visibility and permissioned value management across admin HR files and self-service profile.

### Features Added

- **Backend model + audit:**
  - New definitions table: `hr_custom_field_definitions`
  - New values table: `hr_custom_field_values`
  - New event table: `hr_custom_field_events`
  - Supports sectioning + field types + visibility flags.
  - Archive fields by toggling `is_active` (values retained).
  - Audit triggers for definition and value changes.

- **Dedicated permissions:**
  - `hr.custom_fields.view`
  - `hr.custom_fields.manage_definitions`
  - `hr.custom_fields.manage_values_all`
  - `hr.custom_fields.manage_values_own`

- **Visibility/access behavior:**
  - HR all-view/manage via dedicated custom-field permissions.
  - Managers can view direct-report values only when definition allows manager visibility.
  - Employees can view/edit own values only when definition allows self visibility and permission is granted.

- **Frontend integration:**
  - Admin HR file (`/admin/hr/[userId]`) includes custom field values editor.
  - Self-service profile (`/profile`) includes self-visible custom field values.
  - New admin definition screen: `/admin/hr/custom-fields`.
  - Roles page includes Custom HR Fields Permission Matrix.

### 2026-04-15 - Data retention & deletion policy enforcement (GDPR right to erasure)

Implemented policy-driven retention and right-to-erasure workflow with review/execute gates, dry-run preview, legal-safe retention exceptions, and auditable execution.

### Features Added

- **Backend model + workflow:**
  - New retention policy table: `privacy_retention_policies`
  - New request table: `privacy_erasure_requests`
  - New audit table: `privacy_erasure_audit_events`
  - Lifecycle status model:
    - `requested` -> `legal_review` -> `approved` / `rejected` -> `executed`

- **Dedicated permissions:**
  - `privacy.retention_policy.view`
  - `privacy.retention_policy.manage`
  - `privacy.erasure_request.create`
  - `privacy.erasure_request.review`
  - `privacy.erasure_request.execute`
  - `privacy.erasure_request.audit_view`

- **Execution + preview functions:**
  - `privacy_erasure_preview(p_erasure_request_id)` returns impact counts by domain and logs preview events.
  - `privacy_erasure_execute(p_erasure_request_id, p_execution_note)` anonymizes/deletes eligible domains and logs execution results.
  - Payroll/tax records are retained under legal-basis exception handling.

- **Frontend integration:**
  - New admin privacy center route: `/admin/privacy`
    - Retention policy management
    - Erasure request queue with review/preview/execute actions
  - Self-service profile includes GDPR erasure request submission panel.
  - Admin HR employee file includes active erasure-request status banner.
  - Roles page includes Privacy & Erasure Permission Matrix.

### 2026-04-15 - Employee record export (CSV/PDF)

Implemented employee record export in CSV/PDF with strict scope permissions, sensitive-field gating by reason, and export audit logging.

### Features Added

- **Backend model + audit:**
  - New event table: `employee_record_export_events`
  - Logs actor, target user, format, sections, sensitive flag, and reason.

- **Dedicated permissions:**
  - `hr.records_export.view_all`
  - `hr.records_export.view_own`
  - `hr.records_export.view_direct_reports`
  - `hr.records_export.include_sensitive`
  - `hr.records_export.generate_pdf`
  - `hr.records_export.generate_csv`

- **Export API:**
  - `/api/hr/records/export`
  - Supports `format=csv|pdf`
  - Scope checks:
    - all users, own user, direct reports
  - Sensitive export requires:
    - `hr.records_export.include_sensitive`
    - explicit `reason`

- **Frontend integration:**
  - Admin HR file (`/admin/hr/[userId]`) has CSV/PDF export actions and sensitive CSV action.
  - Self-service profile (`/profile`) has own CSV/PDF export actions when permissioned.
  - Roles page includes Employee Record Export Permission Matrix.

- **API endpoints:**
  - `/api/privacy/retention-policies`
  - `/api/privacy/erasure-requests`
  - `/api/privacy/erasure-requests/[id]/review`
  - `/api/privacy/erasure-requests/[id]/preview`
  - `/api/privacy/erasure-requests/[id]/execute`

### 2026-04-15 - Stabilization and implementation notes

- **Hydration fix applied:**
  - Fixed date formatting mismatch in `EmployeeHRFileClient` by replacing locale-variant render paths with stable formatting.
- **Migration housekeeping note:**
  - `20260415125719_employment_history_within_org.sql` exists as an empty migration artifact from CLI generation; no schema changes inside it.

### 2026-04-15 - Security hardening follow-up (post audit)

Applied remediation for identified high/medium security gaps across employee records master data.

### Hardening Changes Added

- **Storage RLS tightened (photos, ID docs, tax docs):**
  - Replaced broad org-prefix-only object policies with permission-aware policies.
  - Added owner path checks for self-service uploads.
  - Added object-to-row existence checks for read/update/delete where applicable.

- **Approval workflow atomicity:**
  - Added SQL RPCs:
    - `payroll_approve_bank_detail(p_bank_detail_id, p_review_note)`
    - `payroll_approve_uk_tax_detail(p_uk_tax_detail_id, p_review_note)`
  - Both enforce `status='pending'`, use row locking, deactivate prior active rows, approve target row, and write audit events in one transaction.

- **Sensitive reveal hardening:**
  - Added recent re-auth check in reveal APIs:
    - bank details reveal
    - UK tax reveal
    - medical sensitive reveal
  - Reveal now requires both permission and fresh sign-in.

- **Permission guard bug fix:**
  - Fixed tax document export permission argument (`p_permission_key`) in `/api/payroll/tax-documents/export`.

- **Sensitive export controls improved:**
  - Added anti-cache headers (`Cache-Control: no-store, private`, `Pragma: no-cache`) to payroll bank/tax CSV exports.
  - Replaced static sensitive export reason with runtime required prompt in admin HR UI.

- **GDPR execution control hardening:**
  - `privacy_erasure_execute` now requires `approved` status (no direct execution from `legal_review`).

## Related Migrations

- `20260723151000_employee_photo_id_document_management.sql`
- `20260723152000_employee_document_security_and_expiry_alerts.sql`
- `20260723153000_employee_document_custom_categories.sql`
- `20260723154000_employee_dependants_beneficiaries.sql`
- `20260723155000_payroll_bank_details_secure_storage.sql`
- `20260723161000_payroll_uk_tax_secure_storage.sql`
- `20260723162000_payroll_tax_documents_storage.sql`
- `20260723163000_employee_employment_history.sql`
- `20260723164000_disciplinary_grievance_log.sql`
- `20260723165000_medical_occupational_health_notes.sql`
- `20260723170000_custom_hr_fields_org_configurable.sql`
- `20260723171000_data_retention_erasure_policy.sql`
- `20260723172000_employee_record_export_csv_pdf.sql`
- `20260724123000_employee_records_security_hardening.sql`
- `20260415125719_employment_history_within_org.sql` (empty placeholder migration file)

## Frontend Access + Required Permissions

### 1) HR/Admin employee file (full document management)

- **Route:** `/admin/hr/[userId]`
- **Use case:** HR/managers manage an employee's HR record and documents (photo, ID, supporting docs, custom categories).

#### Access gates

- Page visibility:
  - `hr.view_records` **or** `hr.view_direct_reports`
- Edit HR record fields:
  - `hr.manage_records`

#### Document permissions (on this page)

- Employee photos:
  - View all photos: `hr.employee_photo.view_all` (or `hr.employee_photo.manage_all`)
  - Upload/replace/delete for any employee: `hr.employee_photo.manage_all`
- ID documents:
  - View all IDs: `hr.id_document.view_all` (or `hr.id_document.manage_all`)
  - Upload/replace/delete for any employee: `hr.id_document.manage_all`
- Supporting documents (contract/RTW/other):
  - Upload/delete: `hr.manage_records`
  - Read scope follows HR view permissions

#### Custom category controls

- View category list: HR view-level access (`hr.view_own` / `hr.view_direct_reports` / `hr.view_records` via RLS)
- Create/update/delete category: `hr.manage_records`

---

### 2) Employee self-service profile (own docs only)

- **Route:** `/profile`
- **Section:** Training, documents, certifications & notes (with self document widget)

#### Access gates

- Profile page base gate:
  - `hr.view_own`

#### Own photo permissions

- View/download own photo: `hr.employee_photo.view_own`
- Upload/replace own photo: `hr.employee_photo.upload_own`
- Delete own photo: `hr.employee_photo.delete_own`

#### Own ID permissions

- View/download own ID docs: `hr.id_document.view_own`
- Upload own ID docs: `hr.id_document.upload_own`
- Delete own ID docs: `hr.id_document.delete_own`

---

### 2b) Dependants / beneficiaries access

- **Admin HR file route:** `/admin/hr/[userId]`
  - View dependants:
    - `hr.view_records` (org-wide) or `hr.view_direct_reports` (direct reports)
  - Edit dependants for any employee:
    - `hr.manage_records`

- **Self-service route:** `/profile`
  - View/manage own dependants:
    - self-scope with `hr.view_own`

---

### 2c) Bank details (payroll) access

- **Admin HR file route:** `/admin/hr/[userId]`
  - View masked bank details:
    - `payroll.bank_details.view_all`
  - Submit/approve/reject/activate records:
    - `payroll.bank_details.manage_all`
  - Export decrypted payroll CSV:
    - `payroll.bank_details.export`

- **Self-service route:** `/profile`
  - View own masked details:
    - `payroll.bank_details.view_own`
  - Submit own changes (pending approval):
    - `payroll.bank_details.manage_own`

- **Security behavior**
  - Bank payload is stored encrypted.
  - UI is masked by default.
  - Reveal action requires reason and writes audit event.
  - Export action writes audit event.
  - Changes are submitted as `pending` and only become active after explicit approval.
  - Key rotation runbook/script added for go-live readiness:
    - `docs/BANK_DETAILS_KEY_ROTATION_RUNBOOK.md`
    - `scripts/rotate-bank-details-key.mjs`

---

### 2d) UK NI / Tax code access

- **Admin HR file route:** `/admin/hr/[userId]`
  - View masked UK tax details:
    - `payroll.uk_tax.view_all`
  - Submit/approve/reject/activate:
    - `payroll.uk_tax.manage_all`
  - Export decrypted UK tax payroll CSV:
    - `payroll.uk_tax.export`

- **Self-service route:** `/profile`
  - View own masked UK tax details:
    - `payroll.uk_tax.view_own`
  - Submit own change (pending approval):
    - `payroll.uk_tax.manage_own`

---

### 2e) P45 / P60 tax document access

- **Admin HR file route:** `/admin/hr/[userId]`
  - View employee P45/P60 docs:
    - `payroll.tax_docs.view_all`
  - Upload/replace/remove employee P45/P60 docs:
    - `payroll.tax_docs.manage_all`
  - Export tax-doc index CSV:
    - `payroll.tax_docs.export`

- **Self-service route:** `/profile`
  - View/download own P45/P60 docs:
    - `payroll.tax_docs.view_own`
  - Upload/remove own P45/P60 docs:
    - `payroll.tax_docs.upload_own`

---

### 2f) Employment history access

- **Admin HR file route:** `/admin/hr/[userId]`
  - View employee employment history:
    - `hr.employment_history.view_all`
  - Create/edit/delete employee employment history:
    - `hr.employment_history.manage_all`
  - Manager visibility of direct reports:
    - supported through `hr.view_direct_reports` in RLS

- **Self-service route:** `/profile`
  - View own employment history:
    - `hr.employment_history.view_own`
  - Manage own employment history:
    - `hr.employment_history.manage_own`

---

### 2g) Disciplinary & grievance records access

- **Admin HR file route:** `/admin/hr/[userId]`
  - View disciplinary cases (all):
    - `hr.disciplinary.view_all`
  - Manage disciplinary cases:
    - `hr.disciplinary.manage_all`
  - View grievance cases (all):
    - `hr.grievance.view_all`
  - Manage grievance cases:
    - `hr.grievance.manage_all`
  - Manager direct-report visibility:
    - supported via `hr.view_direct_reports` (limited visibility context)

- **Self-service route:** `/profile`
  - View own disciplinary cases:
    - `hr.disciplinary.view_own`
  - View own grievance cases:
    - `hr.grievance.view_own`

---

### 2h) Medical / occupational health notes access

- **Admin HR file route:** `/admin/hr/[userId]`
  - View all medical/OH summaries:
    - `hr.medical_notes.view_all`
  - Create/update/archive records:
    - `hr.medical_notes.manage_all`
  - Reveal encrypted clinical payload:
    - `hr.medical_notes.reveal_sensitive` (reason required, audited)

- **Self-service route:** `/profile`
  - View own summary/outcome fields:
    - `hr.medical_notes.view_own_summary`
  - Submit/manage own medical referrals:
    - `hr.medical_notes.manage_own`

---

### 2i) Custom HR fields access

- **Admin config route:** `/admin/hr/custom-fields`
  - View custom field config:
    - `hr.custom_fields.view`
  - Create/update/archive field definitions:
    - `hr.custom_fields.manage_definitions`

- **Admin HR file route:** `/admin/hr/[userId]`
  - View custom field values:
    - `hr.custom_fields.view`
  - Manage values for any employee:
    - `hr.custom_fields.manage_values_all`

- **Self-service route:** `/profile`
  - Manage own values (self-visible fields only):
    - `hr.custom_fields.manage_values_own`

---

### 2j) Privacy retention & erasure access

- **Admin privacy route:** `/admin/privacy`
  - View retention policies:
    - `privacy.retention_policy.view`
  - Manage retention policies:
    - `privacy.retention_policy.manage`
  - Review erasure requests:
    - `privacy.erasure_request.review`
  - Execute approved erasure:
    - `privacy.erasure_request.execute`
  - View erasure audit log:
    - `privacy.erasure_request.audit_view`

- **Self-service route:** `/profile`
  - Submit erasure request:
    - `privacy.erasure_request.create`

---

### 2k) Employee record export access

- **Admin HR file route:** `/admin/hr/[userId]`
  - Export any employee record:
    - `hr.records_export.view_all`
  - Export direct report records:
    - `hr.records_export.view_direct_reports`
  - CSV export:
    - `hr.records_export.generate_csv`
  - PDF export:
    - `hr.records_export.generate_pdf`
  - Include sensitive fields:
    - `hr.records_export.include_sensitive` + reason

- **Self-service route:** `/profile`
  - Export own record:
    - `hr.records_export.view_own`
  - CSV/PDF generation as allowed by format permissions

---

### 3) Roles and permission matrix visibility

- **Route:** `/admin/roles`
- **Components:**
  - Employee Document Permission Matrix
  - Payroll Tax Document Permission Matrix
  - Employment History Permission Matrix
  - Disciplinary & Grievance Permission Matrix
  - Medical Notes Permission Matrix
  - Custom HR Fields Permission Matrix
  - Privacy & Erasure Permission Matrix

#### Access gates

- View roles page/matrix:
  - `roles.view`
- Manage/modify role permissions:
  - `roles.manage`

---

### 4) HR metric notifications (ID expiry alerts)

- **Route:** `/notifications/hr-metrics`
- **What appears:** Includes `id_document_expiry` alerts (expiring soon / expired)

#### Access model

- No extra page-level permission check beyond active org membership.
- Notification rows are RLS-scoped to recipient.
- Recipients are generated by backend runners:
  - HR viewers (`hr.view_records`)
  - Employee line managers (where applicable)

## Next Suggested Items

- Expose reusable custom categories in employee self-service upload UI.
- Add a compact HR dashboard summary widget for:
  - ID docs expiring in 30 days
  - ID docs already expired
- Add category management screen (rename/archive categories with usage count).
- Add scheduled retention runner (daily policy enforcement by domain).
