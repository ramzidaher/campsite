import { cache } from 'react';
import type { PermissionKey } from '@campsite/types';

import { loadAdminOverview } from '@/lib/admin/loadAdminOverview';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { buildSystemOverviewGraph } from '@/lib/systemOverview/buildSystemOverviewGraph';
import { createClient } from '@/lib/supabase/server';

export type AdminSystemOverviewPageData = ReturnType<typeof buildSystemOverviewGraph>;

const ADMIN_SYSTEM_OVERVIEW_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_SYSTEM_OVERVIEW_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const adminSystemOverviewPageResponseCache = new Map<string, TtlCacheEntry<AdminSystemOverviewPageData>>();
const adminSystemOverviewPageInFlight = new Map<string, Promise<AdminSystemOverviewPageData>>();
registerSharedCacheStore(
  'campsite:admin:system-overview',
  adminSystemOverviewPageResponseCache,
  adminSystemOverviewPageInFlight
);

function getAdminSystemOverviewPageCacheKey(orgId: string, userId: string): string {
  return `org:${orgId}:user:${userId}`;
}

export const getCachedAdminSystemOverviewPageData = cache(
  async (
    orgId: string,
    userId: string,
    role: string | null,
    fullName: string | null,
    permissionKeys: PermissionKey[]
  ): Promise<AdminSystemOverviewPageData> => {
    return getOrLoadSharedCachedValue({
      cache: adminSystemOverviewPageResponseCache,
      inFlight: adminSystemOverviewPageInFlight,
      key: getAdminSystemOverviewPageCacheKey(orgId, userId),
      cacheNamespace: 'campsite:admin:system-overview',
      ttlMs: ADMIN_SYSTEM_OVERVIEW_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [bundle, adminOverview] = await Promise.all([
          withServerPerf(
            '/admin/system-overview',
            'load_departments_directory',
            loadDepartmentsDirectory(supabase, orgId, null),
            500
          ),
          withServerPerf(
            '/admin/system-overview',
            'load_admin_overview',
            loadAdminOverview(supabase, orgId, {
              role: String(role ?? ''),
              full_name: fullName,
              permissions: permissionKeys,
            }),
            500
          ),
        ]);

        return buildSystemOverviewGraph({
          permissions: permissionKeys,
          bundle,
          adminOverview,
          isManagerScoped: false,
        });
      },
    });
  }
);
