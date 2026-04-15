import {
  currentLeaveYearKeyForOrgCalendar,
  currentLeaveYearKeyUtc,
  formatLeaveYearPeriodRange,
} from '@/lib/datetime';
import { createClient } from '@/lib/supabase/server';
import { EmployeeSelfDocumentsClient } from '@/components/profile/EmployeeSelfDocumentsClient';
import { DependantsEditorClient } from '@/components/hr/DependantsEditorClient';
import { BankDetailsClient } from '@/components/hr/BankDetailsClient';
import { CustomHrFieldsValuesClient } from '@/components/hr/CustomHrFieldsValuesClient';
import { DisciplinaryGrievanceLogClient } from '@/components/hr/DisciplinaryGrievanceLogClient';
import { EmploymentHistoryClient } from '@/components/hr/EmploymentHistoryClient';
import { MedicalNotesClient } from '@/components/hr/MedicalNotesClient';
import { PrivacySelfRequestClient } from '@/components/privacy/PrivacySelfRequestClient';
import { TaxDocumentsClient } from '@/components/hr/TaxDocumentsClient';
import { UkTaxDetailsClient } from '@/components/hr/UkTaxDetailsClient';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getDisplayName } from '@/lib/names';

function labelContract(value: string | null) {
  if (value === 'full_time') return 'Full-time';
  if (value === 'part_time') return 'Part-time';
  if (value === 'contractor') return 'Contractor';
  if (value === 'zero_hours') return 'Zero hours';
  return '—';
}

function labelLocation(value: string | null) {
  if (value === 'office') return 'Office';
  if (value === 'remote') return 'Remote';
  if (value === 'hybrid') return 'Hybrid';
  return '—';
}

const sectionLink =
  'rounded-full border border-[#e4e4e4] bg-[#faf9f6] px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#f0efe9]';

export default async function MyProfilePage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status, full_name, preferred_name, email, avatar_url, role, reports_to_user_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;
  const { data: canViewOwn } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'hr.view_own',
    p_context: {},
  });
  if (!canViewOwn) redirect('/dashboard');

  const { data: canPerf } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'performance.view_own',
    p_context: {},
  });
  const [
    { data: canViewPhotoOwn },
    { data: canUploadPhotoOwn },
    { data: canDeletePhotoOwn },
    { data: canViewIdOwn },
    { data: canUploadIdOwn },
    { data: canDeleteIdOwn },
    { data: canBankViewOwn },
    { data: canBankManageOwn },
    { data: canBankExport },
    { data: canUkTaxViewOwn },
    { data: canUkTaxManageOwn },
    { data: canUkTaxExport },
    { data: canTaxDocsViewOwn },
    { data: canTaxDocsUploadOwn },
    { data: canTaxDocsExport },
    { data: canEmploymentHistoryViewOwn },
    { data: canEmploymentHistoryManageOwn },
    { data: canDisciplinaryViewOwn },
    { data: canGrievanceViewOwn },
    { data: canMedicalViewOwnSummary },
    { data: canMedicalManageOwn },
    { data: canCustomFieldsView },
    { data: canCustomFieldsManageOwn },
    { data: canPrivacyErasureCreate },
    { data: canRecordExportOwn },
    { data: canRecordExportCsv },
    { data: canRecordExportPdf },
  ] = await Promise.all([
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.employee_photo.view_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.employee_photo.upload_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.employee_photo.delete_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.id_document.view_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.id_document.upload_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.id_document.delete_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.bank_details.view_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.bank_details.manage_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.bank_details.export', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.uk_tax.view_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.uk_tax.manage_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.uk_tax.export', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.tax_docs.view_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.tax_docs.upload_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'payroll.tax_docs.export', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.employment_history.view_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.employment_history.manage_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.disciplinary.view_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.grievance.view_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.medical_notes.view_own_summary', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.medical_notes.manage_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.custom_fields.view', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.custom_fields.manage_values_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'privacy.erasure_request.create', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.records_export.view_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.records_export.generate_csv', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: user.id, p_org_id: orgId, p_permission_key: 'hr.records_export.generate_pdf', p_context: {} }),
  ]);

  const [{ data: leaveSettingsForYear }, { data: orgForTz }] = await Promise.all([
    supabase
      .from('org_leave_settings')
      .select('leave_year_start_month, leave_year_start_day')
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase.from('organisations').select('timezone').eq('id', orgId).maybeSingle(),
  ]);

  const orgTz = (orgForTz?.timezone as string | null) ?? null;
  const sm = Number(leaveSettingsForYear?.leave_year_start_month ?? 1);
  const sd = Number(leaveSettingsForYear?.leave_year_start_day ?? 1);
  const profileLeaveYearKey = orgTz
    ? currentLeaveYearKeyForOrgCalendar(new Date(), orgTz, sm, sd)
    : currentLeaveYearKeyUtc(new Date(), sm, sd);

  const [
    fileRows,
    allowanceRow,
    annualApprovedRes,
    udRes,
    directReportsRes,
    onboardingCountRes,
    probationAlertsRes,
    ownDocsRes,
    ownDependantsRes,
    ownBankRowsRes,
    ownUkTaxRowsRes,
    ownTaxDocsRes,
    ownEmploymentHistoryRes,
    ownCaseRowsRes,
    ownCaseEventRowsRes,
    ownMedicalRowsRes,
    ownMedicalEventsRes,
    ownCustomFieldDefsRes,
    ownCustomFieldValuesRes,
  ] = await Promise.all([
    supabase.rpc('hr_employee_file', { p_user_id: user.id }),
    supabase
      .from('leave_allowances')
      .select('annual_entitlement_days, toil_balance_days')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .eq('leave_year', profileLeaveYearKey)
      .maybeSingle(),
    supabase
      .from('leave_requests')
      .select('start_date, end_date')
      .eq('org_id', orgId)
      .eq('requester_id', user.id)
      .eq('kind', 'annual')
      .eq('status', 'approved'),
    supabase
      .from('user_departments')
      .select('departments(name)')
      .eq('user_id', user.id),
    supabase
      .from('profiles')
      .select('id, full_name, preferred_name, email')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .eq('reports_to_user_id', user.id)
      .order('full_name'),
    supabase
      .from('onboarding_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase.rpc('my_probation_alerts'),
    supabase
      .from('employee_hr_documents')
      .select('id, category, document_kind, bucket_id, label, storage_path, file_name, byte_size, created_at, id_document_type, id_number_last4, expires_on, is_current')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .in('document_kind', ['employee_photo', 'id_document'])
      .order('created_at', { ascending: false }),
    supabase
      .from('employee_dependants')
      .select('full_name, relationship, date_of_birth, is_student, is_disabled, is_beneficiary, beneficiary_percentage, phone, email, address, notes, is_emergency_contact')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('employee_bank_details')
      .select('id, status, is_active, account_holder_display, account_number_last4, sort_code_last4, iban_last4, bank_country, currency, effective_from, submitted_by, reviewed_by, reviewed_at, review_note, created_at')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('employee_uk_tax_details')
      .select('id, status, is_active, ni_number_masked, ni_number_last2, tax_code_masked, tax_code_last2, effective_from, review_note, created_at')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('employee_tax_documents')
      .select('id, document_type, tax_year, issue_date, payroll_period_end, status, finance_reference, wagesheet_id, payroll_run_reference, bucket_id, storage_path, file_name, byte_size, is_current, created_at')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('employee_employment_history')
      .select('role_title, department_name, team_name, manager_name, employment_type, contract_type, fte, location_type, start_date, end_date, change_reason, pay_grade, salary_band, notes, source')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('employee_case_records')
      .select('id, case_type, case_ref, category, severity, status, incident_date, reported_date, hearing_date, outcome_effective_date, review_date, summary, outcome_action, appeal_submitted, appeal_outcome, owner_user_id, investigator_user_id, linked_documents, archived_at, created_at')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('employee_case_record_events')
      .select('id, case_id, event_type, old_status, new_status, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('employee_medical_notes')
      .select('id, case_ref, referral_reason, status, fit_for_work_outcome, recommended_adjustments, review_date, next_review_date, summary_for_employee, archived_at, created_at')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('employee_medical_note_events')
      .select('id, medical_note_id, event_type, reason, created_at')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('hr_custom_field_definitions')
      .select('id, key, label, section, field_type, options, is_required, visible_to_manager, visible_to_self')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .eq('visible_to_self', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('hr_custom_field_values')
      .select('definition_id, value')
      .eq('org_id', orgId)
      .eq('user_id', user.id),
  ]);

  const fileRow = (fileRows.data ?? [])[0];
  const deptNames: string[] = [];
  for (const row of udRes.data ?? []) {
    const raw = row.departments as { name: string } | { name: string }[] | null;
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const d of arr) {
      if (d?.name) deptNames.push(d.name);
    }
  }

  const annualUsed = (annualApprovedRes.data ?? []).reduce((sum, row) => {
    const start = new Date(String(row.start_date));
    const end = new Date(String(row.end_date));
    const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return sum + Math.max(0, diff);
  }, 0);

  const emailDisplay = (profile.email as string | null)?.trim() || user.email || '—';
  const profileDisplayName = getDisplayName(profile.full_name as string, (profile.preferred_name as string | null) ?? null);
  const roleLabel = (profile.role as string | null) ?? '—';
  const onboardingActive = (onboardingCountRes.count ?? 0) > 0;

  const probationItems = (
    (probationAlertsRes.data as { items?: { role: string; alert_level: string; probation_end_date: string; display_name: string }[] } | null)
      ?.items ?? []
  ).filter((i) => i.role === 'self');

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-7">
      <header className="border-b border-[#e8e8e8] pb-5">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">My Profile</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Your contact details, job information, leave, and links to other people tools — same data your HR team
          maintains for you.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Profile sections">
          <a className={sectionLink} href="#personal">
            Personal
          </a>
          <a className={sectionLink} href="#job">
            Job
          </a>
          <a className={sectionLink} href="#time-off">
            Time off
          </a>
          <a className={sectionLink} href="#reporting">
            Reporting line
          </a>
          <a className={sectionLink} href="#performance">
            Performance
          </a>
          <a className={sectionLink} href="#onboarding">
            Onboarding
          </a>
          <a className={sectionLink} href="#other">
            Training &amp; other
          </a>
        </nav>
      </header>

      <section id="personal" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Personal</h2>
        <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5">
          <dl className="grid gap-3 sm:grid-cols-2 text-[13px]">
            <div>
              <dt className="text-[#9b9b9b]">Name</dt>
              <dd className="text-[#121212]">{profileDisplayName}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Work email</dt>
              <dd className="text-[#121212]">{emailDisplay}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Role</dt>
              <dd className="text-[#121212]">{roleLabel}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Department</dt>
              <dd className="text-[#121212]">{deptNames.length ? deptNames.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Account ID</dt>
              <dd className="font-mono text-[12px] text-[#121212]">{user.id}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Phone</dt>
              <dd className="text-[#121212]">—</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[#9b9b9b]">Emergency contact</dt>
              <dd className="text-[#6b6b6b]">
                Not stored in CampSite yet. Ask your HR team if they keep this elsewhere.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section id="job" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Job</h2>
        {probationItems.length > 0 ? (
          <div className="mt-3 space-y-2">
            {probationItems.map((p) => (
              <div
                key={p.probation_end_date + p.alert_level}
                className={[
                  'rounded-lg border px-3 py-2.5 text-[13px]',
                  p.alert_level === 'critical'
                    ? 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b]'
                    : p.alert_level === 'overdue'
                      ? 'border-[#fed7aa] bg-[#fffbeb] text-[#9a3412]'
                      : 'border-[#fde68a] bg-[#fffbeb] text-[#854d0e]',
                ].join(' ')}
                role="status"
              >
                <p className="font-medium">
                  {p.alert_level === 'critical'
                    ? 'Your probation review is more than one week overdue.'
                    : p.alert_level === 'overdue'
                      ? 'Your probation end date has passed — your manager should complete the probation review.'
                      : 'Your probation period is ending soon — speak with your manager about your probation review.'}
                </p>
                <p className="mt-0.5 text-[12px] opacity-90">Probation ends {p.probation_end_date}.</p>
              </div>
            ))}
          </div>
        ) : null}
        {!fileRow ? (
          <p className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px] text-[#6b6b6b]">
            No HR job record yet. Your HR administrator can add this under Employee records.
          </p>
        ) : (
          <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5">
            <dl className="grid gap-3 sm:grid-cols-2 text-[13px]">
              <div>
                <dt className="text-[#9b9b9b]">Job title</dt>
                <dd className="text-[#121212]">{String(fileRow.job_title ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Grade</dt>
                <dd className="text-[#121212]">{String(fileRow.grade_level ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Pay grade</dt>
                <dd className="text-[#121212]">{String((fileRow as { pay_grade?: string }).pay_grade ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Position type</dt>
                <dd className="text-[#121212]">{String((fileRow as { position_type?: string }).position_type ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Employment basis</dt>
                <dd className="text-[#121212]">{String((fileRow as { employment_basis?: string }).employment_basis ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Contract</dt>
                <dd className="text-[#121212]">{labelContract((fileRow.contract_type as string | null) ?? null)}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">FTE</dt>
                <dd className="text-[#121212]">{fileRow.fte ? `${Math.round(Number(fileRow.fte) * 100)}%` : '—'}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Weekly hours</dt>
                <dd className="text-[#121212]">{String((fileRow as { weekly_hours?: number }).weekly_hours ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Work location</dt>
                <dd className="text-[#121212]">{labelLocation((fileRow.work_location as string | null) ?? null)}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Employment start</dt>
                <dd className="text-[#121212]">{String(fileRow.employment_start_date ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Length of service</dt>
                <dd className="text-[#121212]">
                  {typeof (fileRow as { length_of_service_years?: number }).length_of_service_years === 'number' &&
                  typeof (fileRow as { length_of_service_months?: number }).length_of_service_months === 'number'
                    ? `${(fileRow as { length_of_service_years: number }).length_of_service_years}y ${(fileRow as { length_of_service_months: number }).length_of_service_months}m`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Dept. start</dt>
                <dd className="text-[#121212]">{String((fileRow as { department_start_date?: string }).department_start_date ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Continuous employment</dt>
                <dd className="text-[#121212]">{String((fileRow as { continuous_employment_start_date?: string }).continuous_employment_start_date ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Probation end</dt>
                <dd className="text-[#121212]">{String(fileRow.probation_end_date ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Notice period (weeks)</dt>
                <dd className="text-[#121212]">{String(fileRow.notice_period_weeks ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Salary band</dt>
                <dd className="text-[#121212]">{String(fileRow.salary_band ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Budget</dt>
                <dd className="text-[#121212]">
                  {(fileRow as { budget_amount?: number }).budget_amount != null
                    ? `${(fileRow as { budget_amount: number }).budget_amount} ${String((fileRow as { budget_currency?: string }).budget_currency ?? '').trim()}`.trim()
                    : '—'}
                </dd>
              </div>
            </dl>
            {(() => {
              const cf = (fileRow as { custom_fields?: Record<string, unknown> }).custom_fields;
              if (!cf || typeof cf !== 'object' || Array.isArray(cf) || Object.keys(cf).length === 0) return null;
              return (
                <div className="mt-4 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3 text-[13px]">
                  <p className="text-[12px] font-semibold text-[#121212]">Other job details</p>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    {Object.entries(cf).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[11px] text-[#9b9b9b]">{k}</dt>
                        <dd className="text-[#121212]">{v == null ? '—' : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })()}
          </div>
        )}
      </section>

      <section id="time-off" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Time off</h2>
        <p className="mt-1 text-[12px] text-[#9b9b9b]">
          Leave year {profileLeaveYearKey} · {formatLeaveYearPeriodRange(profileLeaveYearKey, sm, sd)}
        </p>
        <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2 text-[13px]">
            <div className="rounded-lg bg-[#faf9f6] p-3">
              <p className="text-[#9b9b9b]">Annual entitlement</p>
              <p className="mt-1 text-[18px] font-semibold text-[#121212]">
                {Number(allowanceRow.data?.annual_entitlement_days ?? 0)} days
              </p>
            </div>
            <div className="rounded-lg bg-[#faf9f6] p-3">
              <p className="text-[#9b9b9b]">Annual leave used</p>
              <p className="mt-1 text-[18px] font-semibold text-[#121212]">{annualUsed} days</p>
            </div>
            <div className="rounded-lg bg-[#faf9f6] p-3">
              <p className="text-[#9b9b9b]">TOIL balance</p>
              <p className="mt-1 text-[18px] font-semibold text-[#121212]">
                {Number(allowanceRow.data?.toil_balance_days ?? 0)} days
              </p>
            </div>
          </div>
          <p className="mt-4 text-[13px]">
            <Link href="/leave" className="font-medium text-[#121212] underline underline-offset-2">
              Open leave
            </Link>{' '}
            for requests, balances, and history.
          </p>
        </div>
      </section>

      <section id="reporting" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Reporting line</h2>
        <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px]">
          <div>
            <p className="text-[#9b9b9b]">Manager</p>
            <p className="mt-1 text-[#121212]">
              {fileRow && (fileRow as { reports_to_name?: string }).reports_to_name
                ? String((fileRow as { reports_to_name: string }).reports_to_name)
                : '—'}
            </p>
          </div>
          <div className="mt-4">
            <p className="text-[#9b9b9b]">Direct reports</p>
            <div className="mt-2">
              {(directReportsRes.data ?? []).length === 0 ? (
                <span className="text-[#6b6b6b]">None</span>
              ) : (
                <ul className="space-y-1">
                  {(directReportsRes.data ?? []).map((r) => (
                    <li key={r.id as string} className="text-[#121212]">
                      {getDisplayName(r.full_name as string, (r.preferred_name as string | null) ?? null)}
                      {r.email ? (
                        <span className="text-[#9b9b9b]"> · {String(r.email)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="mt-4 text-[13px]">
            <Link href="/hr/org-chart" className="font-medium text-[#121212] underline underline-offset-2">
              Org chart
            </Link>{' '}
            (if you have access)
          </p>
        </div>
      </section>

      <section id="performance" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Performance</h2>
        <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px] text-[#121212]">
          {canPerf ? (
            <p>
              <Link href="/performance" className="font-medium underline underline-offset-2">
                Open performance reviews
              </Link>{' '}
              for your goals and review cycles.
            </p>
          ) : (
            <p className="text-[#6b6b6b]">Performance reviews are not enabled for your account.</p>
          )}
        </div>
      </section>

      <section id="onboarding" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Onboarding</h2>
        <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px]">
          {onboardingActive ? (
            <p>
              You have an active onboarding run.{' '}
              <Link href="/onboarding" className="font-medium text-[#121212] underline underline-offset-2">
                Continue onboarding
              </Link>
            </p>
          ) : (
            <p className="text-[#6b6b6b]">No active onboarding checklist.</p>
          )}
        </div>
      </section>

      <section id="other" className="scroll-mt-24 pt-8 pb-4">
        <h2 className="text-[15px] font-semibold text-[#121212]">Training, documents, certifications &amp; notes</h2>
        <div className="mt-3 space-y-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px]">
          <p className="text-[#6b6b6b]">
            <strong className="text-[#121212]">Training &amp; certifications:</strong> dedicated training records are not
            modelled in CampSite yet. Your organisation may track these in{' '}
            <strong>Other job details</strong> (custom fields) above.
          </p>
          <p className="text-[#6b6b6b]">
            <strong className="text-[#121212]">Documents:</strong> your employee photo and ID records are available below.
            ID number display is masked for privacy.
          </p>
          {(canRecordExportOwn && (canRecordExportCsv || canRecordExportPdf)) ? (
            <div className="flex flex-wrap gap-2">
              {canRecordExportCsv ? (
                <a href="/api/hr/records/export?format=csv" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] text-[#121212] hover:bg-[#fafafa]">
                  Export my record (CSV)
                </a>
              ) : null}
              {canRecordExportPdf ? (
                <a href="/api/hr/records/export?format=pdf" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] text-[#121212] hover:bg-[#fafafa]">
                  Export my record (PDF)
                </a>
              ) : null}
            </div>
          ) : null}
          <EmployeeSelfDocumentsClient
            orgId={orgId}
            userId={user.id}
            docs={(ownDocsRes.data ?? []).map((d) => ({
              id: d.id as string,
              category: d.category as string,
              document_kind: (d.document_kind as string) ?? 'id_document',
              bucket_id: (d.bucket_id as string) ?? '',
              label: (d.label as string) ?? '',
              storage_path: d.storage_path as string,
              file_name: d.file_name as string,
              byte_size: Number(d.byte_size ?? 0),
              created_at: d.created_at as string,
              id_document_type: (d.id_document_type as string | null) ?? null,
              id_number_last4: (d.id_number_last4 as string | null) ?? null,
              expires_on: (d.expires_on as string | null) ?? null,
              is_current: Boolean(d.is_current),
            }))}
            canViewPhoto={!!canViewPhotoOwn}
            canUploadPhoto={!!canUploadPhotoOwn}
            canDeletePhoto={!!canDeletePhotoOwn}
            canViewId={!!canViewIdOwn}
            canUploadId={!!canUploadIdOwn}
            canDeleteId={!!canDeleteIdOwn}
          />
          <DependantsEditorClient
            title="Dependants & beneficiaries"
            description="Manage your dependant and beneficiary information."
            subjectUserId={user.id}
            canEdit={true}
            initialDependants={(ownDependantsRes.data ?? []).map((d) => ({
              full_name: (d.full_name as string) ?? '',
              relationship: (d.relationship as string) ?? 'other',
              date_of_birth: (d.date_of_birth as string | null) ?? null,
              is_student: Boolean(d.is_student),
              is_disabled: Boolean(d.is_disabled),
              is_beneficiary: Boolean(d.is_beneficiary),
              beneficiary_percentage:
                d.beneficiary_percentage != null ? Number(d.beneficiary_percentage) : null,
              phone: (d.phone as string | null) ?? null,
              email: (d.email as string | null) ?? null,
              address: (d.address as string | null) ?? null,
              notes: (d.notes as string | null) ?? null,
              is_emergency_contact: Boolean(d.is_emergency_contact),
            }))}
          />
          {(canBankViewOwn || canBankManageOwn) ? (
            <BankDetailsClient
              title="Bank details (payroll)"
              description="Masked by default. Changes require approval before activation."
              subjectUserId={user.id}
              initialRows={(ownBankRowsRes.data ?? []).map((r) => ({
                id: r.id as string,
                status: (r.status as 'pending' | 'approved' | 'rejected') ?? 'pending',
                is_active: Boolean(r.is_active),
                account_holder_display: (r.account_holder_display as string) ?? '',
                account_number_last4: (r.account_number_last4 as string | null) ?? null,
                sort_code_last4: (r.sort_code_last4 as string | null) ?? null,
                iban_last4: (r.iban_last4 as string | null) ?? null,
                bank_country: (r.bank_country as string | null) ?? null,
                currency: (r.currency as string | null) ?? null,
                effective_from: (r.effective_from as string | null) ?? null,
                submitted_by: r.submitted_by as string,
                reviewed_by: (r.reviewed_by as string | null) ?? null,
                reviewed_at: (r.reviewed_at as string | null) ?? null,
                review_note: (r.review_note as string | null) ?? null,
                created_at: r.created_at as string,
              }))}
              permissions={{
                viewAll: false,
                manageAll: false,
                viewOwn: Boolean(canBankViewOwn),
                manageOwn: Boolean(canBankManageOwn),
                canExport: Boolean(canBankExport),
              }}
            />
          ) : null}
          {(canUkTaxViewOwn || canUkTaxManageOwn) ? (
            <UkTaxDetailsClient
              subjectUserId={user.id}
              initialRows={(ownUkTaxRowsRes.data ?? []).map((r) => ({
                id: r.id as string,
                status: (r.status as 'pending' | 'approved' | 'rejected') ?? 'pending',
                is_active: Boolean(r.is_active),
                ni_number_masked: (r.ni_number_masked as string | null) ?? null,
                ni_number_last2: (r.ni_number_last2 as string | null) ?? null,
                tax_code_masked: (r.tax_code_masked as string | null) ?? null,
                tax_code_last2: (r.tax_code_last2 as string | null) ?? null,
                effective_from: (r.effective_from as string | null) ?? null,
                review_note: (r.review_note as string | null) ?? null,
                created_at: r.created_at as string,
              }))}
              permissions={{
                viewAll: false,
                manageAll: false,
                viewOwn: Boolean(canUkTaxViewOwn),
                manageOwn: Boolean(canUkTaxManageOwn),
                canExport: Boolean(canUkTaxExport),
              }}
            />
          ) : null}
          {(canTaxDocsViewOwn || canTaxDocsUploadOwn) ? (
            <TaxDocumentsClient
              orgId={orgId}
              subjectUserId={user.id}
              actorUserId={user.id}
              initialDocs={(ownTaxDocsRes.data ?? []).map((r) => ({
                id: r.id as string,
                document_type: ((r.document_type as string) ?? 'p60') as 'p45' | 'p60',
                tax_year: (r.tax_year as string | null) ?? null,
                issue_date: (r.issue_date as string | null) ?? null,
                payroll_period_end: (r.payroll_period_end as string | null) ?? null,
                status: ((r.status as string) ?? 'issued') as 'draft' | 'final' | 'issued',
                finance_reference: (r.finance_reference as string | null) ?? null,
                wagesheet_id: (r.wagesheet_id as string | null) ?? null,
                payroll_run_reference: (r.payroll_run_reference as string | null) ?? null,
                bucket_id: (r.bucket_id as string) ?? 'employee-tax-documents',
                storage_path: r.storage_path as string,
                file_name: r.file_name as string,
                byte_size: Number(r.byte_size ?? 0),
                is_current: Boolean(r.is_current),
                created_at: r.created_at as string,
              }))}
              permissions={{
                viewAll: false,
                manageAll: false,
                viewOwn: Boolean(canTaxDocsViewOwn),
                uploadOwn: Boolean(canTaxDocsUploadOwn),
                canExport: Boolean(canTaxDocsExport),
              }}
            />
          ) : null}
          {(canEmploymentHistoryViewOwn || canEmploymentHistoryManageOwn) ? (
            <EmploymentHistoryClient
              subjectUserId={user.id}
              canEdit={Boolean(canEmploymentHistoryManageOwn)}
              isSelf
              initialRows={(ownEmploymentHistoryRes.data ?? []).map((r) => ({
                role_title: (r.role_title as string) ?? '',
                department_name: (r.department_name as string | null) ?? null,
                team_name: (r.team_name as string | null) ?? null,
                manager_name: (r.manager_name as string | null) ?? null,
                employment_type: (r.employment_type as string | null) ?? null,
                contract_type: (r.contract_type as string | null) ?? null,
                fte: r.fte != null ? Number(r.fte) : null,
                location_type: (r.location_type as string | null) ?? null,
                start_date: (r.start_date as string) ?? '',
                end_date: (r.end_date as string | null) ?? null,
                change_reason: (r.change_reason as string | null) ?? null,
                pay_grade: (r.pay_grade as string | null) ?? null,
                salary_band: (r.salary_band as string | null) ?? null,
                notes: (r.notes as string | null) ?? null,
                source: ((r.source as string) ?? 'employee_request') as 'manual' | 'auto_from_hr_record' | 'employee_request',
              }))}
            />
          ) : null}
          {(canDisciplinaryViewOwn || canGrievanceViewOwn) ? (
            <DisciplinaryGrievanceLogClient
              orgId={orgId}
              subjectUserId={user.id}
              title="Disciplinary & grievance records"
              initialCases={(ownCaseRowsRes.data ?? []).map((r) => ({
                id: r.id as string,
                case_type: ((r.case_type as string) ?? 'disciplinary') as 'disciplinary' | 'grievance',
                case_ref: (r.case_ref as string) ?? '',
                category: (r.category as string | null) ?? null,
                severity: (r.severity as string | null) ?? null,
                status: ((r.status as string) ?? 'open') as 'open' | 'investigating' | 'hearing' | 'outcome_issued' | 'appeal' | 'closed',
                incident_date: (r.incident_date as string | null) ?? null,
                reported_date: (r.reported_date as string | null) ?? null,
                hearing_date: (r.hearing_date as string | null) ?? null,
                outcome_effective_date: (r.outcome_effective_date as string | null) ?? null,
                review_date: (r.review_date as string | null) ?? null,
                summary: (r.summary as string | null) ?? null,
                allegations_details: null,
                outcome_action: (r.outcome_action as string | null) ?? null,
                appeal_submitted: Boolean(r.appeal_submitted),
                appeal_outcome: (r.appeal_outcome as string | null) ?? null,
                owner_user_id: (r.owner_user_id as string | null) ?? null,
                investigator_user_id: (r.investigator_user_id as string | null) ?? null,
                witness_details: null,
                investigation_notes: null,
                internal_notes: null,
                linked_documents: r.linked_documents ?? [],
                archived_at: (r.archived_at as string | null) ?? null,
                created_at: r.created_at as string,
              }))}
              initialEvents={(ownCaseEventRowsRes.data ?? [])
                .filter((e) => (ownCaseRowsRes.data ?? []).some((c) => (c.id as string) === (e.case_id as string)))
                .map((e) => ({
                  id: e.id as string,
                  case_id: e.case_id as string,
                  event_type: (e.event_type as string) ?? 'updated',
                  old_status: (e.old_status as string | null) ?? null,
                  new_status: (e.new_status as string | null) ?? null,
                  created_at: e.created_at as string,
                }))}
              permissions={{
                canManageDisciplinary: false,
                canManageGrievance: false,
                canViewSensitive: false,
              }}
            />
          ) : null}
          {(canMedicalViewOwnSummary || canMedicalManageOwn) ? (
            <MedicalNotesClient
              subjectUserId={user.id}
              initialRows={(ownMedicalRowsRes.data ?? []).map((r) => ({
                id: r.id as string,
                case_ref: (r.case_ref as string) ?? '',
                referral_reason: (r.referral_reason as string | null) ?? null,
                status: ((r.status as string) ?? 'open') as 'open' | 'under_review' | 'fit_note_received' | 'closed',
                fit_for_work_outcome: (r.fit_for_work_outcome as string | null) ?? null,
                recommended_adjustments: (r.recommended_adjustments as string | null) ?? null,
                review_date: (r.review_date as string | null) ?? null,
                next_review_date: (r.next_review_date as string | null) ?? null,
                summary_for_employee: (r.summary_for_employee as string | null) ?? null,
                archived_at: (r.archived_at as string | null) ?? null,
                created_at: r.created_at as string,
              }))}
              initialEvents={(ownMedicalEventsRes.data ?? []).map((e) => ({
                id: e.id as string,
                medical_note_id: e.medical_note_id as string,
                event_type: (e.event_type as string) ?? 'updated',
                reason: (e.reason as string | null) ?? null,
                created_at: e.created_at as string,
              }))}
              permissions={{
                viewAll: false,
                manageAll: false,
                viewOwnSummary: Boolean(canMedicalViewOwnSummary),
                revealSensitive: false,
                canExport: false,
                manageOwn: Boolean(canMedicalManageOwn),
              }}
            />
          ) : null}
          {(canCustomFieldsView || canCustomFieldsManageOwn) ? (
            <CustomHrFieldsValuesClient
              orgId={orgId}
              subjectUserId={user.id}
              title="Custom HR fields"
              definitions={(ownCustomFieldDefsRes.data ?? []).map((d) => ({
                id: d.id as string,
                key: d.key as string,
                label: d.label as string,
                section: (d.section as string) ?? 'personal',
                field_type: (d.field_type as string) ?? 'text',
                options: d.options ?? [],
                is_required: Boolean(d.is_required),
              }))}
              initialValues={(ownCustomFieldValuesRes.data ?? []).map((v) => ({
                definition_id: v.definition_id as string,
                value: v.value,
              }))}
              canEdit={Boolean(canCustomFieldsManageOwn)}
            />
          ) : null}
          {canPrivacyErasureCreate ? <PrivacySelfRequestClient userId={user.id} /> : null}
          <div>
            <p className="text-[#9b9b9b]">HR notes</p>
            <p className="mt-1 text-[#121212]">
              {fileRow && fileRow.notes != null && String(fileRow.notes).trim() !== ''
                ? String(fileRow.notes)
                : '—'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
