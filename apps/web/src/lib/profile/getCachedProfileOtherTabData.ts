import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { resolveWithTimeout } from '@/lib/perf/resolveWithTimeout';
import { createClient } from '@/lib/supabase/server';

const PROFILE_OTHER_TAB_QUERY_TIMEOUT_MS = 1400;
const PROFILE_OTHER_TAB_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_PROFILE_OTHER_TAB_RESPONSE_CACHE_TTL_MS ?? '15000',
  10
);

export type ProfileOtherTabData = {
  ownDocs: Record<string, unknown>[];
  ownDependants: Record<string, unknown>[];
  ownBankRows: Record<string, unknown>[];
  ownUkTaxRows: Record<string, unknown>[];
  ownTaxDocs: Record<string, unknown>[];
  ownEmploymentHistory: Record<string, unknown>[];
  ownCases: Record<string, unknown>[];
  ownCaseEvents: Record<string, unknown>[];
  ownMedical: Record<string, unknown>[];
  ownMedicalEvents: Record<string, unknown>[];
  ownCustomDefs: Record<string, unknown>[];
  ownCustomValues: Record<string, unknown>[];
  ownTrainingRows: Record<string, unknown>[];
  partialSections: string[];
};

const profileOtherTabResponseCache = new Map<string, TtlCacheEntry<ProfileOtherTabData>>();
const profileOtherTabInFlight = new Map<string, Promise<ProfileOtherTabData>>();
registerSharedCacheStore(
  'campsite:profile:other-tab',
  profileOtherTabResponseCache,
  profileOtherTabInFlight
);

function getProfileOtherTabCacheKey(orgId: string, userId: string): string {
  return `org:${orgId}:user:${userId}`;
}

export const getCachedProfileOtherTabData = cache(
  async (orgId: string, userId: string): Promise<ProfileOtherTabData> => {
    return getOrLoadSharedCachedValue({
      cache: profileOtherTabResponseCache,
      inFlight: profileOtherTabInFlight,
      key: getProfileOtherTabCacheKey(orgId, userId),
      cacheNamespace: 'campsite:profile:other-tab',
      ttlMs: PROFILE_OTHER_TAB_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const timeoutFallbackLabels = new Set<string>();
        const resolveOtherTabWithTimeout = <T,>(
          label: string,
          promise: PromiseLike<T>,
          fallback: unknown
        ): Promise<T> =>
          resolveWithTimeout(promise, PROFILE_OTHER_TAB_QUERY_TIMEOUT_MS, fallback as T, () => {
            timeoutFallbackLabels.add(label);
          });

        const [
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
          ownTrainingRowsRes,
        ] = await Promise.all([
          resolveOtherTabWithTimeout(
            'employee_hr_documents',
            supabase
              .from('employee_hr_documents')
              .select(
                'id, category, document_kind, bucket_id, label, storage_path, file_name, byte_size, created_at, id_document_type, id_number_last4, expires_on, is_current'
              )
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .in('document_kind', ['employee_photo', 'id_document'])
              .order('created_at', { ascending: false }),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'employee_dependants',
            supabase
              .from('employee_dependants')
              .select(
                'full_name, relationship, date_of_birth, is_student, is_disabled, is_beneficiary, beneficiary_percentage, phone, email, address, notes, is_emergency_contact'
              )
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .order('created_at', { ascending: false }),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'employee_bank_details',
            supabase
              .from('employee_bank_details')
              .select(
                'id, status, is_active, account_holder_display, account_number_last4, sort_code_last4, iban_last4, bank_country, currency, effective_from, submitted_by, reviewed_by, reviewed_at, review_note, created_at'
              )
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(20),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'employee_uk_tax_details',
            supabase
              .from('employee_uk_tax_details')
              .select(
                'id, status, is_active, ni_number_masked, ni_number_last2, tax_code_masked, tax_code_last2, effective_from, review_note, created_at'
              )
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(20),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'employee_tax_documents',
            supabase
              .from('employee_tax_documents')
              .select(
                'id, document_type, tax_year, issue_date, payroll_period_end, status, finance_reference, wagesheet_id, payroll_run_reference, bucket_id, storage_path, file_name, byte_size, is_current, created_at'
              )
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(50),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'employee_employment_history',
            supabase
              .from('employee_employment_history')
              .select(
                'role_title, department_name, team_name, manager_name, employment_type, contract_type, fte, location_type, start_date, end_date, change_reason, pay_grade, salary_band, notes, source'
              )
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .order('start_date', { ascending: false })
              .order('created_at', { ascending: false }),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'employee_case_records',
            supabase
              .from('employee_case_records')
              .select(
                'id, case_type, case_ref, category, severity, status, incident_date, reported_date, hearing_date, outcome_effective_date, review_date, summary, outcome_action, appeal_submitted, appeal_outcome, owner_user_id, investigator_user_id, linked_documents, archived_at, created_at'
              )
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(50),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'employee_medical_notes',
            supabase
              .from('employee_medical_notes')
              .select(
                'id, case_ref, referral_reason, status, fit_for_work_outcome, recommended_adjustments, review_date, next_review_date, summary_for_employee, archived_at, created_at'
              )
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(50),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'employee_medical_note_events',
            supabase
              .from('employee_medical_note_events')
              .select('id, medical_note_id, event_type, reason, created_at')
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(100),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'hr_custom_field_definitions',
            supabase
              .from('hr_custom_field_definitions')
              .select(
                'id, key, label, section, field_type, options, is_required, visible_to_manager, visible_to_self'
              )
              .eq('org_id', orgId)
              .eq('is_active', true)
              .eq('visible_to_self', true)
              .order('sort_order', { ascending: true })
              .order('created_at', { ascending: true }),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'hr_custom_field_values',
            supabase
              .from('hr_custom_field_values')
              .select('definition_id, value')
              .eq('org_id', orgId)
              .eq('user_id', userId),
            { data: [], error: null }
          ),
          resolveOtherTabWithTimeout(
            'employee_training_records',
            supabase
              .from('employee_training_records')
              .select(
                'id, title, provider, status, started_on, completed_on, expires_on, notes, certificate_document_url, created_at'
              )
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(120),
            { data: [], error: null }
          ),
        ]);

        const ownCases = (ownCaseRowsRes.data ?? []) as Record<string, unknown>[];
        const ownCaseIds = ownCases.map((row) => String(row.id ?? '')).filter(Boolean);
        const ownCaseEventsRes =
          ownCaseIds.length === 0
            ? { data: [] as Record<string, unknown>[], error: null }
            : await resolveOtherTabWithTimeout(
                'employee_case_record_events',
                supabase
                  .from('employee_case_record_events')
                  .select('id, case_id, event_type, old_status, new_status, created_at')
                  .eq('org_id', orgId)
                  .in('case_id', ownCaseIds)
                  .order('created_at', { ascending: false })
                  .limit(100),
                { data: [], error: null }
              );

        return {
          ownDocs: (ownDocsRes.data ?? []) as Record<string, unknown>[],
          ownDependants: (ownDependantsRes.data ?? []) as Record<string, unknown>[],
          ownBankRows: (ownBankRowsRes.data ?? []) as Record<string, unknown>[],
          ownUkTaxRows: (ownUkTaxRowsRes.data ?? []) as Record<string, unknown>[],
          ownTaxDocs: (ownTaxDocsRes.data ?? []) as Record<string, unknown>[],
          ownEmploymentHistory: (ownEmploymentHistoryRes.data ?? []) as Record<string, unknown>[],
          ownCases,
          ownCaseEvents: (ownCaseEventsRes.data ?? []) as Record<string, unknown>[],
          ownMedical: (ownMedicalRowsRes.data ?? []) as Record<string, unknown>[],
          ownMedicalEvents: (ownMedicalEventsRes.data ?? []) as Record<string, unknown>[],
          ownCustomDefs: (ownCustomFieldDefsRes.data ?? []) as Record<string, unknown>[],
          ownCustomValues: (ownCustomFieldValuesRes.data ?? []) as Record<string, unknown>[],
          ownTrainingRows: (ownTrainingRowsRes.data ?? []) as Record<string, unknown>[],
          partialSections: [...timeoutFallbackLabels],
        };
      },
    });
  }
);
