import { EmployeeHRFileClient } from '@/components/admin/hr/EmployeeHRFileClient';
import { EmployeeHrRecordGenZClient } from '@/components/admin/hr/EmployeeHrRecordGenZClient';
import { EmployeeRecordHeroActionMenu } from '@/components/admin/hr/EmployeeRecordHeroActionMenu';
import { BankDetailsClient } from '@/components/hr/BankDetailsClient';
import { CustomHrFieldsValuesClient } from '@/components/hr/CustomHrFieldsValuesClient';
import { DisciplinaryGrievanceLogClient } from '@/components/hr/DisciplinaryGrievanceLogClient';
import { EmploymentHistoryClient } from '@/components/hr/EmploymentHistoryClient';
import { MedicalNotesClient } from '@/components/hr/MedicalNotesClient';
import { TaxDocumentsClient } from '@/components/hr/TaxDocumentsClient';
import { UkTaxDetailsClient } from '@/components/hr/UkTaxDetailsClient';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { getDisplayName } from '@/lib/names';
import { redirect } from 'next/navigation';
import { normalizeUiMode } from '@/lib/uiMode';
import { withServerPerf, warnIfSlowServerPath } from '@/lib/perf/serverPerf';
import { getCachedAdminHrEmployeePageData } from '@/lib/admin/getCachedAdminHrEmployeePageData';
import { getCachedAdminHrEmployeeLimitedProfileData } from '@/lib/admin/getCachedAdminHrEmployeeLimitedProfileData';

export default async function EmployeeHRFilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const pathStartedAtMs = Date.now();
  const { userId } = await params;
  const bundle = await withServerPerf(
    '/admin/hr/[userId]',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const viewerUserIdRaw = (bundle as Record<string, unknown>)['user_id'];
  const viewerUserId = typeof viewerUserIdRaw === 'string' ? viewerUserIdRaw : '';
  if (!viewerUserId) redirect('/login');
  const viewerUiMode =
    typeof bundle.ui_mode === 'string' ? normalizeUiMode(bundle.ui_mode) : normalizeUiMode(null);

  const canViewAll = permissionKeys.includes('hr.view_records');
  const canViewTeam = permissionKeys.includes('hr.view_direct_reports');
  const limitedProfileView = !canViewAll && !canViewTeam;
  if (limitedProfileView) {
    const limitedData = await withServerPerf(
      '/admin/hr/[userId]',
      'cached_admin_hr_employee_limited_profile',
      getCachedAdminHrEmployeeLimitedProfileData(orgId, userId),
      500
    );
    if (!limitedData) redirect('/admin/hr');
    const pronouns =
      Boolean(limitedData.targetProfile.show_pronouns) &&
      String(limitedData.targetProfile.pronouns ?? '').trim()
        ? String(limitedData.targetProfile.pronouns).trim()
      : '';
    return (
      <div className="w-full px-5 py-6 sm:px-[28px] sm:py-7">
        <div className="rounded-2xl border border-[#e8e8e8] bg-white p-6">
          <h1 className="font-authSerif text-[26px] leading-tight text-[#121212]">
            {getDisplayName(limitedData.targetProfile.full_name, null)}
          </h1>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Full name</p>
              <p className="text-[14px] text-[#121212]">{limitedData.targetProfile.full_name}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Preferred name</p>
              <p className="text-[14px] text-[#121212]">{limitedData.targetProfile.preferred_name ?? ''}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Pronouns</p>
              <p className="text-[14px] text-[#121212]">{pronouns}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Work email</p>
              <p className="text-[14px] text-[#121212]">{limitedData.targetProfile.email ?? ''}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Department</p>
              <p className="text-[14px] text-[#121212]">
                {limitedData.deptNames.length ? limitedData.deptNames.join(', ') : ''}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canManageLeaveOrg = permissionKeys.includes('leave.manage_org');
  const canManage = permissionKeys.includes('hr.manage_records');
  const canPhotoManageAll = permissionKeys.includes('hr.employee_photo.manage_all');
  const canPhotoViewAll = permissionKeys.includes('hr.employee_photo.view_all');
  const canIdManageAll = permissionKeys.includes('hr.id_document.manage_all');
  const canIdViewAll = permissionKeys.includes('hr.id_document.view_all');
  const canPayrollBankViewAll = permissionKeys.includes('payroll.bank_details.view_all');
  const canPayrollBankManageAll = permissionKeys.includes('payroll.bank_details.manage_all');
  const canPayrollBankExport = permissionKeys.includes('payroll.bank_details.export');
  const canUkTaxViewAll = permissionKeys.includes('payroll.uk_tax.view_all');
  const canUkTaxManageAll = permissionKeys.includes('payroll.uk_tax.manage_all');
  const canUkTaxExport = permissionKeys.includes('payroll.uk_tax.export');
  const canTaxDocsViewAll = permissionKeys.includes('payroll.tax_docs.view_all');
  const canTaxDocsManageAll = permissionKeys.includes('payroll.tax_docs.manage_all');
  const canTaxDocsExport = permissionKeys.includes('payroll.tax_docs.export');
  const canEmploymentHistoryViewAll = permissionKeys.includes('hr.employment_history.view_all');
  const canEmploymentHistoryManageAll = permissionKeys.includes('hr.employment_history.manage_all');
  const canDisciplinaryViewAll = permissionKeys.includes('hr.disciplinary.view_all');
  const canDisciplinaryManageAll = permissionKeys.includes('hr.disciplinary.manage_all');
  const canGrievanceViewAll = permissionKeys.includes('hr.grievance.view_all');
  const canGrievanceManageAll = permissionKeys.includes('hr.grievance.manage_all');
  const canMedicalViewAll = permissionKeys.includes('hr.medical_notes.view_all');
  const canMedicalManageAll = permissionKeys.includes('hr.medical_notes.manage_all');
  const canMedicalRevealSensitive = permissionKeys.includes('hr.medical_notes.reveal_sensitive');
  const canMedicalExport = permissionKeys.includes('hr.medical_notes.export');
  const canCustomFieldsView = permissionKeys.includes('hr.custom_fields.view');
  const canCustomFieldsManageValuesAll = permissionKeys.includes(
    'hr.custom_fields.manage_values_all'
  );
  const canRecordExportCsv = permissionKeys.includes('hr.records_export.generate_csv');
  const canRecordExportPdf = permissionKeys.includes('hr.records_export.generate_pdf');
  const canRecordExportSensitive = permissionKeys.includes('hr.records_export.include_sensitive');

  const canViewSensitiveCaseData = Boolean(
    canDisciplinaryViewAll ||
    canDisciplinaryManageAll ||
    canGrievanceViewAll ||
    canGrievanceManageAll
  );

  const pageData = await withServerPerf(
    '/admin/hr/[userId]',
    'cached_admin_hr_employee_page_data',
    getCachedAdminHrEmployeePageData(orgId, userId, canViewSensitiveCaseData),
    900
  );

  const hrFileLeaveYearKey = pageData.hrFileLeaveYearKey;
  const hrFileLeaveYearUiLabel = pageData.hrFileLeaveYearUiLabel;
  const fileRow = pageData.fileRow;
  if (!fileRow) redirect('/admin/hr');

  const canMarkProbationCheck =
    canManage || (!!canViewTeam && (fileRow.reports_to_user_id as string | null) === viewerUserId);

  const hrDocRows = pageData.hrDocRows;
  const dependantRows = pageData.dependantRows;
  const bankRows = pageData.bankRows;
  const ukTaxRows = pageData.ukTaxRows;
  const taxDocRows = pageData.taxDocRows;
  const employmentHistoryRows = pageData.employmentHistoryRows;
  const caseRows = pageData.caseRows;
  const medicalRows = pageData.medicalRows;
  const customFieldDefs = pageData.customFieldDefs;
  const customCategoryRows = pageData.customCategoryRows;
  const applications = pageData.applications;
  const leaveData = pageData.leaveData;
  const auditRows = pageData.auditRows;
  const caseEventRows = pageData.caseEventRows;
  const medicalEventRows = pageData.medicalEventRows;
  const customFieldValues = pageData.customFieldValues;
  const activePrivacyRequest = pageData.activePrivacyRequest;
  const changerNames = pageData.changerNames;
  const docUploaderNames = pageData.docUploaderNames;
  const hasPartialData = pageData.partialData === true;
  const partialSectionSummary = (pageData.partialSections ?? [])
    .map((label) => String(label).replaceAll('_', ' '))
    .slice(0, 3)
    .join(', ');

  const categoryNameById = new Map<string, string>(
    (customCategoryRows ?? []).map((r) => [r.id as string, r.name as string])
  );
  const b0 = Array.isArray(pageData.sickScore) ? pageData.sickScore[0] : pageData.sickScore;
  const absenceScore =
    b0 && typeof b0 === 'object' && 'bradford_score' in b0
      ? {
          spell_count: Number((b0 as { spell_count: number }).spell_count),
          total_days: Number((b0 as { total_days: number }).total_days),
          bradford_score: Number((b0 as { bradford_score: number }).bradford_score),
        }
      : null;

  const recordExport = {
    canCsv: canRecordExportCsv,
    canPdf: canRecordExportPdf,
    canSensitive: Boolean(canRecordExportSensitive && canRecordExportCsv),
  };
  const approvedBankRow = (bankRows ?? []).find(
    (r) => String(r.status ?? '') === 'approved' && Boolean(r.is_active)
  );
  const pendingBankCount = (bankRows ?? []).filter(
    (r) => String(r.status ?? '') === 'pending'
  ).length;
  const approvedUkTaxRow = (ukTaxRows ?? []).find(
    (r) => String(r.status ?? '') === 'approved' && Boolean(r.is_active)
  );
  const pendingUkTaxCount = (ukTaxRows ?? []).filter(
    (r) => String(r.status ?? '') === 'pending'
  ).length;
  const currentTaxDocCount = (taxDocRows ?? []).filter((r) => Boolean(r.is_current)).length;
  const openCaseCount = (caseRows ?? []).filter(
    (r) => !r.archived_at && String(r.status ?? 'open') !== 'closed'
  ).length;
  const openMedicalCount = (medicalRows ?? []).filter(
    (r) => !r.archived_at && String(r.status ?? 'open') !== 'closed'
  ).length;
  const populatedCustomFieldCount = (customFieldValues ?? []).filter((v) => {
    if (typeof v.value === 'string') return v.value.trim().length > 0;
    return v.value != null;
  }).length;

  const tabBadges: Partial<
    Record<
      'leave' | 'payroll' | 'tax' | 'history' | 'cases' | 'medical' | 'custom',
      { text: string; tone?: 'default' | 'warning' | 'danger' | 'info' | 'success' }
    >
  > = {};

  if (absenceScore && absenceScore.bradford_score >= 200) {
    tabBadges.leave = { text: String(absenceScore.bradford_score), tone: 'danger' };
  }

  if (canPayrollBankViewAll || canPayrollBankManageAll) {
    if (pendingBankCount > 0) {
      tabBadges.payroll = { text: String(pendingBankCount), tone: 'warning' };
    } else if (!approvedBankRow) {
      tabBadges.payroll = { text: '!', tone: 'warning' };
    }
  }

  if (canUkTaxViewAll || canUkTaxManageAll || canTaxDocsViewAll || canTaxDocsManageAll) {
    if (pendingUkTaxCount > 0) {
      tabBadges.tax = { text: String(pendingUkTaxCount), tone: 'warning' };
    } else if (!approvedUkTaxRow || currentTaxDocCount === 0) {
      tabBadges.tax = { text: '!', tone: 'warning' };
    }
  }

  if (canEmploymentHistoryViewAll || canEmploymentHistoryManageAll) {
    tabBadges.history = {
      text: String((employmentHistoryRows ?? []).length),
      tone: (employmentHistoryRows ?? []).length > 0 ? 'default' : 'info',
    };
  }

  if (
    canDisciplinaryViewAll ||
    canDisciplinaryManageAll ||
    canGrievanceViewAll ||
    canGrievanceManageAll ||
    canViewTeam
  ) {
    if (openCaseCount > 0) {
      tabBadges.cases = { text: String(openCaseCount), tone: 'warning' };
    } else if ((caseRows ?? []).length > 0) {
      tabBadges.cases = { text: String((caseRows ?? []).length), tone: 'default' };
    }
  }

  if (canMedicalViewAll || canMedicalManageAll) {
    if (openMedicalCount > 0) {
      tabBadges.medical = { text: String(openMedicalCount), tone: 'info' };
    } else if ((medicalRows ?? []).length > 0) {
      tabBadges.medical = { text: String((medicalRows ?? []).length), tone: 'default' };
    }
  }

  if (canCustomFieldsView || canCustomFieldsManageValuesAll) {
    if ((customFieldDefs ?? []).length > 0) {
      tabBadges.custom = {
        text: `${populatedCustomFieldCount}/${(customFieldDefs ?? []).length}`,
        tone: populatedCustomFieldCount > 0 ? 'default' : 'info',
      };
    }
  }

  const overviewWarnings: Array<{
    id: string;
    title: string;
    detail: string;
    tone: 'danger' | 'warning' | 'info';
  }> = [];

  if (activePrivacyRequest) {
    overviewWarnings.push({
      id: 'privacy-request',
      title: `Active GDPR erasure request is ${String(activePrivacyRequest.status)}.`,
      detail: `Submitted ${String(activePrivacyRequest.created_at).slice(0, 10)}.`,
      tone: 'warning',
    });
  }

  if (openCaseCount > 0) {
    overviewWarnings.push({
      id: 'case-open',
      title: `${openCaseCount} open disciplinary/grievance case${openCaseCount === 1 ? '' : 's'}.`,
      detail: 'Review the case tab for status, hearings, outcomes, and archived items.',
      tone: 'warning',
    });
  }

  if (openMedicalCount > 0) {
    overviewWarnings.push({
      id: 'medical-open',
      title: `${openMedicalCount} open medical / occupational health record${openMedicalCount === 1 ? '' : 's'}.`,
      detail: 'Check the medical tab for fit-for-work outcomes, review dates, and adjustments.',
      tone: 'info',
    });
  }

  const payrollPanel =
    canPayrollBankViewAll || canPayrollBankManageAll ? (
      <div className="mt-6">
        <BankDetailsClient
          title="Bank details (payroll)"
          description="Masked by default. Full reveal and export are audited."
          subjectUserId={userId}
          initialRows={(bankRows ?? []).map((r) => ({
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
            viewAll: Boolean(canPayrollBankViewAll),
            manageAll: Boolean(canPayrollBankManageAll),
            viewOwn: false,
            manageOwn: false,
            canExport: Boolean(canPayrollBankExport),
          }}
        />
      </div>
    ) : null;

  const taxPanel =
    canUkTaxViewAll || canUkTaxManageAll || canTaxDocsViewAll || canTaxDocsManageAll ? (
      <div className="mt-6 space-y-4">
        {canUkTaxViewAll || canUkTaxManageAll ? (
          <UkTaxDetailsClient
            subjectUserId={userId}
            initialRows={(ukTaxRows ?? []).map((r) => ({
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
              viewAll: Boolean(canUkTaxViewAll),
              manageAll: Boolean(canUkTaxManageAll),
              viewOwn: false,
              manageOwn: false,
              canExport: Boolean(canUkTaxExport),
            }}
          />
        ) : null}
        {canTaxDocsViewAll || canTaxDocsManageAll ? (
          <TaxDocumentsClient
            orgId={orgId}
            subjectUserId={userId}
            actorUserId={viewerUserId}
            initialDocs={(taxDocRows ?? []).map((r) => ({
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
              viewAll: Boolean(canTaxDocsViewAll),
              manageAll: Boolean(canTaxDocsManageAll),
              viewOwn: false,
              uploadOwn: false,
              canExport: Boolean(canTaxDocsExport),
            }}
          />
        ) : null}
      </div>
    ) : null;

  const historyPanel =
    canEmploymentHistoryViewAll || canEmploymentHistoryManageAll ? (
      <div className="mt-6">
        <EmploymentHistoryClient
          subjectUserId={userId}
          canEdit={Boolean(canEmploymentHistoryManageAll)}
          initialRows={(employmentHistoryRows ?? []).map((r) => ({
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
            source: ((r.source as string) ?? 'manual') as
              | 'manual'
              | 'auto_from_hr_record'
              | 'employee_request',
          }))}
        />
      </div>
    ) : null;

  const casesPanel =
    canDisciplinaryViewAll ||
    canDisciplinaryManageAll ||
    canGrievanceViewAll ||
    canGrievanceManageAll ||
    canViewTeam ? (
      <div className="mt-6">
        <DisciplinaryGrievanceLogClient
          orgId={orgId}
          subjectUserId={userId}
          initialCases={(caseRows ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            case_type: ((r.case_type as string) ?? 'disciplinary') as 'disciplinary' | 'grievance',
            case_ref: (r.case_ref as string) ?? '',
            category: (r.category as string | null) ?? null,
            severity: (r.severity as string | null) ?? null,
            status: ((r.status as string) ?? 'open') as
              | 'open'
              | 'investigating'
              | 'hearing'
              | 'outcome_issued'
              | 'appeal'
              | 'closed',
            incident_date: (r.incident_date as string | null) ?? null,
            reported_date: (r.reported_date as string | null) ?? null,
            hearing_date: (r.hearing_date as string | null) ?? null,
            outcome_effective_date: (r.outcome_effective_date as string | null) ?? null,
            review_date: (r.review_date as string | null) ?? null,
            summary: (r.summary as string | null) ?? null,
            allegations_details: (r.allegations_details as string | null) ?? null,
            outcome_action: (r.outcome_action as string | null) ?? null,
            appeal_submitted: Boolean(r.appeal_submitted),
            appeal_outcome: (r.appeal_outcome as string | null) ?? null,
            owner_user_id: (r.owner_user_id as string | null) ?? null,
            investigator_user_id: (r.investigator_user_id as string | null) ?? null,
            witness_details: (r.witness_details as string | null) ?? null,
            investigation_notes: (r.investigation_notes as string | null) ?? null,
            internal_notes: (r.internal_notes as string | null) ?? null,
            linked_documents: r.linked_documents ?? [],
            archived_at: (r.archived_at as string | null) ?? null,
            created_at: r.created_at as string,
          }))}
          initialEvents={(caseEventRows ?? []).map((e) => ({
            id: e.id as string,
            case_id: e.case_id as string,
            event_type: (e.event_type as string) ?? 'updated',
            old_status: (e.old_status as string | null) ?? null,
            new_status: (e.new_status as string | null) ?? null,
            created_at: e.created_at as string,
          }))}
          permissions={{
            canManageDisciplinary: Boolean(canDisciplinaryManageAll),
            canManageGrievance: Boolean(canGrievanceManageAll),
            canViewSensitive: canViewSensitiveCaseData,
          }}
        />
      </div>
    ) : null;

  const medicalPanel =
    canMedicalViewAll || canMedicalManageAll ? (
      <div className="mt-6">
        <MedicalNotesClient
          subjectUserId={userId}
          initialRows={(medicalRows ?? []).map((r) => ({
            id: r.id as string,
            case_ref: (r.case_ref as string) ?? '',
            referral_reason: (r.referral_reason as string | null) ?? null,
            status: ((r.status as string) ?? 'open') as
              | 'open'
              | 'under_review'
              | 'fit_note_received'
              | 'closed',
            fit_for_work_outcome: (r.fit_for_work_outcome as string | null) ?? null,
            recommended_adjustments: (r.recommended_adjustments as string | null) ?? null,
            review_date: (r.review_date as string | null) ?? null,
            next_review_date: (r.next_review_date as string | null) ?? null,
            summary_for_employee: (r.summary_for_employee as string | null) ?? null,
            archived_at: (r.archived_at as string | null) ?? null,
            created_at: r.created_at as string,
          }))}
          initialEvents={(medicalEventRows ?? []).map((e) => ({
            id: e.id as string,
            medical_note_id: e.medical_note_id as string,
            event_type: (e.event_type as string) ?? 'updated',
            reason: (e.reason as string | null) ?? null,
            created_at: e.created_at as string,
          }))}
          permissions={{
            viewAll: Boolean(canMedicalViewAll),
            manageAll: Boolean(canMedicalManageAll),
            viewOwnSummary: false,
            revealSensitive: Boolean(canMedicalRevealSensitive),
            canExport: Boolean(canMedicalExport),
            manageOwn: false,
          }}
        />
      </div>
    ) : null;

  const customFieldsPanel =
    canCustomFieldsView || canCustomFieldsManageValuesAll ? (
      <div className="mt-6">
        <CustomHrFieldsValuesClient
          orgId={orgId}
          subjectUserId={userId}
          definitions={(customFieldDefs ?? []).map((d) => ({
            id: d.id as string,
            key: d.key as string,
            label: d.label as string,
            section: (d.section as string) ?? 'personal',
            field_type: (d.field_type as string) ?? 'text',
            options: d.options ?? [],
            is_required: Boolean(d.is_required),
          }))}
          initialValues={(customFieldValues ?? []).map((v) => ({
            definition_id: v.definition_id as string,
            value: v.value,
          }))}
          canEdit={Boolean(canCustomFieldsManageValuesAll)}
        />
      </div>
    ) : null;

  if (viewerUiMode === 'interactive') {
    const view = (
      <>
        {canRecordExportCsv || canRecordExportPdf || recordExport.canSensitive ? (
          <div className="mx-auto mt-4 flex max-w-7xl justify-end px-5 sm:px-7">
            <EmployeeRecordHeroActionMenu
              subjectUserId={userId}
              showEdit={false}
              onEdit={() => {}}
              editLabel="Edit record"
              canExportCsv={recordExport.canCsv}
              canExportPdf={recordExport.canPdf}
              canExportSensitive={recordExport.canSensitive}
            />
          </div>
        ) : null}
        {activePrivacyRequest ? (
          <div className="mx-auto mt-4 max-w-7xl rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12.5px] text-[#854d0e]">
            Active GDPR erasure request: <strong>{String(activePrivacyRequest.status)}</strong>{' '}
            (submitted {String(activePrivacyRequest.created_at).slice(0, 10)}).
          </div>
        ) : null}
        {hasPartialData ? (
          <div className="mx-auto mt-4 max-w-7xl rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12.5px] text-[#854d0e]">
            Some HR detail sections are temporarily delayed and may be partially loaded.
            {partialSectionSummary ? ` Delayed areas include ${partialSectionSummary}.` : ''}
          </div>
        ) : null}
        <EmployeeHrRecordGenZClient
          orgId={orgId}
          subjectUserId={userId}
          actorUserId={viewerUserId}
          centerLabel={String(
            (fileRow.display_name as string | null) ??
              (fileRow.full_name as string | null) ??
              'Employee'
          )}
          centerDescription="The employee profile is the center node. Surrounding branches map payroll, compliance, and casework modules."
          nodes={[
            {
              id: 'record-core-node',
              label: 'Record Core',
              description: 'Core employee record and audit events.',
              facts: [
                { label: 'Status', value: String(fileRow.status ?? '') },
                { label: 'Department', value: String(fileRow.department_name ?? '') },
                { label: 'Job title', value: String(fileRow.job_title ?? '') },
              ],
            },
            {
              id: 'documents-node',
              label: 'Documents & ID',
              description: 'Employee photo, ID documents, and supporting files.',
              facts: [
                { label: 'Total docs', value: `${(hrDocRows ?? []).length}` },
                {
                  label: 'ID docs',
                  value: `${(hrDocRows ?? []).filter((d) => String(d.document_kind ?? '') === 'id_document').length}`,
                },
                {
                  label: 'Photos',
                  value: `${(hrDocRows ?? []).filter((d) => String(d.document_kind ?? '') === 'employee_photo').length}`,
                },
              ],
            },
            {
              id: 'dependants-node',
              label: 'Dependants',
              description: 'Dependants, beneficiaries, and emergency contact relationships.',
              facts: [
                { label: 'Entries', value: `${(dependantRows ?? []).length}` },
                {
                  label: 'Beneficiaries',
                  value: `${(dependantRows ?? []).filter((d) => Boolean(d.is_beneficiary)).length}`,
                },
                {
                  label: 'Emergency contacts',
                  value: `${(dependantRows ?? []).filter((d) => Boolean(d.is_emergency_contact)).length}`,
                },
              ],
            },
            {
              id: 'leave-absence-node',
              label: 'Leave & Absence',
              description: 'Allowance context and Bradford absence score.',
              facts: [
                { label: 'Leave year', value: hrFileLeaveYearUiLabel },
                {
                  label: 'Annual entitlement',
                  value: `${Number(leaveData?.annual_entitlement_days ?? 0)} days`,
                },
                {
                  label: 'TOIL balance',
                  value: `${Number(leaveData?.toil_balance_days ?? 0)} days`,
                },
                {
                  label: 'Bradford score',
                  value: absenceScore ? `${absenceScore.bradford_score}` : '',
                },
              ],
            },
            {
              id: 'bank-node',
              label: 'Bank Details',
              description: 'Payroll bank history and approvals.',
              facts: [{ label: 'Entries', value: `${(bankRows ?? []).length}` }],
              bulletPoints: [
                canPayrollBankManageAll
                  ? 'Use the classic editor for full create/review workflow.'
                  : 'View-only access for bank records.',
              ],
            },
            {
              id: 'uk-tax-node',
              label: 'UK Tax',
              description: 'Tax identifiers and review status.',
              facts: [{ label: 'Entries', value: `${(ukTaxRows ?? []).length}` }],
              bulletPoints: [
                canUkTaxManageAll ? 'Manage submissions in classic editor.' : 'View-only access.',
              ],
            },
            {
              id: 'tax-docs-node',
              label: 'Tax Documents',
              description: 'P45/P60 and payroll tax docs.',
              facts: [{ label: 'Documents', value: `${(taxDocRows ?? []).length}` }],
              bulletPoints: [
                canTaxDocsManageAll ? 'Upload/manage docs in classic editor.' : 'View-only access.',
              ],
            },
            {
              id: 'employment-node',
              label: 'Employment History',
              description: 'Role and contract timeline.',
              facts: [{ label: 'Entries', value: `${(employmentHistoryRows ?? []).length}` }],
            },
            {
              id: 'case-node',
              label: 'Case Log',
              description: 'Disciplinary and grievance records.',
              facts: [{ label: 'Cases', value: `${(caseRows ?? []).length}` }],
            },
            {
              id: 'medical-node',
              label: 'Medical Notes',
              description: 'Medical notes and follow-up events.',
              facts: [{ label: 'Records', value: `${(medicalRows ?? []).length}` }],
            },
            {
              id: 'custom-node',
              label: 'Custom Fields',
              description: 'Org-defined custom HR fields.',
              facts: [{ label: 'Configured fields', value: `${(customFieldDefs ?? []).length}` }],
            },
            {
              id: 'privacy-node',
              label: 'Privacy',
              description: 'GDPR erasure lifecycle and privacy status.',
              facts: [
                {
                  label: 'Active request',
                  value: activePrivacyRequest ? String(activePrivacyRequest.status) : 'None',
                },
                {
                  label: 'Requested at',
                  value: activePrivacyRequest
                    ? String(activePrivacyRequest.created_at).slice(0, 10)
                    : '',
                },
              ],
            },
            {
              id: 'audit-node',
              label: 'Audit Trail',
              description: 'Recent HR record change events and changer attribution.',
              facts: [
                { label: 'Events loaded', value: `${(auditRows ?? []).length}` },
                { label: 'Recent limit', value: '50' },
              ],
            },
            {
              id: 'exports-node',
              label: 'Exports',
              description: 'Record export capability and sensitive export access.',
              facts: [
                { label: 'CSV export', value: canRecordExportCsv ? 'Enabled' : 'Disabled' },
                { label: 'PDF export', value: canRecordExportPdf ? 'Enabled' : 'Disabled' },
                {
                  label: 'Sensitive export',
                  value: canRecordExportSensitive ? 'Enabled' : 'Disabled',
                },
              ],
            },
          ]}
          bankRows={(bankRows ?? []).map((r) => ({
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
          ukTaxRows={(ukTaxRows ?? []).map((r) => ({
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
          taxDocRows={(taxDocRows ?? []).map((r) => ({
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
          canPayrollBankViewAll={Boolean(canPayrollBankViewAll)}
          canPayrollBankManageAll={Boolean(canPayrollBankManageAll)}
          canPayrollBankExport={Boolean(canPayrollBankExport)}
          canUkTaxViewAll={Boolean(canUkTaxViewAll)}
          canUkTaxManageAll={Boolean(canUkTaxManageAll)}
          canUkTaxExport={Boolean(canUkTaxExport)}
          canTaxDocsViewAll={Boolean(canTaxDocsViewAll)}
          canTaxDocsManageAll={Boolean(canTaxDocsManageAll)}
          canTaxDocsExport={Boolean(canTaxDocsExport)}
        />
      </>
    );
    warnIfSlowServerPath('/admin/hr/[userId]', pathStartedAtMs);
    return view;
  }

  const view = (
    <>
      {activePrivacyRequest ? (
        <div className="mx-auto mt-4 max-w-7xl rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12.5px] text-[#854d0e]">
          Active GDPR erasure request: <strong>{String(activePrivacyRequest.status)}</strong>{' '}
          (submitted {String(activePrivacyRequest.created_at).slice(0, 10)}).
        </div>
      ) : null}
      {hasPartialData ? (
        <div className="mx-auto mt-4 max-w-7xl rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12.5px] text-[#854d0e]">
          Some HR detail sections are temporarily delayed and may be partially loaded.
          {partialSectionSummary ? ` Delayed areas include ${partialSectionSummary}.` : ''}
        </div>
      ) : null}
      <div id="record-core" className="scroll-mt-24">
        <EmployeeHRFileClient
          orgId={orgId}
          currentUserId={viewerUserId}
          canManage={canManage}
          canManageEmployeePhotos={!!canPhotoManageAll}
          canViewEmployeePhotos={!!canPhotoViewAll || !!canPhotoManageAll}
          canManageIdDocuments={!!canIdManageAll}
          canViewIdDocuments={!!canIdViewAll || !!canIdManageAll}
          canMarkProbationCheck={canMarkProbationCheck}
          canViewGrading={!!canViewAll || !!canManageLeaveOrg}
          customCategories={(customCategoryRows ?? []).map((c) => ({
            id: c.id as string,
            name: c.name as string,
            document_kind_scope: (c.document_kind_scope as string) ?? 'supporting_document',
          }))}
          employee={fileRow as Parameters<typeof EmployeeHRFileClient>[0]['employee']}
          auditEvents={(auditRows ?? []).map((e) => ({
            id: e.id as string,
            field_name: e.field_name as string,
            old_value: (e.old_value as string | null) ?? null,
            new_value: (e.new_value as string | null) ?? null,
            created_at: e.created_at as string,
            changer_name: changerNames[e.changed_by as string] ?? 'Unknown',
          }))}
          leaveAllowance={
            leaveData
              ? {
                  annual_entitlement_days: Number(leaveData.annual_entitlement_days ?? 0),
                  toil_balance_days: Number(leaveData.toil_balance_days ?? 0),
                }
              : null
          }
          leaveEntitlementYearLabel={hrFileLeaveYearUiLabel}
          absenceScore={absenceScore}
          showAbsenceReportingLink={!!canViewAll || !!canViewTeam || !!canManageLeaveOrg}
          applications={
            (applications ?? []) as { id: string; candidate_name: string; job_listing_id: string }[]
          }
          initialDocuments={(hrDocRows ?? []).map((d) => ({
            id: d.id as string,
            org_id: d.org_id as string,
            user_id: d.user_id as string,
            category: d.category as string,
            document_kind: (d.document_kind as string) ?? 'supporting_document',
            bucket_id: (d.bucket_id as string) ?? 'employee-hr-documents',
            custom_category_id: (d.custom_category_id as string | null) ?? null,
            custom_category_name:
              categoryNameById.get((d.custom_category_id as string | null) ?? '') ?? null,
            label: (d.label as string) ?? '',
            storage_path: d.storage_path as string,
            file_name: d.file_name as string,
            mime_type: d.mime_type as string,
            byte_size: Number(d.byte_size ?? 0),
            uploaded_by: d.uploaded_by as string,
            created_at: d.created_at as string,
            id_document_type: (d.id_document_type as string | null) ?? null,
            id_number_last4: (d.id_number_last4 as string | null) ?? null,
            expires_on: (d.expires_on as string | null) ?? null,
            verification_status: (d.verification_status as string | null) ?? null,
            is_current: Boolean(d.is_current),
            uploader_name: docUploaderNames[d.uploaded_by as string] ?? 'Unknown',
          }))}
          initialDependants={(dependantRows ?? []).map((d) => ({
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
          recordExport={recordExport}
          payrollPanel={payrollPanel}
          taxPanel={taxPanel}
          historyPanel={historyPanel}
          casesPanel={casesPanel}
          medicalPanel={medicalPanel}
          customFieldsPanel={customFieldsPanel}
          overviewWarnings={overviewWarnings}
          tabBadges={tabBadges}
        />
      </div>
    </>
  );
  warnIfSlowServerPath('/admin/hr/[userId]', pathStartedAtMs);
  return view;
}
