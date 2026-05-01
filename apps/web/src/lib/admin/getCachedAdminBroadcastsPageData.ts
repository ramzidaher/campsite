import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type AdminBroadcastsPageData = {
  rows: Array<Record<string, unknown>>;
  readCountByBroadcast: Record<string, number>;
  departments: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; dept_id: string }>;
};

const ADMIN_BROADCASTS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_BROADCASTS_PAGE_RESPONSE_CACHE_TTL_MS ?? '20000',
  10
);
const adminBroadcastsPageResponseCache = new Map<string, TtlCacheEntry<AdminBroadcastsPageData>>();
const adminBroadcastsPageInFlight = new Map<string, Promise<AdminBroadcastsPageData>>();
registerSharedCacheStore(
  'campsite:admin:broadcasts',
  adminBroadcastsPageResponseCache,
  adminBroadcastsPageInFlight
);

function getAdminBroadcastsPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedAdminBroadcastsPageData = cache(
  async (orgId: string): Promise<AdminBroadcastsPageData> => {
    return getOrLoadSharedCachedValue({
      cache: adminBroadcastsPageResponseCache,
      inFlight: adminBroadcastsPageInFlight,
      key: getAdminBroadcastsPageCacheKey(orgId),
      cacheNamespace: 'campsite:admin:broadcasts',
      ttlMs: ADMIN_BROADCASTS_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [{ data: rows }, { data: departments }] = await Promise.all([
          supabase
            .from('broadcasts')
            .select(
              `id, title, status, scheduled_at, sent_at, created_at, dept_id, channel_id, is_org_wide, team_id,
       departments(name), broadcast_channels(name), department_teams(name),
       sender:profiles!broadcasts_created_by_fkey(full_name)`
            )
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('departments')
            .select('id, name')
            .eq('org_id', orgId)
            .eq('is_archived', false),
        ]);

        const ids = (rows ?? []).map((row) => String((row as { id?: unknown }).id ?? '')).filter(Boolean);
        const readCountByBroadcast: Record<string, number> = {};
        if (ids.length > 0) {
          const { data: reads } = await supabase
            .from('broadcast_reads')
            .select('broadcast_id')
            .in('broadcast_id', ids);
          for (const read of reads ?? []) {
            const broadcastId = String((read as { broadcast_id?: unknown }).broadcast_id ?? '');
            if (!broadcastId) continue;
            readCountByBroadcast[broadcastId] = (readCountByBroadcast[broadcastId] ?? 0) + 1;
          }
        }

        const departmentIds = (departments ?? []).map((dept) => String(dept.id ?? '')).filter(Boolean);
        const { data: categories } = departmentIds.length
          ? await supabase
              .from('broadcast_channels')
              .select('id, name, dept_id')
              .in('dept_id', departmentIds)
          : { data: [] as Array<{ id: string; name: string; dept_id: string }> };

        return {
          rows: (rows ?? []) as Array<Record<string, unknown>>,
          readCountByBroadcast,
          departments: (departments ?? []) as Array<{ id: string; name: string }>,
          categories: (categories ?? []) as Array<{ id: string; name: string; dept_id: string }>,
        };
      },
    });
  }
);
