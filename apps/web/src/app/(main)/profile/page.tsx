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
import { TrainingRecordsClient } from '@/components/hr/TrainingRecordsClient';
import { GraphExperience } from '@/components/genz/GraphExperience';
import { ProfileUiModeSync } from '@/components/profile/ProfileUiModeSync';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getDisplayName } from '@/lib/names';
import { normalizeUiMode } from '@/lib/uiMode';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { warnIfSlowServerPath } from '@/lib/perf/serverPerf';
import { withServerPerf } from '@/lib/perf/serverPerf';

const PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS = 1400;
/** Cap slow HR RPCs so a stuck Supabase query does not block the whole profile response. */
const PROFILE_HEAVY_RPC_TIMEOUT_MS = 1200;

async function resolveWithTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, fallback: any): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return (await Promise.race([
      Promise.resolve(promise),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

export default async function MyProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const pathStartedAtMs = Date.now();
  const { tab = 'personal' } = (await searchParams) ?? {};
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await withServerPerf(
    '/profile',
    'profile_lookup',
    supabase
      .from('profiles')
      .select('org_id, status, full_name, preferred_name, email, avatar_url, role, reports_to_user_id, ui_mode')
      .eq('id', user.id)
      .maybeSingle(),
    300
  );
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;
  // Reuse request-cached permission bundle from layout to avoid many per-page RPC calls.
  const permissionKeys = await withServerPerf('/profile', 'get_my_permissions', getMyPermissions(orgId), 350);
  const canViewOwn = permissionKeys.includes('hr.view_own');
  if (!canViewOwn) redirect('/dashboard');
  const canPerf = permissionKeys.includes('performance.view_own');
  const canViewPhotoOwn = permissionKeys.includes('hr.employee_photo.view_own');
  const canUploadPhotoOwn = permissionKeys.includes('hr.employee_photo.upload_own');
  const canDeletePhotoOwn = permissionKeys.includes('hr.employee_photo.delete_own');
  const canViewIdOwn = permissionKeys.includes('hr.id_document.view_own');
  const canUploadIdOwn = permissionKeys.includes('hr.id_document.upload_own');
  const canDeleteIdOwn = permissionKeys.includes('hr.id_document.delete_own');
  const canBankViewOwn = permissionKeys.includes('payroll.bank_details.view_own');
  const canBankManageOwn = permissionKeys.includes('payroll.bank_details.manage_own');
  const canBankExport = permissionKeys.includes('payroll.bank_details.export');
  const canUkTaxViewOwn = permissionKeys.includes('payroll.uk_tax.view_own');
  const canUkTaxManageOwn = permissionKeys.includes('payroll.uk_tax.manage_own');
  const canUkTaxExport = permissionKeys.includes('payroll.uk_tax.export');
  const canTaxDocsViewOwn = permissionKeys.includes('payroll.tax_docs.view_own');
  const canTaxDocsUploadOwn = permissionKeys.includes('payroll.tax_docs.upload_own');
  const canTaxDocsExport = permissionKeys.includes('payroll.tax_docs.export');
  const canEmploymentHistoryViewOwn = permissionKeys.includes('hr.employment_history.view_own');
  const canEmploymentHistoryManageOwn = permissionKeys.includes('hr.employment_history.manage_own');
  const canDisciplinaryViewOwn = permissionKeys.includes('hr.disciplinary.view_own');
  const canGrievanceViewOwn = permissionKeys.includes('hr.grievance.view_own');
  const canMedicalViewOwnSummary = permissionKeys.includes('hr.medical_notes.view_own_summary');
  const canMedicalManageOwn = permissionKeys.includes('hr.medical_notes.manage_own');
  const canCustomFieldsView = permissionKeys.includes('hr.custom_fields.view');
  const canCustomFieldsManageOwn = permissionKeys.includes('hr.custom_fields.manage_values_own');
  const canPrivacyErasureCreate = permissionKeys.includes('privacy.erasure_request.create');
  const canRecordExportOwn = permissionKeys.includes('hr.records_export.view_own');
  const canRecordExportCsv = permissionKeys.includes('hr.records_export.generate_csv');
  const canRecordExportPdf = permissionKeys.includes('hr.records_export.generate_pdf');
  const uiMode = normalizeUiMode((profile.ui_mode as string | null) ?? null);
  const isInteractiveMode = uiMode === 'interactive';
  const needsOtherTabData = tab === 'other' || isInteractiveMode;
  const needsUpcomingData = tab === 'personal' || tab === 'time-off' || isInteractiveMode;
  const needsRoleData = tab === 'personal' || isInteractiveMode;
  const needsOnboardingCount = tab === 'onboarding' || isInteractiveMode;

  const maybeLoad = <T,>(enabled: boolean, query: () => Promise<T>, fallback: unknown): Promise<T> =>
    enabled ? query() : Promise.resolve(fallback as T);

  const [leaveSettingsRes, orgTzRes] = await Promise.all([
    withServerPerf(
      '/profile',
      'leave_settings_year',
      supabase
        .from('org_leave_settings')
        .select('leave_year_start_month, leave_year_start_day')
        .eq('org_id', orgId)
        .maybeSingle(),
      350
    ),
    withServerPerf(
      '/profile',
      'org_timezone_lookup',
      supabase.from('organisations').select('timezone').eq('id', orgId).maybeSingle(),
      300
    ),
  ]);
  const leaveSettingsForYear = leaveSettingsRes.data;
  const orgForTz = orgTzRes.data;

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
    ownMedicalRowsRes,
    ownMedicalEventsRes,
    ownCustomFieldDefsRes,
    ownCustomFieldValuesRes,
    upcomingHolidayPeriodsRes,
    ownRoleAssignmentsRes,
    ownTrainingRowsRes,
  ] = await Promise.all([
    withServerPerf(
      '/profile',
      'rpc_hr_employee_file',
      resolveWithTimeout(
        supabase.rpc('hr_employee_file', { p_user_id: user.id }),
        PROFILE_HEAVY_RPC_TIMEOUT_MS,
        { data: [], error: null },
      ),
      450,
    ),
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
    maybeLoad(
      needsOnboardingCount,
      async () =>
        supabase
          .from('onboarding_runs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'active'),
      { count: 0, data: [], error: null },
    ),
    withServerPerf(
      '/profile',
      'rpc_my_probation_alerts',
      resolveWithTimeout(supabase.rpc('my_probation_alerts'), PROFILE_HEAVY_RPC_TIMEOUT_MS, {
        data: { items: [] },
        error: null,
      }),
      350,
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('employee_hr_documents')
        .select('id, category, document_kind, bucket_id, label, storage_path, file_name, byte_size, created_at, id_document_type, id_number_last4, expires_on, is_current')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .in('document_kind', ['employee_photo', 'id_document'])
        .order('created_at', { ascending: false }),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('employee_dependants')
        .select('full_name, relationship, date_of_birth, is_student, is_disabled, is_beneficiary, beneficiary_percentage, phone, email, address, notes, is_emergency_contact')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('employee_bank_details')
        .select('id, status, is_active, account_holder_display, account_number_last4, sort_code_last4, iban_last4, bank_country, currency, effective_from, submitted_by, reviewed_by, reviewed_at, review_note, created_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('employee_uk_tax_details')
        .select('id, status, is_active, ni_number_masked, ni_number_last2, tax_code_masked, tax_code_last2, effective_from, review_note, created_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('employee_tax_documents')
        .select('id, document_type, tax_year, issue_date, payroll_period_end, status, finance_reference, wagesheet_id, payroll_run_reference, bucket_id, storage_path, file_name, byte_size, is_current, created_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('employee_employment_history')
        .select('role_title, department_name, team_name, manager_name, employment_type, contract_type, fte, location_type, start_date, end_date, change_reason, pay_grade, salary_band, notes, source')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .order('start_date', { ascending: false })
        .order('created_at', { ascending: false }),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('employee_case_records')
        .select('id, case_type, case_ref, category, severity, status, incident_date, reported_date, hearing_date, outcome_effective_date, review_date, summary, outcome_action, appeal_submitted, appeal_outcome, owner_user_id, investigator_user_id, linked_documents, archived_at, created_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('employee_medical_notes')
        .select('id, case_ref, referral_reason, status, fit_for_work_outcome, recommended_adjustments, review_date, next_review_date, summary_for_employee, archived_at, created_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('employee_medical_note_events')
        .select('id, medical_note_id, event_type, reason, created_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('hr_custom_field_definitions')
        .select('id, key, label, section, field_type, options, is_required, visible_to_manager, visible_to_self')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .eq('visible_to_self', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('hr_custom_field_values')
        .select('definition_id, value')
        .eq('org_id', orgId)
        .eq('user_id', user.id),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsUpcomingData,
      () => resolveWithTimeout(
      supabase
        .from('org_leave_holiday_periods')
        .select('id, name, holiday_kind, start_date, end_date')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .gte('end_date', new Date().toISOString().slice(0, 10))
        .order('start_date', { ascending: true })
        .limit(10),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsRoleData,
      () => resolveWithTimeout(
      supabase
        .from('user_org_role_assignments')
        .select('role_id')
        .eq('org_id', orgId)
        .eq('user_id', user.id),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
    maybeLoad(
      needsOtherTabData,
      () => resolveWithTimeout(
      supabase
        .from('employee_training_records')
        .select('id, title, provider, status, started_on, completed_on, expires_on, notes, certificate_document_url, created_at')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(120),
      PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
      { data: [], error: null }
      ),
      { data: [], error: null }
    ),
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

  const directReports = (directReportsRes.data ?? []).map((r) =>
    `${getDisplayName(r.full_name as string, (r.preferred_name as string | null) ?? null)}${r.email ? ` · ${String(r.email)}` : ''}`
  );
  const ownDocs = ownDocsRes.data ?? [];
  const ownDependants = ownDependantsRes.data ?? [];
  const ownBankRows = ownBankRowsRes.data ?? [];
  const ownUkTaxRows = ownUkTaxRowsRes.data ?? [];
  const ownTaxDocs = ownTaxDocsRes.data ?? [];
  const ownEmploymentHistory = ownEmploymentHistoryRes.data ?? [];
  const ownCases = ownCaseRowsRes.data ?? [];
  const ownCaseIds = ownCases.map((r) => String(r.id));
  const ownCaseEventsRes =
    ownCaseIds.length === 0 || !needsOtherTabData
      ? { data: [], error: null }
      : await resolveWithTimeout(
          supabase
            .from('employee_case_record_events')
            .select('id, case_id, event_type, old_status, new_status, created_at')
            .eq('org_id', orgId)
            .in('case_id', ownCaseIds)
            .order('created_at', { ascending: false })
            .limit(100),
          PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
          { data: [], error: null }
        );
  const ownMedical = ownMedicalRowsRes.data ?? [];
  const ownCustomDefs = ownCustomFieldDefsRes.data ?? [];
  const ownRoleIds = Array.from(
    new Set(
      ((ownRoleAssignmentsRes.data ?? []) as { role_id: string }[])
        .map((r) => String(r.role_id || '').trim())
        .filter(Boolean)
    )
  );
  const ownRolesRes =
    ownRoleIds.length === 0 || !needsRoleData
      ? { data: [], error: null }
      : await resolveWithTimeout(
          supabase
            .from('org_roles')
            .select('id, label, key')
            .eq('org_id', orgId)
            .eq('is_archived', false)
            .in('id', ownRoleIds),
          PROFILE_NON_CRITICAL_QUERY_TIMEOUT_MS,
          { data: [], error: null }
        );
  const upcomingHolidayPeriods = (upcomingHolidayPeriodsRes.data ?? []) as {
    id: string;
    name: string;
    holiday_kind: 'bank_holiday' | 'public_holiday' | 'org_break' | 'custom';
    start_date: string;
    end_date: string;
  }[];
  const ownRoleLabels = Array.from(
    new Set(
      ((ownRolesRes.data ?? []) as { label?: string | null; key?: string | null }[])
        .map((r) => r.label || r.key || null)
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    )
  );
  const ownTrainingRows = (ownTrainingRowsRes.data ?? []) as {
    id: string;
    title: string;
    provider: string | null;
    status: 'planned' | 'in_progress' | 'completed' | 'expired';
    started_on: string | null;
    completed_on: string | null;
    expires_on: string | null;
    notes: string | null;
    certificate_document_url: string | null;
    created_at: string;
  }[];

  const interactiveNodes = isInteractiveMode ? [
    {
      id: 'personal-node',
      label: 'Personal',
      description: 'Identity and core account profile.',
      facts: [
        { label: 'Name', value: profileDisplayName },
        { label: 'Work email', value: emailDisplay },
        { label: 'Role', value: roleLabel },
        { label: 'Department', value: deptNames.length ? deptNames.join(', ') : '—' },
        { label: 'Account ID', value: user.id },
        { label: 'Phone', value: '—' },
        {
          label: 'Emergency contact',
          value: 'Not stored in CampSite yet. Ask HR if stored externally.',
        },
      ],
      actions: [{ id: 'edit-profile-settings', label: 'Edit profile settings', href: '/settings#profile' }],
    },
    {
      id: 'job-node',
      label: 'Job',
      description: 'Position, contract, probation, and job metadata.',
      facts: [
        { label: 'Job title', value: String(fileRow?.job_title ?? '—') },
        { label: 'Grade', value: String(fileRow?.grade_level ?? '—') },
        { label: 'Pay grade', value: String((fileRow as { pay_grade?: string } | undefined)?.pay_grade ?? '—') },
        { label: 'Position type', value: String((fileRow as { position_type?: string } | undefined)?.position_type ?? '—') },
        { label: 'Employment basis', value: String((fileRow as { employment_basis?: string } | undefined)?.employment_basis ?? '—') },
        { label: 'Contract', value: labelContract((fileRow?.contract_type as string | null) ?? null) },
        { label: 'FTE', value: fileRow?.fte ? `${Math.round(Number(fileRow.fte) * 100)}%` : '—' },
        { label: 'Weekly hours', value: String((fileRow as { weekly_hours?: number } | undefined)?.weekly_hours ?? '—') },
        { label: 'Work location', value: labelLocation((fileRow?.work_location as string | null) ?? null) },
        { label: 'Employment start', value: String(fileRow?.employment_start_date ?? '—') },
        {
          label: 'Length of service',
          value:
            typeof (fileRow as { length_of_service_years?: number } | undefined)?.length_of_service_years === 'number' &&
            typeof (fileRow as { length_of_service_months?: number } | undefined)?.length_of_service_months === 'number'
              ? `${(fileRow as { length_of_service_years: number }).length_of_service_years}y ${(fileRow as { length_of_service_months: number }).length_of_service_months}m`
              : '—',
        },
        { label: 'Dept. start', value: String((fileRow as { department_start_date?: string } | undefined)?.department_start_date ?? '—') },
        { label: 'Continuous employment', value: String((fileRow as { continuous_employment_start_date?: string } | undefined)?.continuous_employment_start_date ?? '—') },
        { label: 'Probation end', value: String(fileRow?.probation_end_date ?? '—') },
        { label: 'Notice period (weeks)', value: String(fileRow?.notice_period_weeks ?? '—') },
        { label: 'Salary band', value: String(fileRow?.salary_band ?? '—') },
      ],
      bulletPoints:
        probationItems.length > 0
          ? probationItems.map((p) => `Probation alert (${p.alert_level}): ends ${p.probation_end_date}`)
          : ['No active probation alerts.'],
    },
    {
      id: 'timeoff-node',
      label: 'Time off',
      description: 'Current leave-year allowances and usage.',
      facts: [
        {
          label: 'Leave year',
          value: `${profileLeaveYearKey} · ${formatLeaveYearPeriodRange(profileLeaveYearKey, sm, sd)}`,
        },
        { label: 'Annual entitlement', value: `${Number(allowanceRow.data?.annual_entitlement_days ?? 0)} days` },
        { label: 'Annual leave used', value: `${annualUsed} days` },
        { label: 'TOIL balance', value: `${Number(allowanceRow.data?.toil_balance_days ?? 0)} days` },
      ],
      actions: [{ id: 'open-leave', label: 'Open leave', href: '/leave' }],
    },
    {
      id: 'reporting-node',
      label: 'Reporting line',
      description: 'Manager and direct-report structure.',
      facts: [
        {
          label: 'Manager',
          value:
            fileRow && (fileRow as { reports_to_name?: string }).reports_to_name
              ? String((fileRow as { reports_to_name: string }).reports_to_name)
              : '—',
        },
      ],
      bulletPoints: directReports.length > 0 ? directReports : ['No direct reports.'],
      actions: [{ id: 'org-chart', label: 'Open org chart', href: '/hr/org-chart' }],
    },
    {
      id: 'performance-node',
      label: 'Performance',
      description: 'Review access and current status.',
      bulletPoints: [
        canPerf
          ? 'Open performance reviews for your goals and review cycles.'
          : 'Performance reviews are not enabled for your account.',
      ],
      actions: canPerf ? [{ id: 'open-performance', label: 'Open performance', href: '/performance' }] : [],
    },
    {
      id: 'onboarding-node',
      label: 'Onboarding',
      description: 'Onboarding run availability.',
      bulletPoints: [onboardingActive ? 'Active onboarding checklist available.' : 'No active onboarding checklist.'],
      actions: onboardingActive ? [{ id: 'open-onboarding', label: 'Continue onboarding', href: '/onboarding' }] : [],
    },
    {
      id: 'training-docs-node',
      label: 'Training & docs',
      description: 'Documents, certifications, and exports.',
      facts: [
        { label: 'Employee photo docs', value: `${ownDocs.filter((d) => d.document_kind === 'employee_photo').length}` },
        { label: 'ID documents', value: `${ownDocs.filter((d) => d.document_kind === 'id_document').length}` },
        { label: 'Dependants', value: `${ownDependants.length}` },
      ],
      bulletPoints: [
        'Training/certification records are not modelled yet.',
        'ID document display is masked for privacy.',
      ],
      actions: [
        ...(canRecordExportOwn && canRecordExportCsv
          ? [{ id: 'export-csv', label: 'Export my record (CSV)', href: '/api/hr/records/export?format=csv' }]
          : []),
        ...(canRecordExportOwn && canRecordExportPdf
          ? [{ id: 'export-pdf', label: 'Export my record (PDF)', href: '/api/hr/records/export?format=pdf' }]
          : []),
      ],
    },
    {
      id: 'payroll-node',
      label: 'Payroll & tax',
      description: 'Bank details, UK tax details, and P45/P60 docs.',
      facts: [
        { label: 'Bank records', value: `${ownBankRows.length}` },
        { label: 'UK tax records', value: `${ownUkTaxRows.length}` },
        { label: 'P45/P60 documents', value: `${ownTaxDocs.length}` },
      ],
      bulletPoints: [
        ownBankRows.length > 0 ? 'Bank details exist (masked by default).' : 'No approved active payroll bank details.',
        ownUkTaxRows.length > 0 ? 'UK tax details exist (masked by default).' : 'No approved active UK tax record.',
        ownTaxDocs.length > 0 ? 'P45/P60 documents uploaded.' : 'No P45/P60 documents uploaded yet.',
      ],
    },
    {
      id: 'employment-history-node',
      label: 'Employment history',
      description: 'Role progression and transfers.',
      facts: [{ label: 'Entries', value: `${ownEmploymentHistory.length}` }],
      bulletPoints:
        ownEmploymentHistory.length > 0
          ? ownEmploymentHistory.slice(0, 5).map((r) => `${String(r.role_title ?? 'Role')} (${String(r.start_date ?? '—')} to ${String(r.end_date ?? 'present')})`)
          : ['No employment history entries yet.'],
    },
    {
      id: 'cases-medical-node',
      label: 'Cases & medical',
      description: 'Disciplinary/grievance and occupational health records.',
      facts: [
        { label: 'Case records', value: `${ownCases.length}` },
        { label: 'Medical notes', value: `${ownMedical.length}` },
      ],
      bulletPoints: [
        ownCases.length > 0 ? 'Disciplinary/grievance cases present.' : 'No disciplinary or grievance cases.',
        ownMedical.length > 0 ? 'Medical/OH notes present.' : 'No medical/OH notes yet.',
      ],
    },
    {
      id: 'custom-privacy-node',
      label: 'Custom fields & privacy',
      description: 'Org custom fields, GDPR erase workflow, and HR notes.',
      facts: [
        { label: 'Custom HR fields', value: `${ownCustomDefs.length}` },
        { label: 'Privacy erase request', value: canPrivacyErasureCreate ? 'Available' : 'Unavailable' },
        {
          label: 'HR notes',
          value:
            fileRow && fileRow.notes != null && String(fileRow.notes).trim() !== ''
              ? String(fileRow.notes)
              : '—',
        },
      ],
      bulletPoints: [ownCustomDefs.length > 0 ? 'Custom HR fields are configured.' : 'No custom fields configured yet.'],
    },
  ] : [];

  if (uiMode === 'interactive') {
    const view = (
      <div className="min-h-[calc(100vh-60px)]">
        <ProfileUiModeSync initialMode={uiMode} />
        <GraphExperience
          title="My Profile Graph"
          subtitle="Interactive view. Every profile area is represented as connected nodes."
          centerLabel={profileDisplayName}
          centerDescription="Select nodes to inspect details and jump to related actions."
          nodes={interactiveNodes}
          fullScreen
        />
      </div>
    );
    warnIfSlowServerPath('/profile', pathStartedAtMs);
    return view;
  }

  const initials = profileDisplayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const leaveDaysLeft = Math.max(0, Number(allowanceRow.data?.annual_entitlement_days ?? 0) - annualUsed);
  const tenureLabel =
    typeof (fileRow as { length_of_service_years?: number } | undefined)?.length_of_service_years === 'number' &&
    typeof (fileRow as { length_of_service_months?: number } | undefined)?.length_of_service_months === 'number'
      ? `${(fileRow as { length_of_service_years: number }).length_of_service_years}y ${(fileRow as { length_of_service_months: number }).length_of_service_months}m`
      : '—';
  const managerName =
    fileRow && (fileRow as { reports_to_name?: string }).reports_to_name
      ? String((fileRow as { reports_to_name: string }).reports_to_name)
      : '—';
  const holidayKindLabel: Record<'bank_holiday' | 'public_holiday' | 'org_break' | 'custom', string> = {
    bank_holiday: 'Bank holiday',
    public_holiday: 'Public holiday',
    org_break: 'Org break',
    custom: 'Custom',
  };
  const toShortDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingBookedLeave = (annualApprovedRes.data ?? [])
    .filter((row) => String(row.end_date) >= todayIso)
    .map((row) => ({
      id: `leave-${String(row.start_date)}-${String(row.end_date)}`,
      title: 'Booked annual leave',
      subtitle: 'Approved leave',
      start_date: String(row.start_date),
      end_date: String(row.end_date),
      kind: 'leave' as const,
    }));
  const upcomingHolidayItems = upcomingHolidayPeriods.map((h) => ({
    id: `holiday-${h.id}`,
    title: h.name,
    subtitle: holidayKindLabel[h.holiday_kind],
    start_date: h.start_date,
    end_date: h.end_date,
    kind: 'holiday' as const,
  }));
  const personalUpcomingItems = [...upcomingHolidayItems, ...upcomingBookedLeave]
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 3);
  const accentColor = 'var(--org-brand-primary,#a65843)';
  const accentSoftColor = 'color-mix(in oklab, var(--org-brand-primary,#a65843) 14%, white)';
  const softBorderStyle = {
    borderColor: '#e6dfda',
    boxShadow: '0 10px 30px rgba(35, 31, 32, 0.06)',
  } as const;
  const softDividerStyle = {
    borderColor: '#efe8e4',
  } as const;

  const view = (
    <div
      className="min-h-[calc(100vh-60px)]"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--color-background-tertiary) 92%, var(--org-brand-primary,#a65843) 8%) 0%, color-mix(in oklab, var(--color-background-tertiary) 96%, var(--org-brand-primary,#a65843) 4%) 100%)',
      }}
    >
      <ProfileUiModeSync initialMode={uiMode} />
      <div className="mx-auto max-w-[980px] px-4 py-4">
        <header className="mb-3 rounded-2xl border bg-white p-3.5" style={softBorderStyle}>
          <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr]">
            <div className="flex items-center gap-3">
              <div
                className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-xl text-[13px] font-bold"
                style={{ background: accentSoftColor, color: accentColor, border: `1px solid color-mix(in oklab, ${accentColor} 20%, transparent)` }}
              >
                {initials || '—'}
              </div>
              <div className="min-w-[220px] flex-1">
                <h1 className="text-[24px] font-semibold leading-tight text-[var(--color-text-primary)]">{profileDisplayName}</h1>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-[var(--color-text-secondary)]">
                  <span>{deptNames.length ? deptNames.join(', ') : '—'}</span>
                  <span>•</span>
                  <span>{emailDisplay}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: accentSoftColor, color: accentColor, border: `1px solid color-mix(in oklab, ${accentColor} 22%, transparent)` }}
                  >
                    {roleLabel}
                  </span>
                  {(ownRoleLabels.length ? ownRoleLabels : ['Manager']).slice(0, 2).map((role) => (
                    <span
                      key={`hero-role-${role}`}
                      className="rounded-full border px-2 py-0.5 text-[10px] text-[var(--color-text-primary)]"
                      style={{ borderColor: 'var(--color-border-tertiary)', background: 'color-mix(in oklab, var(--color-background-primary) 88%, var(--color-background-secondary) 12%)' }}
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border bg-[#fcfbfa] p-2.5" style={{ borderColor: '#ddd4cf' }}>
                <div className="mb-0.5 text-[18px] font-bold leading-none" style={{ color: accentColor }}>{leaveDaysLeft.toFixed(1)}</div>
                <div className="text-[9px] text-[var(--color-text-secondary)]">Days left</div>
              </div>
              <div className="rounded-xl border bg-[#fcfbfa] p-2.5" style={{ borderColor: '#ddd4cf' }}>
                <div className="mb-0.5 text-[18px] font-bold leading-none text-[var(--color-text-primary)]">{(directReportsRes.data ?? []).length}</div>
                <div className="text-[9px] text-[var(--color-text-secondary)]">Direct reports</div>
              </div>
              <div className="rounded-xl border bg-[#fcfbfa] p-2.5" style={{ borderColor: '#ddd4cf' }}>
                <div className="mb-0.5 text-[18px] font-bold leading-none text-[var(--color-text-primary)]">{tenureLabel}</div>
                <div className="text-[9px] text-[var(--color-text-secondary)]">Tenure</div>
              </div>
            </div>
          </div>
        </header>

        <nav className="mb-3 flex flex-wrap gap-1.5" aria-label="Profile sections">
          <Link className={tab === 'personal' ? 'rounded-full border px-2 py-1 text-[10px] font-semibold' : 'rounded-full border border-transparent px-2 py-1 text-[10px] text-[var(--color-text-secondary)] hover:bg-white'} style={tab === 'personal' ? { background: '#ffffff', borderColor: '#eadfd9', color: accentColor, boxShadow: '0 10px 30px rgba(35, 31, 32, 0.06)' } : undefined} href="?tab=personal">Personal</Link>
          <Link className={tab === 'job' ? 'rounded-full border px-2 py-1 text-[10px] font-semibold' : 'rounded-full border border-transparent px-2 py-1 text-[10px] text-[var(--color-text-secondary)] hover:bg-white'} style={tab === 'job' ? { background: '#ffffff', borderColor: '#eadfd9', color: accentColor, boxShadow: '0 10px 30px rgba(35, 31, 32, 0.06)' } : undefined} href="?tab=job">Job</Link>
          <Link className={tab === 'time-off' ? 'rounded-full border px-2 py-1 text-[10px] font-semibold' : 'rounded-full border border-transparent px-2 py-1 text-[10px] text-[var(--color-text-secondary)] hover:bg-white'} style={tab === 'time-off' ? { background: '#ffffff', borderColor: '#eadfd9', color: accentColor, boxShadow: '0 10px 30px rgba(35, 31, 32, 0.06)' } : undefined} href="?tab=time-off">Time off</Link>
          <Link className={tab === 'reporting' ? 'rounded-full border px-2 py-1 text-[10px] font-semibold' : 'rounded-full border border-transparent px-2 py-1 text-[10px] text-[var(--color-text-secondary)] hover:bg-white'} style={tab === 'reporting' ? { background: '#ffffff', borderColor: '#eadfd9', color: accentColor, boxShadow: '0 10px 30px rgba(35, 31, 32, 0.06)' } : undefined} href="?tab=reporting">Reporting line</Link>
          <Link className={tab === 'performance' ? 'rounded-full border px-2 py-1 text-[10px] font-semibold' : 'rounded-full border border-transparent px-2 py-1 text-[10px] text-[var(--color-text-secondary)] hover:bg-white'} style={tab === 'performance' ? { background: '#ffffff', borderColor: '#eadfd9', color: accentColor, boxShadow: '0 10px 30px rgba(35, 31, 32, 0.06)' } : undefined} href="?tab=performance">Performance</Link>
          <Link className={tab === 'onboarding' ? 'rounded-full border px-2 py-1 text-[10px] font-semibold' : 'rounded-full border border-transparent px-2 py-1 text-[10px] text-[var(--color-text-secondary)] hover:bg-white'} style={tab === 'onboarding' ? { background: '#ffffff', borderColor: '#eadfd9', color: accentColor, boxShadow: '0 10px 30px rgba(35, 31, 32, 0.06)' } : undefined} href="?tab=onboarding">Onboarding</Link>
          <Link className={tab === 'other' ? 'rounded-full border px-2 py-1 text-[10px] font-semibold' : 'rounded-full border border-transparent px-2 py-1 text-[10px] text-[var(--color-text-secondary)] hover:bg-white'} style={tab === 'other' ? { background: '#ffffff', borderColor: '#eadfd9', color: accentColor, boxShadow: '0 10px 30px rgba(35, 31, 32, 0.06)' } : undefined} href="?tab=other">Training &amp; other</Link>
        </nav>

        <div className="space-y-3">
          {tab === 'personal' && (
            <section id="personal" className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_360px]">
              <div className="space-y-4">
                <div className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={softBorderStyle}>
                  <div className="flex items-center justify-between border-b px-4 py-3" style={softDividerStyle}>
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Personal details</span>
                    <Link href="/settings#profile" className="text-[12px] text-[var(--org-brand-primary,#0f6e56)] hover:underline">
                      Request change
                    </Link>
                  </div>
                  <div className="p-4">
                    <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
                      <div>
                        <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--color-text-tertiary)]">Full name</dt>
                        <dd className="text-[var(--color-text-primary)]">{profileDisplayName}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--color-text-tertiary)]">Work email</dt>
                        <dd className="text-[var(--color-text-primary)]">{emailDisplay}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--color-text-tertiary)]">Department</dt>
                        <dd className="text-[var(--color-text-primary)]">{deptNames.length ? deptNames.join(', ') : '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--color-text-tertiary)]">Phone</dt>
                        <dd className="text-[var(--color-text-tertiary)] italic">Not provided</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[11px] uppercase tracking-[0.04em] text-[var(--color-text-tertiary)]">Emergency contact</dt>
                        <dd className="text-[var(--color-text-tertiary)] italic">
                          Not stored in CampSite yet. Ask your HR team if they keep this elsewhere.
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={softBorderStyle}>
                  <div className="flex items-center justify-between border-b px-4 py-3" style={softDividerStyle}>
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Leave balance</span>
                    <Link href="/leave" className="text-[12px] text-[var(--org-brand-primary,#0f6e56)] hover:underline">
                      Book time off
                    </Link>
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="text-[var(--color-text-secondary)]">Annual leave</span>
                        <strong className="font-medium text-[var(--color-text-primary)]">{leaveDaysLeft.toFixed(1)} days</strong>
                      </div>
                      <div className="h-[5px] rounded bg-[var(--color-background-secondary)]">
                        <div
                          className="h-[5px] rounded bg-[var(--org-brand-primary,#0f6e56)]"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                0,
                                (leaveDaysLeft / Math.max(1, Number(allowanceRow.data?.annual_entitlement_days ?? 0))) * 100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="text-[var(--color-text-secondary)]">Annual used</span>
                        <strong className="font-medium text-[var(--color-text-primary)]">{annualUsed} days</strong>
                      </div>
                      <div className="h-[5px] rounded bg-[var(--color-background-secondary)]">
                        <div
                          className="h-[5px] rounded bg-[var(--org-brand-primary,#0f6e56)]"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(
                                0,
                                (annualUsed / Math.max(1, Number(allowanceRow.data?.annual_entitlement_days ?? 0))) * 100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="text-[var(--color-text-secondary)]">TOIL balance</span>
                        <strong className="font-medium text-[var(--color-text-primary)]">
                          {Number(allowanceRow.data?.toil_balance_days ?? 0)} days
                        </strong>
                      </div>
                      <div className="h-[5px] rounded bg-[var(--color-background-secondary)]">
                        <div className="h-[5px] rounded bg-[var(--org-brand-primary,#0f6e56)]" style={{ width: '0%' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={softBorderStyle}>
                  <div className="border-b px-4 py-3" style={softDividerStyle}>
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Upcoming</span>
                  </div>
                  <div className="p-4">
                    {personalUpcomingItems.length === 0 ? (
                      <p className="text-[12px] text-[var(--color-text-secondary)]">No upcoming holidays or booked leave.</p>
                    ) : (
                      <ul className="space-y-2">
                        {personalUpcomingItems.map((item, index) => (
                          <li key={item.id} className={index > 0 ? 'border-t pt-2' : ''} style={index > 0 ? softDividerStyle : undefined}>
                            <div className="flex items-start gap-2">
                              <span className="mt-[5px] inline-block h-[7px] w-[7px] rounded-full bg-[var(--org-brand-primary,#0f6e56)]" />
                              <div className="flex-1">
                                <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{item.title}</p>
                                <p className="text-[11px] text-[var(--color-text-secondary)]">{item.subtitle}</p>
                              </div>
                              <p className="whitespace-nowrap text-[11px] text-[var(--color-text-tertiary)]">
                                {toShortDate(item.start_date)}
                                {item.end_date !== item.start_date ? ` - ${toShortDate(item.end_date)}` : ''}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={softBorderStyle}>
                  <div className="border-b px-4 py-3" style={softDividerStyle}>
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Quick actions</span>
                  </div>
                  <div className="grid gap-3 p-4 sm:grid-cols-2">
                    <Link href="/leave" className="flex items-center justify-between rounded-2xl border border-[#e6dfda] bg-white px-4 py-3 text-[12.5px] text-[var(--color-text-primary)] transition hover:bg-[#faf8f7]">
                      <span>Book annual leave</span>
                      <span aria-hidden>→</span>
                    </Link>
                    <Link href="/rota" className="flex items-center justify-between rounded-2xl border border-[#e6dfda] bg-white px-4 py-3 text-[12.5px] text-[var(--color-text-primary)] transition hover:bg-[#faf8f7]">
                      <span>View rota</span>
                      <span aria-hidden>→</span>
                    </Link>
                    <Link href="/performance" className="flex items-center justify-between rounded-2xl border border-[#e6dfda] bg-white px-4 py-3 text-[12.5px] text-[var(--color-text-primary)] transition hover:bg-[#faf8f7]">
                      <span>Start performance review</span>
                      <span aria-hidden>→</span>
                    </Link>
                    <Link href="?tab=other" className="flex items-center justify-between rounded-2xl border border-[#e6dfda] bg-white px-4 py-3 text-[12.5px] text-[var(--color-text-primary)] transition hover:bg-[#faf8f7]">
                      <span>View payslips</span>
                      <span aria-hidden>→</span>
                    </Link>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={softBorderStyle}>
                  <div className="border-b px-4 py-3" style={softDividerStyle}>
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Reporting to</span>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{managerName}</p>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">Current line manager</p>
                  </div>
                </div>

                <div className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={softBorderStyle}>
                  <div className="flex items-center justify-between border-b px-4 py-3" style={softDividerStyle}>
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Direct reports</span>
                    <Link href="?tab=reporting" className="text-[12px] text-[var(--org-brand-primary,#0f6e56)] hover:underline">
                      View all {(directReportsRes.data ?? []).length}
                    </Link>
                  </div>
                  <div className="p-4">
                    {(directReportsRes.data ?? []).length === 0 ? (
                      <p className="text-[12px] text-[var(--color-text-secondary)]">No direct reports.</p>
                    ) : (
                      <ul className="space-y-2">
                        {(directReportsRes.data ?? []).slice(0, 5).map((r) => {
                          const display = getDisplayName(r.full_name as string, (r.preferred_name as string | null) ?? null);
                          const personInitials = display
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase() ?? '')
                            .join('');
                          return (
                            <li key={r.id as string} className="flex items-center gap-2">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-background-secondary)] text-[11px] font-medium text-[var(--org-brand-primary,#0f6e56)]">
                                {personInitials || '—'}
                              </span>
                              <div>
                                <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{display}</p>
                                <p className="text-[11px] text-[var(--color-text-secondary)]">{r.email ? String(r.email) : 'No email'}</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={softBorderStyle}>
                  <div className="border-b px-4 py-3" style={softDividerStyle}>
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Access &amp; roles</span>
                  </div>
                  <div className="flex flex-wrap gap-2 px-4 py-3">
                    {(ownRoleLabels.length ? ownRoleLabels : [roleLabel]).map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_10%,var(--color-background-primary))] px-3 py-1 text-[12px] text-[var(--color-text-secondary)]"
                        style={softBorderStyle}
                      >
                        {role}
                      </span>
                    ))}
                    {(directReportsRes.data ?? []).length > 0 && !ownRoleLabels.includes('Manager') ? (
                      <span
                        className="rounded-full bg-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_10%,var(--color-background-primary))] px-3 py-1 text-[12px] text-[var(--color-text-secondary)]"
                        style={softBorderStyle}
                      >
                        Manager
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          )}

          {tab === 'job' && (
            <section
              id="job"
              className="rounded-2xl border bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
              style={softBorderStyle}
            >
              {probationItems.length > 0 ? (
                <div className="mb-4 space-y-2">
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
                <p className="text-[13px] text-[var(--color-text-secondary)]">
                  No HR job record yet. Your HR administrator can add this under Employee records.
                </p>
              ) : (
                <dl className="grid gap-3 sm:grid-cols-2 text-[13px]">
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Job title</dt>
                    <dd className="text-[var(--color-text-primary)]">{String(fileRow.job_title ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Grade</dt>
                    <dd className="text-[var(--color-text-primary)]">{String(fileRow.grade_level ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Pay grade</dt>
                    <dd className="text-[var(--color-text-primary)]">{String((fileRow as { pay_grade?: string }).pay_grade ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Position type</dt>
                    <dd className="text-[var(--color-text-primary)]">{String((fileRow as { position_type?: string }).position_type ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Employment basis</dt>
                    <dd className="text-[var(--color-text-primary)]">{String((fileRow as { employment_basis?: string }).employment_basis ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Contract</dt>
                    <dd className="text-[var(--color-text-primary)]">{labelContract((fileRow.contract_type as string | null) ?? null)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">FTE</dt>
                    <dd className="text-[var(--color-text-primary)]">{fileRow.fte ? `${Math.round(Number(fileRow.fte) * 100)}%` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Weekly hours</dt>
                    <dd className="text-[var(--color-text-primary)]">{String((fileRow as { weekly_hours?: number }).weekly_hours ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Work location</dt>
                    <dd className="text-[var(--color-text-primary)]">{labelLocation((fileRow.work_location as string | null) ?? null)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Employment start</dt>
                    <dd className="text-[var(--color-text-primary)]">{String(fileRow.employment_start_date ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Length of service</dt>
                    <dd className="text-[var(--color-text-primary)]">
                      {typeof (fileRow as { length_of_service_years?: number }).length_of_service_years === 'number' &&
                      typeof (fileRow as { length_of_service_months?: number }).length_of_service_months === 'number'
                        ? `${(fileRow as { length_of_service_years: number }).length_of_service_years}y ${(fileRow as { length_of_service_months: number }).length_of_service_months}m`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Dept. start</dt>
                    <dd className="text-[var(--color-text-primary)]">{String((fileRow as { department_start_date?: string }).department_start_date ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Continuous employment</dt>
                    <dd className="text-[var(--color-text-primary)]">{String((fileRow as { continuous_employment_start_date?: string }).continuous_employment_start_date ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Probation end</dt>
                    <dd className="text-[var(--color-text-primary)]">{String(fileRow.probation_end_date ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Notice period (weeks)</dt>
                    <dd className="text-[var(--color-text-primary)]">{String(fileRow.notice_period_weeks ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Salary band</dt>
                    <dd className="text-[var(--color-text-primary)]">{String(fileRow.salary_band ?? '—')}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Budget</dt>
                    <dd className="text-[var(--color-text-primary)]">
                      {(fileRow as { budget_amount?: number }).budget_amount != null
                        ? `${(fileRow as { budget_amount: number }).budget_amount} ${String((fileRow as { budget_currency?: string }).budget_currency ?? '').trim()}`.trim()
                        : '—'}
                    </dd>
                  </div>
                </dl>
              )}
            </section>
          )}

          {tab === 'time-off' && (
            <section id="time-off" className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={softBorderStyle}>
                <div className="flex items-center justify-between border-b px-4 py-3" style={softDividerStyle}>
                  <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Leave balance</span>
                  <Link href="/leave" className="text-[12px] text-[var(--org-brand-primary,#0f6e56)] hover:underline">
                    Book time off
                  </Link>
                </div>
                <div className="space-y-3 p-4">
                  <p className="text-[12px] text-[var(--color-text-secondary)]">
                    Leave year {profileLeaveYearKey} · {formatLeaveYearPeriodRange(profileLeaveYearKey, sm, sd)}
                  </p>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-[var(--color-text-secondary)]">Annual leave remaining</span>
                      <strong className="font-medium text-[var(--color-text-primary)]">{leaveDaysLeft.toFixed(1)} days</strong>
                    </div>
                    <div className="h-[5px] rounded bg-[var(--color-background-secondary)]">
                      <div
                        className="h-[5px] rounded bg-[var(--org-brand-primary,#0f6e56)]"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              (leaveDaysLeft / Math.max(1, Number(allowanceRow.data?.annual_entitlement_days ?? 0))) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-[var(--color-text-secondary)]">Annual leave used</span>
                      <strong className="font-medium text-[var(--color-text-primary)]">{annualUsed} days</strong>
                    </div>
                    <div className="h-[5px] rounded bg-[var(--color-background-secondary)]">
                      <div
                        className="h-[5px] rounded bg-[var(--org-brand-primary,#0f6e56)]"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              (annualUsed / Math.max(1, Number(allowanceRow.data?.annual_entitlement_days ?? 0))) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-[var(--color-text-secondary)]">TOIL balance</span>
                      <strong className="font-medium text-[var(--color-text-primary)]">
                        {Number(allowanceRow.data?.toil_balance_days ?? 0)} days
                      </strong>
                    </div>
                    <div className="h-[5px] rounded bg-[var(--color-background-secondary)]">
                      <div className="h-[5px] rounded bg-[var(--org-brand-primary,#0f6e56)]" style={{ width: '0%' }} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={softBorderStyle}>
                <div className="flex items-center justify-between border-b px-4 py-3" style={softDividerStyle}>
                  <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Upcoming holidays</span>
                </div>
                <div className="p-4">
                  {upcomingHolidayPeriods.length === 0 ? (
                    <p className="text-[12px] text-[var(--color-text-secondary)]">No upcoming holiday periods configured.</p>
                  ) : (
                    <ul className="space-y-2">
                      {upcomingHolidayPeriods.slice(0, 5).map((h, index) => (
                        <li key={h.id} className={index > 0 ? 'border-t pt-2' : ''} style={index > 0 ? softDividerStyle : undefined}>
                          <div className="flex items-start gap-2">
                            <span className="mt-[5px] inline-block h-[7px] w-[7px] rounded-full bg-[var(--org-brand-primary,#0f6e56)]" />
                            <div className="flex-1">
                              <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{h.name}</p>
                              <p className="text-[11px] text-[var(--color-text-secondary)]">
                                {holidayKindLabel[h.holiday_kind]}
                              </p>
                            </div>
                            <p className="whitespace-nowrap text-[11px] text-[var(--color-text-tertiary)]">
                              {toShortDate(h.start_date)}
                              {h.end_date !== h.start_date ? ` - ${toShortDate(h.end_date)}` : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]" style={softBorderStyle}>
                <div className="flex items-center justify-between border-b px-4 py-3" style={softDividerStyle}>
                  <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">Direct reports</span>
                  <Link href="?tab=reporting" className="text-[12px] text-[var(--org-brand-primary,#0f6e56)] hover:underline">
                    View all {(directReportsRes.data ?? []).length}
                  </Link>
                </div>
                <div className="p-4">
                  {(directReportsRes.data ?? []).length === 0 ? (
                    <p className="text-[12px] text-[var(--color-text-secondary)]">No direct reports.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(directReportsRes.data ?? []).slice(0, 3).map((r) => {
                        const display = getDisplayName(r.full_name as string, (r.preferred_name as string | null) ?? null);
                        const personInitials = display
                          .split(' ')
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0]?.toUpperCase() ?? '')
                          .join('');
                        return (
                          <li key={r.id as string} className="flex items-center gap-2">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-background-secondary)] text-[11px] font-medium text-[var(--org-brand-primary,#0f6e56)]">
                              {personInitials || '—'}
                            </span>
                            <div>
                              <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{display}</p>
                              <p className="text-[11px] text-[var(--color-text-secondary)]">{r.email ? String(r.email) : 'No email'}</p>
                            </div>
                          </li>
                        );
                      })}
                      {(directReportsRes.data ?? []).length > 3 ? (
                        <li className="pt-1 text-[12px] text-[var(--color-text-tertiary)]">
                          + {(directReportsRes.data ?? []).length - 3} more
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          )}

          {tab === 'reporting' && <section id="reporting" className="pt-2">
            <div
              className="rounded-2xl border bg-white p-6 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
              style={softBorderStyle}
            >
              <div>
                <p className="text-[var(--color-text-tertiary)]">Manager</p>
                <p className="mt-1 text-[var(--color-text-primary)]">{managerName}</p>
              </div>
              <div className="mt-4">
                <p className="text-[var(--color-text-tertiary)]">Direct reports</p>
                <div className="mt-2">
                  {(directReportsRes.data ?? []).length === 0 ? (
                    <span className="text-[var(--color-text-secondary)]">None</span>
                  ) : (
                    <ul className="space-y-1">
                      {(directReportsRes.data ?? []).map((r) => (
                        <li key={r.id as string} className="text-[var(--color-text-primary)]">
                          {getDisplayName(r.full_name as string, (r.preferred_name as string | null) ?? null)}
                          {r.email ? (
                            <span className="text-[var(--color-text-tertiary)]"> · {String(r.email)}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <p className="mt-4 text-[13px]">
                <Link href="/hr/org-chart" className="font-medium text-[var(--org-brand-primary,#0f6e56)] underline underline-offset-2">
                  Org chart
                </Link>{' '}
                (if you have access)
              </p>
            </div>
          </section>}

          {tab === 'performance' && <section id="performance" className="pt-2">
            <div
              className="rounded-2xl border bg-white p-6 text-[13px] text-[var(--color-text-primary)] shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
              style={softBorderStyle}
            >
              {canPerf ? (
                <p>
                  <Link href="/performance" className="font-medium text-[var(--org-brand-primary,#0f6e56)] underline underline-offset-2">
                    Open performance reviews
                  </Link>{' '}
                  for your goals and review cycles.
                </p>
              ) : (
                <p className="text-[var(--color-text-secondary)]">Performance reviews are not enabled for your account.</p>
              )}
            </div>
          </section>}

          {tab === 'onboarding' && <section id="onboarding" className="pt-2">
            <div
              className="rounded-2xl border bg-white p-6 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
              style={softBorderStyle}
            >
              {onboardingActive ? (
                <p>
                  You have an active onboarding run.{' '}
                  <Link href="/onboarding" className="font-medium text-[var(--org-brand-primary,#0f6e56)] underline underline-offset-2">
                    Continue onboarding
                  </Link>
                </p>
              ) : (
                <p className="text-[var(--color-text-secondary)]">No active onboarding checklist.</p>
              )}
            </div>
          </section>}

          {tab === 'other' && <section id="other" className="pt-2 pb-4">
            <div
              className="space-y-3 rounded-2xl border bg-white p-6 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
              style={softBorderStyle}
            >
              <p className="text-[var(--color-text-secondary)]">
                <strong className="text-[var(--color-text-primary)]">Training &amp; certifications:</strong> use the
                dedicated training records module below to track completions, providers, and expiry dates.
              </p>
              <p className="text-[var(--color-text-secondary)]">
                <strong className="text-[var(--color-text-primary)]">Documents:</strong> your employee photo and ID records are available below.
                ID number display is masked for privacy.
              </p>
              {(canRecordExportOwn && (canRecordExportCsv || canRecordExportPdf)) ? (
                <div className="flex flex-wrap gap-2">
                  {canRecordExportCsv ? (
                    <a
                      href="/api/hr/records/export?format=csv"
                      className="rounded-lg border bg-[var(--color-background-primary)] px-3 py-1.5 text-[12.5px] text-[var(--color-text-primary)] hover:bg-[var(--color-background-secondary)]"
                      style={softBorderStyle}
                    >
                      Export my record (CSV)
                    </a>
                  ) : null}
                  {canRecordExportPdf ? (
                    <a
                      href="/api/hr/records/export?format=pdf"
                      className="rounded-lg border bg-[var(--color-background-primary)] px-3 py-1.5 text-[12.5px] text-[var(--color-text-primary)] hover:bg-[var(--color-background-secondary)]"
                      style={softBorderStyle}
                    >
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
              <TrainingRecordsClient
                subjectUserId={user.id}
                canEdit={true}
                initialRows={ownTrainingRows}
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
                  initialEvents={(ownCaseEventsRes.data ?? []).map((e) => ({
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
                <p className="text-[var(--color-text-tertiary)]">HR notes</p>
                <p className="mt-1 text-[var(--color-text-primary)]">
                  {fileRow && fileRow.notes != null && String(fileRow.notes).trim() !== ''
                    ? String(fileRow.notes)
                    : '—'}
                </p>
              </div>
            </div>
          </section>}
        </div>
      </div>
    </div>
  );
  warnIfSlowServerPath('/profile', pathStartedAtMs);
  return view;
}
