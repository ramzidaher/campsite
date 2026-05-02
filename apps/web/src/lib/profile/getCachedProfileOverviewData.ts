import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { resolveWithTimeout } from '@/lib/perf/resolveWithTimeout';
import { createClient } from '@/lib/supabase/server';
import { currentLeaveYearKeyForOrgCalendar, currentLeaveYearKeyUtc } from '@/lib/datetime';

const PROFILE_OVERVIEW_QUERY_TIMEOUT_MS = 1400;
const PROFILE_OVERVIEW_ORG_CONFIG_TIMEOUT_MS = 900;
const PROFILE_OVERVIEW_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_PROFILE_OVERVIEW_RESPONSE_CACHE_TTL_MS ?? '15000',
  10
);

export type ProfileOverviewData = {
  profileLeaveYearKey: string;
  leaveYearStartMonth: number;
  leaveYearStartDay: number;
  allowanceAnnualEntitlementDays: number;
  allowanceToilBalanceDays: number;
  annualUsedDays: number;
  annualApprovedRequests: Array<{ start_date: string; end_date: string }>;
  departmentNames: string[];
  directReports: string[];
  directReportRows: Array<{
    id: string;
    full_name: string;
    preferred_name: string | null;
    email: string | null;
  }>;
  onboardingActive: boolean;
  probationItems: Array<{
    role: string;
    alert_level: string;
    probation_end_date: string;
    display_name: string;
  }>;
  partialSections: string[];
};

const profileOverviewResponseCache = new Map<string, TtlCacheEntry<ProfileOverviewData>>();
const profileOverviewInFlight = new Map<string, Promise<ProfileOverviewData>>();
registerSharedCacheStore('campsite:profile:overview', profileOverviewResponseCache, profileOverviewInFlight);

function getProfileOverviewCacheKey(orgId: string, userId: string, needsOnboardingCount: boolean): string {
  return `org:${orgId}:user:${userId}:onboarding:${needsOnboardingCount ? '1' : '0'}`;
}

function getDisplayName(fullName: string, preferredName?: string | null): string {
  const preferred = (preferredName ?? '').trim();
  const full = (fullName ?? '').trim();
  return preferred.length > 0 ? preferred : full;
}

export const getCachedProfileOverviewData = cache(
  async (orgId: string, userId: string, needsOnboardingCount: boolean): Promise<ProfileOverviewData> => {
    return getOrLoadSharedCachedValue({
      cache: profileOverviewResponseCache,
      inFlight: profileOverviewInFlight,
      key: getProfileOverviewCacheKey(orgId, userId, needsOnboardingCount),
      cacheNamespace: 'campsite:profile:overview',
      ttlMs: PROFILE_OVERVIEW_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const timeoutFallbackLabels = new Set<string>();
        const resolveOverviewWithTimeout = <T,>(
          label: string,
          promise: PromiseLike<T>,
          timeoutMs: number,
          fallback: unknown
        ): Promise<T> =>
          resolveWithTimeout(promise, timeoutMs, fallback as T, () => {
            timeoutFallbackLabels.add(label);
          });

        const [leaveSettingsRes, orgTzRes] = await Promise.all([
          resolveOverviewWithTimeout(
            'leave_settings_year',
            supabase
              .from('org_leave_settings')
              .select('leave_year_start_month, leave_year_start_day')
              .eq('org_id', orgId)
              .maybeSingle(),
            PROFILE_OVERVIEW_ORG_CONFIG_TIMEOUT_MS,
            { data: null, error: null }
          ),
          resolveOverviewWithTimeout(
            'org_timezone_lookup',
            supabase.from('organisations').select('timezone').eq('id', orgId).maybeSingle(),
            PROFILE_OVERVIEW_ORG_CONFIG_TIMEOUT_MS,
            { data: null, error: null }
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
          allowanceRow,
          annualApprovedRes,
          userDepartmentsRes,
          directReportsRes,
          onboardingCountRes,
          probationAlertsRes,
        ] = await Promise.all([
          resolveOverviewWithTimeout(
            'leave_allowances',
            supabase
              .from('leave_allowances')
              .select('annual_entitlement_days, toil_balance_days')
              .eq('org_id', orgId)
              .eq('user_id', userId)
              .eq('leave_year', profileLeaveYearKey)
              .maybeSingle(),
            PROFILE_OVERVIEW_QUERY_TIMEOUT_MS,
            { data: null, error: null }
          ),
          resolveOverviewWithTimeout(
            'leave_requests_annual_approved',
            supabase
              .from('leave_requests')
              .select('start_date, end_date')
              .eq('org_id', orgId)
              .eq('requester_id', userId)
              .eq('kind', 'annual')
              .eq('status', 'approved'),
            PROFILE_OVERVIEW_QUERY_TIMEOUT_MS,
            { data: [], error: null }
          ),
          resolveOverviewWithTimeout(
            'user_departments',
            supabase.from('user_departments').select('departments(name)').eq('user_id', userId),
            PROFILE_OVERVIEW_QUERY_TIMEOUT_MS,
            { data: [], error: null }
          ),
          resolveOverviewWithTimeout(
            'profiles_direct_reports',
            supabase
              .from('profiles')
              .select('id, full_name, preferred_name, email')
              .eq('org_id', orgId)
              .eq('status', 'active')
              .eq('reports_to_user_id', userId)
              .order('full_name'),
            PROFILE_OVERVIEW_QUERY_TIMEOUT_MS,
            { data: [], error: null }
          ),
          needsOnboardingCount
            ? resolveOverviewWithTimeout(
                'onboarding_runs_active_count',
                supabase
                  .from('onboarding_runs')
                  .select('id', { count: 'exact', head: true })
                  .eq('user_id', userId)
                  .eq('status', 'active'),
                PROFILE_OVERVIEW_QUERY_TIMEOUT_MS,
                { count: 0, data: [], error: null }
              )
            : Promise.resolve({ count: 0, data: [], error: null }),
          resolveOverviewWithTimeout(
            'rpc_my_probation_alerts',
            supabase.rpc('my_probation_alerts'),
            PROFILE_OVERVIEW_QUERY_TIMEOUT_MS,
            {
              data: {
                items: [] as Array<{
                  role: string;
                  alert_level: string;
                  probation_end_date: string;
                  display_name: string;
                }>,
              },
              error: null,
            }
          ),
        ]);

        const departmentNames: string[] = [];
        for (const row of userDepartmentsRes.data ?? []) {
          const raw = row.departments as { name: string } | { name: string }[] | null;
          const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
          for (const d of arr) {
            if (d?.name) departmentNames.push(d.name);
          }
        }

        const annualUsedDays = (annualApprovedRes.data ?? []).reduce((sum: number, row: { start_date: string; end_date: string }) => {
          const start = new Date(String(row.start_date));
          const end = new Date(String(row.end_date));
          const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          return sum + Math.max(0, diff);
        }, 0);

        const directReports = (directReportsRes.data ?? []).map(
          (report: { full_name: string; preferred_name: string | null; email: string | null }) =>
            `${getDisplayName(String(report.full_name), report.preferred_name)}${report.email ? ` · ${String(report.email)}` : ''}`
        );

        const probationItems = (
          (probationAlertsRes.data as { items?: { role: string; alert_level: string; probation_end_date: string; display_name: string }[] } | null)
            ?.items ?? []
        ).filter((item) => item.role === 'self');

        const annualEntitlement = Number(allowanceRow.data?.annual_entitlement_days ?? 0);
        const toilBalance = Number(allowanceRow.data?.toil_balance_days ?? 0);

        return {
          profileLeaveYearKey,
          leaveYearStartMonth: sm,
          leaveYearStartDay: sd,
          allowanceAnnualEntitlementDays: Number.isFinite(annualEntitlement) ? annualEntitlement : 0,
          allowanceToilBalanceDays: Number.isFinite(toilBalance) ? toilBalance : 0,
          annualUsedDays,
          annualApprovedRequests: (annualApprovedRes.data ?? []) as Array<{ start_date: string; end_date: string }>,
          departmentNames,
          directReports,
          directReportRows: (directReportsRes.data ?? []) as Array<{
            id: string;
            full_name: string;
            preferred_name: string | null;
            email: string | null;
          }>,
          onboardingActive: (onboardingCountRes.count ?? 0) > 0,
          probationItems,
          partialSections: [...timeoutFallbackLabels],
        };
      },
    });
  }
);
