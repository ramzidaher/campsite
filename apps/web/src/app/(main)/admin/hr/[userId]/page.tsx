import { EmployeeHRFileClient } from '@/components/admin/hr/EmployeeHRFileClient';
import { SensitiveRecordExportButton } from '@/components/admin/hr/SensitiveRecordExportButton';
import { BankDetailsClient } from '@/components/hr/BankDetailsClient';
import { CustomHrFieldsValuesClient } from '@/components/hr/CustomHrFieldsValuesClient';
import { DisciplinaryGrievanceLogClient } from '@/components/hr/DisciplinaryGrievanceLogClient';
import { EmploymentHistoryClient } from '@/components/hr/EmploymentHistoryClient';
import { MedicalNotesClient } from '@/components/hr/MedicalNotesClient';
import { TaxDocumentsClient } from '@/components/hr/TaxDocumentsClient';
import { UkTaxDetailsClient } from '@/components/hr/UkTaxDetailsClient';
import { currentLeaveYearKeyForOrgCalendar, currentLeaveYearKeyUtc } from '@/lib/datetime';
import { createClient } from '@/lib/supabase/server';
import { getDisplayName } from '@/lib/names';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function EmployeeHRFilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [{ data: canViewAll }, { data: canViewTeam }, { data: canManageLeaveOrg }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.view_records',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.view_direct_reports',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'leave.manage_org',
      p_context: {},
    }),
  ]);
  if (!canViewAll && !canViewTeam) redirect('/hr/records');

  const canManage = await supabase
    .rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.manage_records',
      p_context: {},
    })
    .then(({ data }) => !!data);

  const [
    { data: canPhotoManageAll },
    { data: canPhotoViewAll },
    { data: canIdManageAll },
    { data: canIdViewAll },
    { data: canPayrollBankViewAll },
    { data: canPayrollBankManageAll },
    { data: canPayrollBankExport },
    { data: canUkTaxViewAll },
    { data: canUkTaxManageAll },
    { data: canUkTaxExport },
    { data: canTaxDocsViewAll },
    { data: canTaxDocsManageAll },
    { data: canTaxDocsExport },
    { data: canEmploymentHistoryViewAll },
    { data: canEmploymentHistoryManageAll },
    { data: canDisciplinaryViewAll },
    { data: canDisciplinaryManageAll },
    { data: canGrievanceViewAll },
    { data: canGrievanceManageAll },
    { data: canMedicalViewAll },
    { data: canMedicalManageAll },
    { data: canMedicalRevealSensitive },
    { data: canMedicalExport },
    { data: canCustomFieldsView },
    { data: canCustomFieldsManageValuesAll },
    { data: canRecordExportCsv },
    { data: canRecordExportPdf },
    { data: canRecordExportSensitive },
  ] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.employee_photo.manage_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.employee_photo.view_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.id_document.manage_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.id_document.view_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.bank_details.view_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.bank_details.manage_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.bank_details.export',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.uk_tax.view_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.uk_tax.manage_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.uk_tax.export',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.tax_docs.view_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.tax_docs.manage_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.tax_docs.export',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.employment_history.view_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.employment_history.manage_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.disciplinary.view_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.disciplinary.manage_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.grievance.view_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.grievance.manage_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.medical_notes.view_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.medical_notes.manage_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.medical_notes.reveal_sensitive',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.medical_notes.export',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.custom_fields.view',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.custom_fields.manage_values_all',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.records_export.generate_csv',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.records_export.generate_pdf',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.records_export.include_sensitive',
      p_context: {},
    }),
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
  const hrFileLeaveYearKey = orgTz
    ? currentLeaveYearKeyForOrgCalendar(new Date(), orgTz, sm, sd)
    : currentLeaveYearKeyUtc(new Date(), sm, sd);

  const [{ data: fileRows }, { data: leaveData }, { data: sickScore }] = await Promise.all([
    supabase.rpc('hr_employee_file', { p_user_id: userId }),
    supabase
      .from('leave_allowances')
      .select('leave_year, annual_entitlement_days, toil_balance_days')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('leave_year', hrFileLeaveYearKey)
      .maybeSingle(),
    // Bradford score
    supabase.rpc('bradford_factor_for_user', {
      p_user_id: userId,
      p_on: new Date().toISOString().slice(0, 10),
    }),
  ]);

  const fileRow = (fileRows ?? [])[0] ?? null;
  if (!fileRow) redirect('/hr/records');

  const canMarkProbationCheck =
    canManage ||
    (!!canViewTeam && (fileRow.reports_to_user_id as string | null) === user.id);

  const hrRecordId = fileRow.hr_record_id as string | null;
  const { data: auditRows } = hrRecordId
    ? await supabase
        .from('employee_hr_record_events')
        .select('id, field_name, old_value, new_value, created_at, changed_by')
        .eq('org_id', orgId)
        .eq('record_id', hrRecordId)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] };

  // get names for audit events
  const changerIds = [...new Set((auditRows ?? []).map((e) => e.changed_by as string))];
  const changerNames: Record<string, string> = {};
  if (changerIds.length) {
    const { data: changers } = await supabase.from('profiles').select('id, full_name, preferred_name').in('id', changerIds);
    for (const c of changers ?? []) {
      changerNames[c.id as string] = getDisplayName(c.full_name as string, (c.preferred_name as string | null) ?? null);
    }
  }

  const { data: hrDocRows } = await supabase
    .from('employee_hr_documents')
    .select('id, org_id, user_id, category, document_kind, bucket_id, custom_category_id, label, storage_path, file_name, mime_type, byte_size, uploaded_by, created_at, id_document_type, id_number_last4, expires_on, verification_status, is_current')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const { data: dependantRows } = await supabase
    .from('employee_dependants')
    .select('full_name, relationship, date_of_birth, is_student, is_disabled, is_beneficiary, beneficiary_percentage, phone, email, address, notes, is_emergency_contact')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const { data: bankRows } = await supabase
    .from('employee_bank_details')
    .select('id, status, is_active, account_holder_display, account_number_last4, sort_code_last4, iban_last4, bank_country, currency, effective_from, submitted_by, reviewed_by, reviewed_at, review_note, created_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: ukTaxRows } = await supabase
    .from('employee_uk_tax_details')
    .select('id, status, is_active, ni_number_masked, ni_number_last2, tax_code_masked, tax_code_last2, effective_from, review_note, created_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: taxDocRows } = await supabase
    .from('employee_tax_documents')
    .select('id, document_type, tax_year, issue_date, payroll_period_end, status, finance_reference, wagesheet_id, payroll_run_reference, bucket_id, storage_path, file_name, byte_size, is_current, created_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: employmentHistoryRows } = await supabase
    .from('employee_employment_history')
    .select('role_title, department_name, team_name, manager_name, employment_type, contract_type, fte, location_type, start_date, end_date, change_reason, pay_grade, salary_band, notes, source')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false });

  const canViewSensitiveCaseData = Boolean(canDisciplinaryViewAll || canDisciplinaryManageAll || canGrievanceViewAll || canGrievanceManageAll);

  const caseSelect = canViewSensitiveCaseData
    ? 'id, case_type, case_ref, category, severity, status, incident_date, reported_date, hearing_date, outcome_effective_date, review_date, summary, allegations_details, outcome_action, appeal_submitted, appeal_outcome, owner_user_id, investigator_user_id, witness_details, investigation_notes, internal_notes, linked_documents, archived_at, created_at'
    : 'id, case_type, case_ref, category, severity, status, incident_date, reported_date, hearing_date, outcome_effective_date, review_date, summary, outcome_action, appeal_submitted, appeal_outcome, owner_user_id, investigator_user_id, linked_documents, archived_at, created_at';

  const { data: caseRows } = await supabase
    .from('employee_case_records')
    .select(caseSelect)
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  const caseIds = (caseRows ?? []).map((r) => r.id as string).filter(Boolean);
  const { data: caseEventRows } = caseIds.length
    ? await supabase
        .from('employee_case_record_events')
        .select('id, case_id, event_type, old_status, new_status, created_at')
        .in('case_id', caseIds)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [] };

  const { data: medicalRows } = await supabase
    .from('employee_medical_notes')
    .select('id, case_ref, referral_reason, status, fit_for_work_outcome, recommended_adjustments, review_date, next_review_date, summary_for_employee, archived_at, created_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  const medicalIds = (medicalRows ?? []).map((r) => r.id as string).filter(Boolean);
  const { data: medicalEventRows } = medicalIds.length
    ? await supabase
        .from('employee_medical_note_events')
        .select('id, medical_note_id, event_type, reason, created_at')
        .in('medical_note_id', medicalIds)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [] };

  const { data: privacyRequestRows } = await supabase
    .from('privacy_erasure_requests')
    .select('id, status, created_at')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .in('status', ['requested', 'legal_review', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1);
  const activePrivacyRequest = (privacyRequestRows ?? [])[0] ?? null;

  const { data: customFieldDefs } = await supabase
    .from('hr_custom_field_definitions')
    .select('id, key, label, section, field_type, options, is_required, visible_to_manager, visible_to_self')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  const defIds = (customFieldDefs ?? []).map((d) => d.id as string);
  const { data: customFieldValues } = defIds.length
    ? await supabase
        .from('hr_custom_field_values')
        .select('definition_id, value')
        .eq('org_id', orgId)
        .eq('user_id', userId)
        .in('definition_id', defIds)
    : { data: [] };

  const { data: customCategoryRows } = await supabase
    .from('employee_document_categories')
    .select('id, name, document_kind_scope, is_active')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  const categoryNameById = new Map<string, string>(
    (customCategoryRows ?? []).map((r) => [r.id as string, r.name as string]),
  );

  const docUploaderIds = [...new Set((hrDocRows ?? []).map((d) => d.uploaded_by as string))];
  const docUploaderNames: Record<string, string> = {};
  if (docUploaderIds.length) {
    const { data: uploaders } = await supabase
      .from('profiles')
      .select('id, full_name, preferred_name')
      .in('id', docUploaderIds);
    for (const c of uploaders ?? []) {
      docUploaderNames[c.id as string] = getDisplayName(
        c.full_name as string,
        (c.preferred_name as string | null) ?? null,
      );
    }
  }

  // applications list for "hired from" dropdown
  const { data: applications } = await supabase
    .from('job_applications')
    .select('id, candidate_name, job_listing_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200);

  const b0 = Array.isArray(sickScore) ? sickScore[0] : sickScore;
  const absenceScore =
    b0 && typeof b0 === 'object' && 'bradford_score' in b0
      ? {
          spell_count: Number((b0 as { spell_count: number }).spell_count),
          total_days: Number((b0 as { total_days: number }).total_days),
          bradford_score: Number((b0 as { bradford_score: number }).bradford_score),
        }
      : null;

  return (
    <>
    {(canRecordExportCsv || canRecordExportPdf) ? (
      <div className="mx-auto mt-4 flex max-w-3xl flex-wrap gap-2 px-5 sm:px-7">
        {canRecordExportCsv ? (
          <a
            href={`/api/hr/records/export?userId=${encodeURIComponent(userId)}&format=csv`}
            className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] text-[#121212] hover:bg-[#fafafa]"
          >
            Export CSV
          </a>
        ) : null}
        {canRecordExportPdf ? (
          <a
            href={`/api/hr/records/export?userId=${encodeURIComponent(userId)}&format=pdf`}
            className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] text-[#121212] hover:bg-[#fafafa]"
          >
            Export PDF
          </a>
        ) : null}
        {(canRecordExportSensitive && canRecordExportCsv) ? (
          <SensitiveRecordExportButton userId={userId} />
        ) : null}
      </div>
    ) : null}
    {activePrivacyRequest ? (
      <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[12.5px] text-[#854d0e]">
        Active GDPR erasure request: <strong>{String(activePrivacyRequest.status)}</strong> (submitted {String(activePrivacyRequest.created_at).slice(0, 10)}).
      </div>
    ) : null}
    <EmployeeHRFileClient
      orgId={orgId}
      currentUserId={user.id}
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
      leaveEntitlementYearLabel={hrFileLeaveYearKey}
      absenceScore={absenceScore}
      showAbsenceReportingLink={!!canViewAll || !!canViewTeam || !!canManageLeaveOrg}
      applications={(applications ?? []) as { id: string; candidate_name: string; job_listing_id: string }[]}
      initialDocuments={(hrDocRows ?? []).map((d) => ({
        id: d.id as string,
        org_id: d.org_id as string,
        user_id: d.user_id as string,
        category: d.category as string,
        document_kind: (d.document_kind as string) ?? 'supporting_document',
        bucket_id: (d.bucket_id as string) ?? 'employee-hr-documents',
        custom_category_id: (d.custom_category_id as string | null) ?? null,
        custom_category_name: categoryNameById.get((d.custom_category_id as string | null) ?? '') ?? null,
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
    />
    {(canPayrollBankViewAll || canPayrollBankManageAll) ? (
      <div className="mx-auto max-w-3xl px-5 pb-8 sm:px-7">
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
    ) : null}
    {(canUkTaxViewAll || canUkTaxManageAll) ? (
      <div className="mx-auto max-w-3xl px-5 pb-8 sm:px-7">
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
      </div>
    ) : null}
    {(canTaxDocsViewAll || canTaxDocsManageAll) ? (
      <div className="mx-auto max-w-3xl px-5 pb-8 sm:px-7">
        <TaxDocumentsClient
          orgId={orgId}
          subjectUserId={userId}
          actorUserId={user.id}
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
      </div>
    ) : null}
    {(canEmploymentHistoryViewAll || canEmploymentHistoryManageAll) ? (
      <div className="mx-auto max-w-3xl px-5 pb-8 sm:px-7">
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
            source: ((r.source as string) ?? 'manual') as 'manual' | 'auto_from_hr_record' | 'employee_request',
          }))}
        />
      </div>
    ) : null}
    {(canDisciplinaryViewAll || canDisciplinaryManageAll || canGrievanceViewAll || canGrievanceManageAll || canViewTeam) ? (
      <div className="mx-auto max-w-3xl px-5 pb-8 sm:px-7">
        <DisciplinaryGrievanceLogClient
          orgId={orgId}
          subjectUserId={userId}
          initialCases={(caseRows ?? []).map((r) => ({
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
    ) : null}
    {(canMedicalViewAll || canMedicalManageAll) ? (
      <div className="mx-auto max-w-3xl px-5 pb-8 sm:px-7">
        <MedicalNotesClient
          subjectUserId={userId}
          initialRows={(medicalRows ?? []).map((r) => ({
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
    ) : null}
    {(canCustomFieldsView || canCustomFieldsManageValuesAll) ? (
      <div className="mx-auto max-w-3xl px-5 pb-8 sm:px-7">
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
    ) : null}
    </>
  );
}
