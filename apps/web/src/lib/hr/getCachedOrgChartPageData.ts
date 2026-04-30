import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type OrgChartPageData = {
  rows: unknown[];
};

const ORG_CHART_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ORG_CHART_RESPONSE_CACHE_TTL_MS ?? '60000',
  10
);
const orgChartResponseCache = new Map<string, TtlCacheEntry<OrgChartPageData>>();
const orgChartInFlight = new Map<string, Promise<OrgChartPageData>>();
registerSharedCacheStore('campsite:hr:org-chart', orgChartResponseCache, orgChartInFlight);

function getOrgChartCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedOrgChartPageData = cache(async (orgId: string): Promise<OrgChartPageData> => {
  return getOrLoadSharedCachedValue({
    cache: orgChartResponseCache,
    inFlight: orgChartInFlight,
    key: getOrgChartCacheKey(orgId),
    cacheNamespace: 'campsite:hr:org-chart',
    ttlMs: ORG_CHART_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const { data } = await supabase.rpc('org_chart_directory_core_list');
      return {
        rows: data ?? [],
      };
    },
  });
});
