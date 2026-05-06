# CampSite HR System Audit

> Audit date: 2026-04-15  
> Scope: Full HR module review  what is built, what is partial, what is missing entirely.

---

## Legend

- `[x]`  Implemented & functional  
- `[~]`  Partially implemented / needs work  
- `[ ]`  Missing / not yet built  

---

## 1. Employee Records & Master Data

- [x] Employee HR record creation (contracts, addresses, RTW fields, pay fields)
- [x] Employment type, job title, start date, end date stored
- [x] Right to Work (RTW) document tracking
- [x] Contract type fields (permanent, fixed-term, casual, etc.)
- [x] Employee address fields
- [x] Pay rate / salary fields
- [x] Extended workforce fields (emergency contacts, extended profile data)
- [x] HR document upload & management (contracts, signed docs)
- [x] HR document audit events (who uploaded/viewed/changed what)
- [x] Admin HR file view per employee (`/admin/hr/[userId]`)
- [x] Employee self-view of own HR record (`/hr/records/[userId]`)
- [x] HR directory / employee list with quick view modal
- [ ] Employee photo / ID document management
- [ ] Dependants / beneficiary information
- [ ] Next of kin fields (distinct from emergency contact)
- [ ] Bank details storage (for payroll)
- [ ] National Insurance / Tax code storage (UK)
- [ ] P45 / P60 document storage
- [ ] Employment history (previous roles within org)
- [ ] Disciplinary & grievance record log
- [ ] Medical / occupational health notes (with access controls)
- [ ] Custom HR fields (org-configurable extra fields)
- [ ] Data retention & deletion policy enforcement (GDPR right to erasure)
- [ ] Employee record export (CSV/PDF)

---

## 2. Leave Management

- [x] Annual leave requests (creation, approval, rejection)
- [x] Leave allowance per employee
- [x] Auto-prorate leave entitlement (start date based)
- [x] Overlapping leave prevention (DB constraint)
- [x] Working days configuration per org (Mon–Fri, Mon–Sat, etc.)
- [x] TOIL (Time Off In Lieu) credit requests
- [x] UK Statutory Sick Pay (SSP) weekly calculation
- [x] Leave notifications (approver notified, employee notified)
- [x] HR leave management view (`/hr/leave`)
- [x] Leave probation check (block leave during probation)
- [x] Approved leave edit/cancel window
- [x] Leave org settings (default entitlement, working days)
- [ ] Half-day leave requests
- [ ] Leave carry-over rules (max days rolled to next year)
- [ ] Leave encashment (pay out unused leave)
- [ ] Multiple leave types (parental, bereavement, compassionate, study, unpaid)
- [ ] Parental leave workflows (maternity/paternity/adoption/shared parental)
- [ ] Public / bank holiday calendar integration (auto-excluded from leave count)
- [ ] Leave calendar view (team absence calendar showing who is off)
- [ ] Leave balance dashboard (employee: how many days left)
- [ ] Manager leave approval dashboard (approve/reject in bulk)
- [ ] Leave accrual rules (accrue per month worked)
- [ ] Leave request supporting documents (e.g. fit note upload)
- [ ] Bradford Factor threshold triggers on leave (not just sickness)
- [ ] International leave law configurations (beyond UK)
- [ ] Leave reporting / analytics (leave usage trends, high absence employees)

---

## 3. Absence & Sickness

- [x] Sickness absence recording
- [x] Bradford Factor calculation (`/lib/leave/bradford.ts`)
- [x] Bradford Factor absence reporting view (`/hr/absence-reporting`)
- [x] Admin absence management view (`/admin/hr/absence-reporting`)
- [ ] Return-to-work interview workflow (trigger after absence)
- [ ] Self-certification form (short illness < 7 days)
- [ ] Fit note / medical certificate upload
- [ ] Bradford Factor threshold alerts (auto-notify HR when score exceeds limit)
- [ ] Long-term sickness case management
- [ ] Absence trends report (dept-level, org-level)
- [ ] Occupational health referral workflow
- [ ] Absence reason categorisation (illness, injury, hospital, dental, etc.)

---

## 4. Attendance & Timesheets

- [x] Clock in / clock out (`/attendance`)
- [x] Attendance events stored in DB
- [x] Weekly timesheet summaries
- [x] Timesheet review workflow (`TimesheetReviewClient`)
- [x] Wagesheet lines / payroll prep (`WagesheetsClient`)
- [x] Manager payroll view grant
- [x] Work sites tracking
- [x] Attendance settings per org
- [x] HR timesheets admin view (`/hr/timesheets`)
- [x] HR wagesheets admin view (`/hr/wagesheets`)
- [ ] Overtime rules and calculation
- [ ] Break time deduction rules
- [ ] Flex-time / compressed hours tracking
- [ ] Timesheet dispute / amendment request workflow
- [ ] Timesheet export to payroll (CSV, BACS file, Xero/Sage/QuickBooks)
- [ ] Mobile clock-in with GPS / geofence validation
- [ ] Late arrival / early departure alerts
- [ ] Zero-hours contract hour tracking & reporting
- [ ] Agency / contractor hours tracking
- [ ] Attendance analytics dashboard (punctuality, patterns)

---

## 5. Payroll

- [x] Wagesheet line items (pay data preparation)
- [x] Manager payroll view (read access)
- [ ] UK PAYE tax calculation (income tax, NI deductions)
- [ ] Pension auto-enrolment (UK workplace pension compliance)
- [ ] Pay slip generation (PDF per employee per pay period)
- [ ] Payroll export to external systems (Xero, Sage, QuickBooks, BACS)
- [ ] Multiple pay frequencies (weekly, bi-weekly, monthly)
- [ ] Statutory pay calculations (SSP already done, add SMP/SPP/SAP)
- [ ] Expense claim submission & approval
- [ ] Expense reimbursement tracking
- [ ] Salary review & pay band management
- [ ] Payroll audit log (who ran payroll, what changed)
- [ ] RTI (Real-Time Information) HMRC submission
- [ ] P60 / P45 generation at year end / leaving

---

## 6. Performance Reviews

- [x] Performance review creation
- [x] Review cycles (define review periods)
- [x] Review goals
- [x] Reviewer assignment with permission enforcement
- [x] Admin performance hub (`/admin/hr/performance`)
- [x] Performance cycle detail view (`/admin/hr/performance/[cycleId]`)
- [x] Employee performance view (`/performance`)
- [x] Review detail view (`/performance/[reviewId]`)
- [ ] 360-degree review (peer feedback, upward feedback, self-assessment)
- [ ] Rating scales / scoring rubrics (configurable)
- [ ] Review templates (customisable question sets per role/level)
- [ ] Mid-year check-in (lightweight review between cycles)
- [ ] Performance improvement plan (PIP) workflow
- [ ] Calibration workflow (manager calibrates ratings across team)
- [ ] Competency framework mapping
- [ ] Skills & development plan linked to review
- [ ] Review sign-off (employee acknowledges review)
- [ ] Historical review archive per employee
- [ ] Performance analytics (org-wide rating distribution, trends)
- [ ] Automated review reminders (nudge reviewer/reviewee before deadline)

---

## 7. Onboarding

- [x] Onboarding templates (checklist templates)
- [x] Onboarding template tasks
- [x] Onboarding run creation (per employee)
- [x] Onboarding run task progress tracking
- [x] Admin onboarding hub (`/admin/hr/onboarding`)
- [x] Onboarding run detail view (`/admin/hr/onboarding/[runId]`)
- [x] Employee onboarding view (`/onboarding`)
- [ ] Offboarding templates & workflows (distinct from onboarding)
- [ ] Pre-boarding (tasks before day 1, e.g. send equipment, IT setup)
- [ ] Task assignment to specific owners (not just employee)
- [ ] Due dates / SLA on onboarding tasks
- [ ] Onboarding task notifications / reminders
- [ ] IT system provisioning checklist integration
- [ ] Equipment handover form / asset assignment
- [ ] Policy acknowledgement within onboarding (sign off on handbook)
- [ ] Buddy / mentor assignment during onboarding
- [ ] Probation period tracker linked to onboarding completion
- [ ] Onboarding completion report / time-to-productivity metrics
- [ ] Re-onboarding / role transfer workflows (internal moves)

---

## 8. One-on-Ones & Check-ins

- [x] 1:1 meeting scheduling
- [x] 1:1 templates
- [x] 1:1 pair settings (manager–report configuration)
- [x] Meeting notes (collaborative editing, note edit requests)
- [x] Overdue nudge notifications
- [x] Meeting reminders
- [x] Calendar integration for 1:1 meetings
- [x] HR compliance tracking (`HrOneOnOneComplianceClient`)
- [x] Org 1:1 settings
- [ ] Action items / follow-up tasks from 1:1s
- [ ] 1:1 agenda templates (shareable pre-meeting agenda)
- [ ] Private vs shared notes (employee can mark notes private)
- [ ] 1:1 frequency enforcement (org-mandated cadence)
- [ ] 1:1 analytics (how many overdue, completion rate by manager)
- [ ] External calendar sync for 1:1 (Google Calendar two-way sync)

---

## 9. Recruitment & Hiring

- [x] Recruitment requests (hiring approval workflow)
- [x] Job listings (create, edit, publish)
- [x] Public job portal (candidate-facing listings)
- [x] Candidate applications
- [x] Application pipeline / status management
- [x] Candidate messaging (in-app)
- [x] Internal application notes
- [x] Interview slot creation with panelists
- [x] Google Calendar integration for interviews
- [x] Offer letter templates
- [x] Offer letter generation (PDF)
- [x] Offer sign-off (candidate signs via public token)
- [x] Recruitment & application notifications
- [x] Candidate profiles
- [x] Application rate limiting
- [x] Public job listing metrics
- [ ] CV / resume parsing
- [ ] Application scoring / scoring rubric
- [ ] Multi-stage pipeline (configurable stages: applied, screen, interview, offer)
- [ ] Bulk application actions (bulk reject, bulk move stage)
- [ ] Interview feedback forms (structured feedback per interviewer)
- [ ] Interview scorecards
- [ ] Background check initiation workflow
- [ ] Reference request workflow
- [ ] Right to Work verification in recruitment flow (pre-employment check)
- [ ] Candidate portal account management (password change, profile edit)
- [ ] Job posting to external boards (Indeed, LinkedIn, etc.)
- [ ] Equal opportunities monitoring data (diversity data, kept separate)
- [ ] Recruitment analytics (time to hire, source of hire, funnel conversion)
- [ ] Internal job posting / internal mobility
- [ ] Headcount planning linked to org structure

---

## 10. Org Chart & Reporting Lines

- [x] Reports-to hierarchy (`profiles.reports_to_user_id`)
- [x] Org chart view (`/hr/org-chart` and `/admin/hr/org-chart`)
- [x] Admin management of reporting lines
- [ ] Org chart export (PDF / PNG)
- [ ] Historical org chart (snapshot at a point in time)
- [ ] Interim / acting roles visualised on chart
- [ ] Dotted-line / matrix reporting relationships
- [ ] Headcount view on org chart (vacancies shown)
- [ ] Org chart filtering (by department, location, level)

---

## 11. HR Notifications & Alerts

- [x] Leave notifications
- [x] Recruitment notifications
- [x] Application notifications
- [x] HR metric notifications
- [x] HR metric alert configuration per org
- [x] EQ monitoring with cron evaluators
- [x] Metric notifications hub (`/notifications/hr-metrics`)
- [ ] Employee milestone alerts (birthdays, work anniversaries)
- [ ] Contract expiry alerts (fixed-term contracts approaching end)
- [ ] Probation end date alerts
- [ ] Visa / right-to-work expiry alerts
- [ ] Certification / training expiry alerts
- [ ] High Bradford Factor threshold alerts
- [ ] Headcount change alerts (new starters, leavers)
- [ ] Configurable notification recipients (HR team vs line manager)

---

## 12. RBAC & Permissions (HR-specific)

- [x] Predefined system roles (admin, manager, HR, employee etc.)
- [x] Custom roles with configurable permissions
- [x] Permission catalog
- [x] User permission overrides (grant/deny individual permissions)
- [x] Rank-based role assignment (can't assign above your own rank)
- [x] HR-specific permission enforcement on performance reviews
- [x] Manager payroll view grant
- [ ] Sensitive data field-level permissions (e.g. salary visible only to HR)
- [ ] Document-level access control (who can view which HR documents)
- [ ] HR data access audit log (who viewed whose record and when)
- [ ] Data access request workflow (employee requests own data  GDPR SAR)

---

## 13. Reporting & Analytics

- [x] HR metric alerts (Bradford, EQ)
- [ ] Headcount report (current staff, starters, leavers by period)
- [ ] Turnover / attrition report
- [ ] Absence analytics (total days lost, cost of absence)
- [ ] Leave usage report (by employee, department, type)
- [ ] Performance rating distribution report
- [ ] Recruitment funnel report (time to hire, offer acceptance rate)
- [ ] Payroll cost report
- [ ] Diversity & inclusion report (opt-in demographic data)
- [ ] Training completion report
- [ ] Onboarding completion report
- [ ] Custom report builder (configurable columns / filters)
- [ ] Scheduled report emails (automated HR report delivery)
- [ ] Data export (CSV/XLSX for any report)

---

## 14. Employee Self-Service

- [x] Employee leave request submission
- [x] Employee attendance / clock in-out
- [x] Employee onboarding task completion
- [x] Employee 1:1 meeting participation
- [x] Employee performance review (view/respond)
- [x] Employee HR record self-view
- [x] Employee profile management
- [ ] Employee update own contact / address details (with HR approval workflow)
- [ ] Employee view own pay slips
- [ ] Employee view own payroll / tax summary
- [ ] Employee submit expense claims
- [ ] Employee acknowledge policy documents
- [ ] Employee update emergency contacts
- [ ] Employee update bank details (with secure workflow)
- [ ] Employee request references

---

## 15. Compliance & Legal

- [x] UK SSP calculations
- [x] Bradford Factor (UK absence management standard)
- [x] Data processing agreement page
- [x] Terms of service & privacy policy
- [x] Platform legal settings
- [ ] GDPR data subject access request (SAR) workflow
- [ ] Right to erasure (deletion request) workflow
- [ ] Data retention policy enforcement (auto-purge after X years)
- [ ] Employment contract digital signature workflow (not just upload)
- [ ] Policy version control (know who signed which version)
- [ ] Working Time Regulations tracking (48-hour week opt-out, rest breaks)
- [ ] Holiday pay calculation (includes commission / overtime  post-Bear Scotland)
- [ ] IR35 / off-payroll worker determination workflow
- [ ] Auto-enrolment pension compliance tracking
- [ ] Equality Act reasonable adjustments log
- [ ] Disclosure & Barring Service (DBS) check tracking

---

## 16. Integrations

- [x] Google OAuth (calendar, Sheets)
- [x] Google Calendar (rota shifts, interviews, 1:1 meetings)
- [x] Google Sheets (rota import)
- [x] Supabase Edge Functions (7 deployed: notifications, discount verification, etc.)
- [x] Push notifications (Expo, mobile)
- [ ] Payroll system integration (Xero, Sage, QuickBooks, BrightPay)
- [ ] Pension provider integration (NEST, Peoples Pension, etc.)
- [ ] HMRC RTI submission API
- [ ] Slack / Teams notifications for HR events
- [ ] HRIS data import (bulk employee upload from CSV/spreadsheet)
- [ ] SSO / SAML (enterprise single sign-on)
- [ ] Background check provider (e.g. Veritas, Credence, etc.)
- [ ] Occupational health provider referral integration
- [ ] Learning Management System (LMS) integration
- [ ] Job board integrations (Indeed, LinkedIn, Reed)

---

## 17. Mobile App (HR Parity)

- [x] HR portal on mobile (`/(tabs)/hr`)
- [x] Leave requests on mobile
- [x] Attendance clock in/out on mobile
- [x] Onboarding on mobile
- [x] One-on-ones on mobile
- [x] Performance reviews on mobile
- [x] Broadcasts, rota, calendar, discount on mobile
- [x] Offline support (React Query persistence, AsyncStorage)
- [ ] Mobile HR manager approval actions (approve leave on mobile)
- [ ] Mobile push notification deep links into HR screens
- [ ] Mobile biometric clock-in (face/fingerprint for attendance)
- [ ] Mobile GPS-based clock-in validation

---

## 18. Platform & Infrastructure Gaps

- [x] Multi-tenancy with RLS
- [x] Org slug / subdomain routing
- [x] Subscription gating (org-locked, trial-ended states)
- [x] Founder/platform admin portal
- [ ] PWA (manifest exists, service worker not active  noted in DEPLOY.md)
- [ ] Content-Security-Policy header (noted as missing in DEPLOY.md)
- [ ] Email delivery system (currently using Supabase email  production email provider not confirmed)
- [ ] In-app notification inbox (bell icon + unread count  notification hubs exist but no unified inbox)
- [ ] Audit log UI (HR data access events viewable by admin)
- [ ] Multi-language / i18n support
- [ ] Accessibility audit (WCAG 2.1 AA compliance)

---

## Priority Summary

### High Priority (Core HR compliance gaps)
- [ ] Public / bank holiday calendar integration
- [ ] Multiple leave types (parental, bereavement, unpaid, etc.)
- [ ] Leave balance dashboard (employee self-service)
- [ ] Return-to-work interview workflow
- [ ] Bradford Factor threshold alerts (auto HR notification)
- [ ] Contract expiry & probation end date alerts
- [ ] Pay slip generation
- [ ] GDPR SAR / right-to-erasure workflows
- [ ] Sensitive field-level permissions (salary visibility)
- [ ] HR data access audit log

### Medium Priority (Feature completeness)
- [ ] 360-degree performance reviews
- [ ] Performance improvement plan (PIP) workflow
- [ ] Offboarding workflows
- [ ] Expense claims
- [ ] Headcount / turnover reporting
- [ ] Interview scorecards / structured feedback
- [ ] Employee self-service address / contact update

### Lower Priority (Nice to have / advanced)
- [ ] Payroll system export integrations
- [ ] UK PAYE / pension auto-enrolment calculations
- [ ] Custom report builder
- [ ] LMS integration
- [ ] Job board integrations
- [ ] Org chart export
- [ ] Competency frameworks
- [ ] Succession planning

---

## 19. Security Audit Log (Employee Records & Master Data) - 2026-04-15

Scope reviewed:
- Employee documents (photos, ID docs, tax docs) storage and table RLS
- Payroll bank details and UK tax APIs (submit/approve/reject/reveal/export)
- Medical notes reveal flow
- Privacy retention and erasure workflow
- Employee record export (CSV/PDF)

### Critical / High Risk Findings

- [ ] **Tax documents export permission check bug (denies correct RBAC path):**
  `apps/web/src/app/api/payroll/tax-documents/export/route.ts` calls `has_permission` with `p_permission` instead of `p_permission_key`.
  - Impact: permission check may fail unexpectedly (or rely on function argument fallback), breaking authorization correctness.
  - Required fix: use `p_permission_key: 'payroll.tax_docs.export'`.

- [ ] **Over-broad storage write/delete RLS on employee photo and ID buckets:**
  `supabase/migrations/20260723151000_employee_photo_id_document_management.sql` storage policies for insert/update/delete only check org prefix.
  - Impact: any authenticated org member can upload/overwrite/delete objects in `employee-photos` and `employee-id-documents` if they know paths.
  - Required fix: enforce permission-based checks in storage policies (manage_all or own upload/delete), and ensure object path ownership validation.

- [ ] **Over-broad storage write/delete RLS on employee tax document bucket:**
  `supabase/migrations/20260723162000_payroll_tax_documents_storage.sql` insert/update/delete policies allow any authenticated user in-org.
  - Impact: unauthorized users can mutate/remove tax files at storage layer.
  - Required fix: tie storage write/delete policies to `employee_tax_documents` row existence + `payroll.tax_docs.manage_all` or own upload permission.

### Medium Risk Findings

- [ ] **Sensitive reveal endpoints do not enforce step-up re-auth:**
  `apps/web/src/app/api/payroll/bank-details/[id]/reveal/route.ts` and `apps/web/src/app/api/payroll/uk-tax/[id]/reveal/route.ts` require reason but no step-up/auth freshness gate.
  - Impact: session hijack risk window for decrypted PII access.
  - Required fix: add step-up check (recent password/OAuth re-auth or signed challenge token) before returning decrypted payload.

- [ ] **Approval endpoints are non-transactional and status-agnostic:**
  Bank and UK tax approve routes deactivate current active rows before final update and do not enforce current status=`pending`.
  - Impact: race conditions can leave no active record or allow re-approving non-pending rows.
  - Required fix: move approval logic to a single SQL RPC with row locking + status preconditions + atomic commit.

- [ ] **Sensitive exports missing anti-cache headers on dedicated payroll exports:**
  `apps/web/src/app/api/payroll/bank-details/export/route.ts` and `apps/web/src/app/api/payroll/uk-tax/export/route.ts` do not set `Cache-Control: no-store`.
  - Impact: sensitive CSV responses may be cached by intermediaries or browsers.
  - Required fix: add `Cache-Control: no-store, private` and `Pragma: no-cache`.

- [ ] **Sensitive export reason is static in HR UI link:**
  `apps/web/src/app/(main)/admin/hr/[userId]/page.tsx` uses fixed reason query `reason=HR audit` for sensitive export.
  - Impact: weak audit quality and no user intent confirmation at export time.
  - Required fix: prompt for reason per export action and POST to export endpoint with validated reason.

### Low Risk / Hardening Gaps

- [ ] **One-time signed download pattern not yet implemented for exports:**
  Exports are direct endpoint responses.
  - Impact: acceptable for internal MVP but below target control level in original requirements.
  - Required fix: issue short-lived signed token/URL and enforce single-use downloads.

- [ ] **Erasure execution allows `legal_review` status directly:**
  `privacy_erasure_execute` permits execution when status in (`approved`, `legal_review`).
  - Impact: process control gap versus strict approval-first governance.
  - Required fix: require `approved` only, or add explicit dual-control policy for legal review execution.

### Positive Controls Confirmed

- [x] Application-layer encryption present for bank details, UK tax, and medical sensitive payloads.
- [x] Audit event tables and write paths exist for reveal/export/approval/rejection flows.
- [x] Core table-level RLS exists across new employee-record domains.
- [x] Retention/erasure preview+execute flow implemented with audit logging.

### Recommended Immediate Remediation Plan

1. Patch the tax-doc export permission argument bug.
2. Tighten storage object policies for `employee-photos`, `employee-id-documents`, and `employee-tax-documents`.
3. Convert bank/UK-tax approval flows into atomic SQL RPC transactions.
4. Enforce step-up auth for reveal endpoints.
5. Add no-store headers + per-action reason prompts for all sensitive exports.
