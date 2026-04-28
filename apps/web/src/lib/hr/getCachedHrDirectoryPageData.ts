import { cache } from 'react';

import { getOrLoadTtlCachedValue, type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { resolveWithTimeout } from '@/lib/perf/resolveWithTimeout';
import { createClient } from '@/lib/supabase/server';

export type HrDirectoryPageData = {
  rows: unknown[];
  dashStats: Record<string, unknown> | null;
};

const HR_DIRECTORY_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_HR_DIRECTORY_RESPONSE_CACHE_TTL_MS ?? '8000',
  10
);
const HR_DASH_STATS_TIMEOUT_MS = 1200;
const hrDirectoryResponseCache = new Map<string, TtlCacheEntry<HrDirectoryPageData>>();
const hrDirectoryInFlight = new Map<string, Promise<HrDirectoryPageData>>();

function getHrDirectoryCacheKey(orgId: string, viewerId: string, canViewAll: boolean, includeDashStats: boolean): string {
  const viewerScope = canViewAll ? `org:${orgId}:all` : `org:${orgId}:viewer:${viewerId}`;
  return `${viewerScope}:dash:${includeDashStats ? '1' : '0'}`;
}

export const getCachedHrDirectoryPageData = cache(
  async (
    orgId: string,
    viewerId: string,
    canViewAll: boolean,
    includeDashStats: boolean
  ): Promise<HrDirectoryPageData> => {
    const cacheKey = getHrDirectoryCacheKey(orgId, viewerId, canViewAll, includeDashStats);
    return getOrLoadTtlCachedValue({
      cache: hrDirectoryResponseCache,
      inFlight: hrDirectoryInFlight,
      key: cacheKey,
      ttlMs: HR_DIRECTORY_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [rows, dashStats] = await Promise.all([
          supabase.rpc('hr_directory_list').then(({ data }) => data ?? []),
          includeDashStats
            ? resolveWithTimeout(
                supabase.rpc('hr_dashboard_stats').then(({ data }) => {
                  const stats = data as Record<string, unknown> | null;
                  return stats ?? null;
                }),
                HR_DASH_STATS_TIMEOUT_MS,
                null
              )
            : Promise.resolve(null),
        ]);
        return {
          rows,
          dashStats,
        };
      },
    });
  }
);
