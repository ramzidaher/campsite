import { cache } from 'react';

import { currentLeaveYearKeyForOrgCalendar, currentLeaveYearKeyUtc } from '@/lib/datetime';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { resolveWithTimeout } from '@/lib/perf/resolveWithTimeout';
import { createClient } from '@/lib/supabase/server';
import { getDisplayName } from '@/lib/names';
import { getCachedHrEmployeeFile } from '@/lib/profile/getCachedHrEmployeeFile';

const ADMIN_HR_NON_CRITICAL_QUERY_TIMEOUT_MS = 1500;
const ADMIN_HR_EMPLOYEE_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_HR_EMPLOYEE_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);

type AdminHrEmployeePageData = {
  hrFileLeaveYearKey: string;
  fileRow: Record<string, unknown> | null;
  sickScore: unknown;
  hrDocRows: Record<string, unknown>[];
  dependantRows: Record<string, unknown>[];
  bankRows: Record<string, unknown>[];
  ukTaxRows: Record<string, unknown>[];
  taxDocRows: Record<string, unknown>[];
  employmentHistoryRows: Record<string, unknown>[];
  caseRows: Record<string, unknown>[];
  medicalRows: Record<string, unknown>[];
  activePrivacyRequest: Record<string, unknown> | null;
  customFieldDefs: Record<string, unknown>[];
  customCategoryRows: Record<string, unknown>[];
  applications: Record<string, unknown>[];
  leaveData: Record<string, unknown> | null;
  auditRows: Record<string, unknown>[];
  caseEventRows: Record<string, unknown>[];
  medicalEventRows: Record<string, unknown>[];
  customFieldValues: Record<string, unknown>[];
  changerNames: Record<string, string>;
  docUploaderNames: Record<string, string>;
  partialData: boolean;
  partialSections: string[];
};

const adminHrEmployeePageResponseCache = new Map<string, TtlCacheEntry<AdminHrEmployeePageData>>();
const adminHrEmployeePageInFlight = new Map<string, Promise<AdminHrEmployeePageData>>();
registerSharedCacheStore(
  'campsite:admin:hr:employee',
  adminHrEmployeePageResponseCache,
  adminHrEmployeePageInFlight
);

function getAdminHrEmployeePageCacheKey(orgId: string, userId: string, canViewSensitiveCaseData: boolean): string {
  return `org:${orgId}:user:${userId}:sensitive:${canViewSensitiveCaseData ? '1' : '0'}`;
}

export const getCachedAdminHrEmployeePageData = cache(
  async (orgId: string, userId: string, canViewSensitiveCaseData: boolean): Promise<AdminHrEmployeePageData> => {
    return getOrLoadSharedCachedValue({
      cache: adminHrEmployeePageResponseCache,
      inFlight: adminHrEmployeePageInFlight,
      key: getAdminHrEmployeePageCacheKey(orgId, userId, canViewSensitiveCaseData),
      cacheNamespace: 'campsite:admin:hr:employee',
      ttlMs: ADMIN_HR_EMPLOYEE_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const timeoutFallbackLabels = new Set<string>();
        const resolveAdminHrQueryWithTimeout = async <T,>(
          label: string,
          promise: PromiseLike<T>,
          timeoutMs: number,
          fallback: unknown
        ): Promise<T> =>
          resolveWithTimeout(promise, timeoutMs, fallback as T, () => {
            timeoutFallbackLabels.add(label);
          });

        const [
          [{ data: leaveSettingsForYear }, { data: orgForTz }],
          { data: fileRows },
          { data: sickScore },
          { data: hrDocRows },
          { data: dependantRows },
          { data: bankRows },
          { data: ukTaxRows },
          { data: taxDocRows },
          { data: employmentHistoryRows },
          { data: caseRows },
          { data: medicalRows },
          { data: privacyRequestRows },
          { data: customFieldDefs },
          { data: customCategoryRows },
          { data: applications },
        ] = await Promise.all([
          Promise.all([
            supabase
              .from('org_leave_settings')
              .select('leave_year_start_month, leave_year_start_day')
              .eq('org_id', orgId)
              .maybeSingle(),
            supabase.from('organisations').select('timezone').eq('id', orgId).maybeSingle(),
          ]),
          getCachedHrEmployeeFile(orgId, userId),
          supabase.rpc('bradford_factor_for_user', {
            p_user_id: userId,
            p_on: new Date().toISOString().slice(0, 10),
          }),
          supabase
            .from('employee_hr_documents')
            .select(
              'id, org_id, user_id, category, document_kind, bucket_id, custom_category_id, label, storage_path, file_name, mime_type, byte_size, uploaded_by, created_at, id_document_type, id_number_last4, expires_on, verification_status, is_current'
            )
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100),
          supabase
            .from('employee_dependants')
            .select(
              'full_name, relationship, date_of_birth, is_student, is_disabled, is_beneficiary, beneficiary_percentage, phone, email, address, notes, is_emergency_contact'
            )
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('employee_bank_details')
            .select(
              'id, status, is_active, account_holder_display, account_number_last4, sort_code_last4, iban_last4, bank_country, currency, effective_from, submitted_by, reviewed_by, reviewed_at, review_note, created_at'
            )
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20),
          supabase
            .from('employee_uk_tax_details')
            .select(
              'id, status, is_active, ni_number_masked, ni_number_last2, tax_code_masked, tax_code_last2, effective_from, review_note, created_at'
            )
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20),
          supabase
            .from('employee_tax_documents')
            .select(
              'id, document_type, tax_year, issue_date, payroll_period_end, status, finance_reference, wagesheet_id, payroll_run_reference, bucket_id, storage_path, file_name, byte_size, is_current, created_at'
            )
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('employee_employment_history')
            .select(
              'role_title, department_name, team_name, manager_name, employment_type, contract_type, fte, location_type, start_date, end_date, change_reason, pay_grade, salary_band, notes, source'
            )
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .order('start_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(50),
          canViewSensitiveCaseData
            ? supabase
                .from('employee_case_records')
                .select(
                  'id, case_type, case_ref, category, severity, status, incident_date, reported_date, hearing_date, outcome_effective_date, review_date, summary, allegations_details, outcome_action, appeal_submitted, appeal_outcome, owner_user_id, investigator_user_id, witness_details, investigation_notes, internal_notes, linked_documents, archived_at, created_at'
                )
                .eq('org_id', orgId)
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50)
            : supabase
                .from('employee_case_records')
                .select(
                  'id, case_type, case_ref, category, severity, status, incident_date, reported_date, hearing_date, outcome_effective_date, review_date, summary, outcome_action, appeal_submitted, appeal_outcome, owner_user_id, investigator_user_id, linked_documents, archived_at, created_at'
                )
                .eq('org_id', orgId)
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50),
          supabase
            .from('employee_medical_notes')
            .select(
              'id, case_ref, referral_reason, status, fit_for_work_outcome, recommended_adjustments, review_date, next_review_date, summary_for_employee, archived_at, created_at'
            )
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('privacy_erasure_requests')
            .select('id, status, created_at')
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .in('status', ['requested', 'legal_review', 'approved'])
            .order('created_at', { ascending: false })
            .limit(1),
          supabase
            .from('hr_custom_field_definitions')
            .select(
              'id, key, label, section, field_type, options, is_required, visible_to_manager, visible_to_self'
            )
            .eq('org_id', orgId)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }),
          supabase
            .from('employee_document_categories')
            .select('id, name, document_kind_scope, is_active')
            .eq('org_id', orgId)
            .eq('is_active', true)
            .order('name', { ascending: true }),
          resolveAdminHrQueryWithTimeout(
            'job_applications',
            supabase
              .from('job_applications')
              .select('id, candidate_name, job_listing_id')
              .eq('org_id', orgId)
              .order('created_at', { ascending: false })
              .limit(100),
            ADMIN_HR_NON_CRITICAL_QUERY_TIMEOUT_MS,
            { data: [], error: null } as {
              data: Array<{ id: string; candidate_name: string | null; job_listing_id: string | null }>;
              error: null;
            }
          ),
        ]);

        const orgTz = (orgForTz?.timezone as string | null) ?? null;
        const sm = Number(leaveSettingsForYear?.leave_year_start_month ?? 1);
        const sd = Number(leaveSettingsForYear?.leave_year_start_day ?? 1);
        const hrFileLeaveYearKey = orgTz
          ? currentLeaveYearKeyForOrgCalendar(new Date(), orgTz, sm, sd)
          : currentLeaveYearKeyUtc(new Date(), sm, sd);

        const fileRow = ((fileRows ?? [])[0] ?? null) as Record<string, unknown> | null;
        const hrRecordId = (fileRow?.hr_record_id as string | null) ?? null;
        const caseIds = (caseRows ?? []).map((r) => r.id as string).filter(Boolean);
        const medicalIds = (medicalRows ?? []).map((r) => r.id as string).filter(Boolean);
        const defIds = (customFieldDefs ?? []).map((d) => d.id as string);
        const docUploaderIds = [...new Set((hrDocRows ?? []).map((d) => d.uploaded_by as string).filter(Boolean))];

        const [
          { data: leaveData },
          { data: auditRows },
          { data: caseEventRows },
          { data: medicalEventRows },
          { data: customFieldValues },
          { data: uploaders },
        ] = await Promise.all([
          supabase
            .from('leave_allowances')
            .select('leave_year, annual_entitlement_days, toil_balance_days')
            .eq('org_id', orgId)
            .eq('user_id', userId)
            .eq('leave_year', hrFileLeaveYearKey)
            .maybeSingle(),
          hrRecordId
            ? supabase
                .from('employee_hr_record_events')
                .select('id, field_name, old_value, new_value, created_at, changed_by')
                .eq('org_id', orgId)
                .eq('record_id', hrRecordId)
                .order('created_at', { ascending: false })
                .limit(50)
            : Promise.resolve({ data: null, error: null }),
          caseIds.length
            ? supabase
                .from('employee_case_record_events')
                .select('id, case_id, event_type, old_status, new_status, created_at')
                .eq('org_id', orgId)
                .in('case_id', caseIds)
                .order('created_at', { ascending: false })
                .limit(100)
            : Promise.resolve({ data: null, error: null }),
          medicalIds.length
            ? supabase
                .from('employee_medical_note_events')
                .select('id, medical_note_id, event_type, reason, created_at')
                .eq('org_id', orgId)
                .in('medical_note_id', medicalIds)
                .order('created_at', { ascending: false })
                .limit(100)
            : Promise.resolve({ data: null, error: null }),
          defIds.length
            ? supabase
                .from('hr_custom_field_values')
                .select('definition_id, value')
                .eq('org_id', orgId)
                .eq('user_id', userId)
                .in('definition_id', defIds)
            : Promise.resolve({ data: null, error: null }),
          docUploaderIds.length
            ? supabase.from('profiles').select('id, full_name, preferred_name').in('id', docUploaderIds)
            : Promise.resolve({ data: null, error: null }),
        ]);

        const changerIds = [...new Set((auditRows ?? []).map((e) => e.changed_by as string).filter(Boolean))];
        const changerNames: Record<string, string> = {};
        if (changerIds.length) {
          const { data: changers } = await resolveAdminHrQueryWithTimeout(
            'audit_changer_profiles',
            supabase.from('profiles').select('id, full_name, preferred_name').in('id', changerIds),
            ADMIN_HR_NON_CRITICAL_QUERY_TIMEOUT_MS,
            { data: [], error: null } as {
              data: Array<{ id: string; full_name: string; preferred_name: string | null }>;
              error: null;
            }
          );
          for (const c of changers ?? []) {
            changerNames[c.id as string] = getDisplayName(
              c.full_name as string,
              (c.preferred_name as string | null) ?? null
            );
          }
        }

        const docUploaderNames: Record<string, string> = {};
        for (const c of uploaders ?? []) {
          docUploaderNames[c.id as string] = getDisplayName(
            c.full_name as string,
            (c.preferred_name as string | null) ?? null
          );
        }

        return {
          hrFileLeaveYearKey,
          fileRow,
          sickScore,
          hrDocRows: (hrDocRows ?? []) as Record<string, unknown>[],
          dependantRows: (dependantRows ?? []) as Record<string, unknown>[],
          bankRows: (bankRows ?? []) as Record<string, unknown>[],
          ukTaxRows: (ukTaxRows ?? []) as Record<string, unknown>[],
          taxDocRows: (taxDocRows ?? []) as Record<string, unknown>[],
          employmentHistoryRows: (employmentHistoryRows ?? []) as Record<string, unknown>[],
          caseRows: (caseRows ?? []) as Record<string, unknown>[],
          medicalRows: (medicalRows ?? []) as Record<string, unknown>[],
          activePrivacyRequest: ((privacyRequestRows ?? [])[0] ?? null) as Record<string, unknown> | null,
          customFieldDefs: (customFieldDefs ?? []) as Record<string, unknown>[],
          customCategoryRows: (customCategoryRows ?? []) as Record<string, unknown>[],
          applications: (applications ?? []) as Record<string, unknown>[],
          leaveData: (leaveData ?? null) as Record<string, unknown> | null,
          auditRows: (auditRows ?? []) as Record<string, unknown>[],
          caseEventRows: (caseEventRows ?? []) as Record<string, unknown>[],
          medicalEventRows: (medicalEventRows ?? []) as Record<string, unknown>[],
          customFieldValues: (customFieldValues ?? []) as Record<string, unknown>[],
          changerNames,
          docUploaderNames,
          partialData: timeoutFallbackLabels.size > 0,
          partialSections: [...timeoutFallbackLabels],
        };
      },
    });
  }
);

