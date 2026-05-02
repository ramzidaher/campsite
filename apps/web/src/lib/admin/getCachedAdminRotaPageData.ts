import { cache } from 'react';

import { loadAdminRotaDashboard, type AdminRotaDashboardModel } from '@/lib/admin/loadAdminRota';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

const ADMIN_ROTA_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_ROTA_PAGE_RESPONSE_CACHE_TTL_MS ?? '20000',
  10
);
const adminRotaPageResponseCache = new Map<string, TtlCacheEntry<AdminRotaDashboardModel>>();
const adminRotaPageInFlight = new Map<string, Promise<AdminRotaDashboardModel>>();
registerSharedCacheStore('campsite:admin:rota', adminRotaPageResponseCache, adminRotaPageInFlight);

function getAdminRotaPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedAdminRotaPageData = cache(async (orgId: string): Promise<AdminRotaDashboardModel> => {
  return getOrLoadSharedCachedValue({
    cache: adminRotaPageResponseCache,
    inFlight: adminRotaPageInFlight,
    key: getAdminRotaPageCacheKey(orgId),
    cacheNamespace: 'campsite:admin:rota',
    ttlMs: ADMIN_ROTA_PAGE_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      return loadAdminRotaDashboard(supabase, orgId);
    },
  });
});
