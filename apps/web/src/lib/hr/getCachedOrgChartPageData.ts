import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type OrgChartPageData = {
  rows: unknown[];
};

/** PostgREST: function missing / schema cache not refreshed yet. */
function isMissingRpcError(message: string, code?: string): boolean {
  if (code === 'PGRST202' || code === '42883') return true;
  const m = message.toLowerCase();
  return (
    m.includes('schema cache') ||
    m.includes('could not find the function') ||
    m.includes('org_chart_directory_core_list') ||
    m.includes('does not exist')
  );
}

const ORG_CHART_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ORG_CHART_RESPONSE_CACHE_TTL_MS ?? '60000',
  10
);
const orgChartResponseCache = new Map<string, TtlCacheEntry<OrgChartPageData>>();
const orgChartInFlight = new Map<string, Promise<OrgChartPageData>>();
registerSharedCacheStore('campsite:hr:org-chart', orgChartResponseCache, orgChartInFlight);

/** Must stay in sync with `invalidateOrgChartForOrg` in `cacheInvalidation.ts`. */
export function orgChartDirectoryCacheKey(orgId: string): string {
  return `org:${orgId}:v2`;
}

export const getCachedOrgChartPageData = cache(async (orgId: string): Promise<OrgChartPageData> => {
  return getOrLoadSharedCachedValue({
    cache: orgChartResponseCache,
    inFlight: orgChartInFlight,
    key: orgChartDirectoryCacheKey(orgId),
    cacheNamespace: 'campsite:hr:org-chart',
    ttlMs: ORG_CHART_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();

      const core = await supabase.rpc('org_chart_directory_core_list');
      if (!core.error) {
        return { rows: Array.isArray(core.data) ? core.data : [] };
      }

      if (!isMissingRpcError(core.error.message ?? '', (core.error as { code?: string }).code)) {
        throw new Error(core.error.message ?? 'org_chart_directory_core_list failed');
      }

      // Older / not-yet-migrated DBs only have `org_chart_directory_list` (same hierarchy fields + extras).
      const legacy = await supabase.rpc('org_chart_directory_list');
      if (legacy.error) {
        throw new Error(legacy.error.message ?? 'org_chart_directory_list failed');
      }
      return {
        rows: Array.isArray(legacy.data) ? legacy.data : [],
      };
    },
  });
});
