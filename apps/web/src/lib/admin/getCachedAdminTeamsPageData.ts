import { cache } from 'react';

import { loadDepartmentsDirectory, type DepartmentsDirectoryBundle } from '@/lib/departments/loadDepartmentsDirectory';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

const ADMIN_TEAMS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_TEAMS_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);

const adminTeamsPageResponseCache = new Map<string, TtlCacheEntry<DepartmentsDirectoryBundle>>();
const adminTeamsPageInFlight = new Map<string, Promise<DepartmentsDirectoryBundle>>();
registerSharedCacheStore('campsite:admin:teams', adminTeamsPageResponseCache, adminTeamsPageInFlight);

function getAdminTeamsPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedAdminTeamsPageData = cache(async (orgId: string): Promise<DepartmentsDirectoryBundle> => {
  return getOrLoadSharedCachedValue({
    cache: adminTeamsPageResponseCache,
    inFlight: adminTeamsPageInFlight,
    key: getAdminTeamsPageCacheKey(orgId),
    cacheNamespace: 'campsite:admin:teams',
    ttlMs: ADMIN_TEAMS_PAGE_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      return loadDepartmentsDirectory(supabase, orgId, null);
    },
  });
});
