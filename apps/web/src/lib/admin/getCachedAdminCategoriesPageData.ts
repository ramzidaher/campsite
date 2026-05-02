import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type AdminCategoriesPageData = {
  departments: Array<{ id: string; name: string; type: string }>;
  categoriesByDept: Record<string, { id: string; name: string }[]>;
};

const ADMIN_CATEGORIES_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_CATEGORIES_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const adminCategoriesPageResponseCache = new Map<string, TtlCacheEntry<AdminCategoriesPageData>>();
const adminCategoriesPageInFlight = new Map<string, Promise<AdminCategoriesPageData>>();
registerSharedCacheStore(
  'campsite:admin:categories',
  adminCategoriesPageResponseCache,
  adminCategoriesPageInFlight
);

function getAdminCategoriesPageCacheKey(orgId: string): string {
  return `org:${orgId}`;
}

export const getCachedAdminCategoriesPageData = cache(
  async (orgId: string): Promise<AdminCategoriesPageData> => {
    return getOrLoadSharedCachedValue({
      cache: adminCategoriesPageResponseCache,
      inFlight: adminCategoriesPageInFlight,
      key: getAdminCategoriesPageCacheKey(orgId),
      cacheNamespace: 'campsite:admin:categories',
      ttlMs: ADMIN_CATEGORIES_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: departments } = await supabase
          .from('departments')
          .select('id, name, type')
          .eq('org_id', orgId)
          .eq('is_archived', false)
          .order('name');

        const deptIds = (departments ?? []).map((department) => String(department.id ?? '')).filter(Boolean);
        const categoriesByDept: Record<string, { id: string; name: string }[]> = {};
        if (deptIds.length > 0) {
          const { data: categories } = await supabase
            .from('broadcast_channels')
            .select('id, name, dept_id')
            .in('dept_id', deptIds);
          for (const category of categories ?? []) {
            const deptId = String((category as { dept_id?: unknown }).dept_id ?? '');
            if (!deptId) continue;
            if (!categoriesByDept[deptId]) categoriesByDept[deptId] = [];
            categoriesByDept[deptId].push({
              id: String((category as { id?: unknown }).id ?? ''),
              name: String((category as { name?: unknown }).name ?? ''),
            });
          }
        }
        return {
          departments: (departments ?? []) as Array<{ id: string; name: string; type: string }>,
          categoriesByDept,
        };
      },
    });
  }
);
