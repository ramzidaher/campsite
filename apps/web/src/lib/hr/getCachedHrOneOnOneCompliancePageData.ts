import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type HrOneOnOneComplianceRow = {
  report_user_id: string;
  report_name: string;
  manager_user_id: string;
  manager_name: string;
  last_completed_at: string | null;
  next_due_on: string;
  cadence_days: number;
  status: string;
  days_overdue: number;
};

export type HrOneOnOneCompliancePageData = {
  rows: HrOneOnOneComplianceRow[];
  errorMessage: string | null;
};

const HR_ONE_ON_ONE_COMPLIANCE_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_HR_ONE_ON_ONE_COMPLIANCE_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);

const hrOneOnOneCompliancePageResponseCache = new Map<
  string,
  TtlCacheEntry<HrOneOnOneCompliancePageData>
>();
const hrOneOnOneCompliancePageInFlight = new Map<
  string,
  Promise<HrOneOnOneCompliancePageData>
>();

registerSharedCacheStore(
  'campsite:hr:one-on-ones:compliance',
  hrOneOnOneCompliancePageResponseCache,
  hrOneOnOneCompliancePageInFlight
);

function getHrOneOnOneCompliancePageCacheKey(
  orgId: string,
  filter: 'all' | 'overdue' | 'due_soon' | 'ok'
): string {
  return `org:${orgId}:filter:${filter}`;
}

export const getCachedHrOneOnOneCompliancePageData = cache(
  async (
    orgId: string,
    filter: 'all' | 'overdue' | 'due_soon' | 'ok'
  ): Promise<HrOneOnOneCompliancePageData> => {
    return getOrLoadSharedCachedValue({
      cache: hrOneOnOneCompliancePageResponseCache,
      inFlight: hrOneOnOneCompliancePageInFlight,
      key: getHrOneOnOneCompliancePageCacheKey(orgId, filter),
      cacheNamespace: 'campsite:hr:one-on-ones:compliance',
      ttlMs: HR_ONE_ON_ONE_COMPLIANCE_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data, error } = await supabase.rpc('hr_one_on_one_compliance_list', {
          p_filter: filter,
        });

        return {
          rows: (Array.isArray(data) ? data : []) as HrOneOnOneComplianceRow[],
          errorMessage: error?.message ?? null,
        };
      },
    });
  }
);
