import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type HrDashboardStats = Record<string, unknown> | null;

const HR_DASHBOARD_STATS_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_HR_DASHBOARD_STATS_RESPONSE_CACHE_TTL_MS ?? '60000',
  10
);
const hrDashboardStatsResponseCache = new Map<string, TtlCacheEntry<HrDashboardStats>>();
const hrDashboardStatsInFlight = new Map<string, Promise<HrDashboardStats>>();
registerSharedCacheStore('campsite:hr:dashboard', hrDashboardStatsResponseCache, hrDashboardStatsInFlight);

function getHrDashboardStatsCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedHrDashboardStats = cache(async (orgId: string): Promise<HrDashboardStats> => {
  return getOrLoadSharedCachedValue({
    cache: hrDashboardStatsResponseCache,
    inFlight: hrDashboardStatsInFlight,
    key: getHrDashboardStatsCacheKey(orgId),
    cacheNamespace: 'campsite:hr:dashboard',
    ttlMs: HR_DASHBOARD_STATS_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const { data } = await supabase.rpc('hr_dashboard_stats');
      return (data as Record<string, unknown> | null) ?? null;
    },
  });
});
