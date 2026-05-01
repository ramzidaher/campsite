import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type AbsenceReportingPageData = {
  reportData: unknown;
  reportErrorMessage: string | null;
  trendData: unknown;
  highAbsenceData: unknown;
  bradfordWindowDays: number;
};

const ABSENCE_REPORTING_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ABSENCE_REPORTING_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);

const absenceReportingPageResponseCache = new Map<string, TtlCacheEntry<AbsenceReportingPageData>>();
const absenceReportingPageInFlight = new Map<string, Promise<AbsenceReportingPageData>>();
registerSharedCacheStore(
  'campsite:hr:absence-reporting',
  absenceReportingPageResponseCache,
  absenceReportingPageInFlight
);

function getAbsenceReportingPageCacheKey(orgId: string, asOf: string): string {
  return `org:${orgId}:asof:${asOf}`;
}

export const getCachedAbsenceReportingPageData = cache(
  async (orgId: string, asOf: string): Promise<AbsenceReportingPageData> => {
    return getOrLoadSharedCachedValue({
      cache: absenceReportingPageResponseCache,
      inFlight: absenceReportingPageInFlight,
      key: getAbsenceReportingPageCacheKey(orgId, asOf),
      cacheNamespace: 'campsite:hr:absence-reporting',
      ttlMs: ABSENCE_REPORTING_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();

        const [{ data: reportData, error }, { data: settings }, { data: trendData }, { data: highAbsenceData }] =
          await Promise.all([
            supabase.rpc('hr_bradford_report', { p_on: asOf }),
            supabase
              .from('org_leave_settings')
              .select('bradford_window_days')
              .eq('org_id', orgId)
              .maybeSingle(),
            supabase.rpc('hr_leave_usage_trends', { p_on: asOf }),
            supabase.rpc('hr_high_absence_triggers', { p_on: asOf }),
          ]);

        return {
          reportData,
          reportErrorMessage: error?.message ?? null,
          trendData,
          highAbsenceData,
          bradfordWindowDays: Number(settings?.bradford_window_days ?? 365) || 365,
        };
      },
    });
  }
);
