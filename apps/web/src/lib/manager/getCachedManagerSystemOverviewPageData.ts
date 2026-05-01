import { cache } from 'react';
import type { PermissionKey } from '@campsite/types';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { loadDepartmentsDirectory } from '@/lib/departments/loadDepartmentsDirectory';
import { loadWorkspaceDepartmentIds } from '@/lib/manager/workspaceDepartmentIds';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { buildSystemOverviewGraph } from '@/lib/systemOverview/buildSystemOverviewGraph';
import { createClient } from '@/lib/supabase/server';

export type ManagerSystemOverviewPageData = ReturnType<typeof buildSystemOverviewGraph>;

const MANAGER_SYSTEM_OVERVIEW_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_MANAGER_SYSTEM_OVERVIEW_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const managerSystemOverviewPageResponseCache = new Map<string, TtlCacheEntry<ManagerSystemOverviewPageData>>();
const managerSystemOverviewPageInFlight = new Map<string, Promise<ManagerSystemOverviewPageData>>();
registerSharedCacheStore(
  'campsite:manager:system-overview',
  managerSystemOverviewPageResponseCache,
  managerSystemOverviewPageInFlight
);

function getManagerSystemOverviewPageCacheKey(orgId: string, userId: string): string {
  return `org:${orgId}:user:${userId}`;
}

export const getCachedManagerSystemOverviewPageData = cache(
  async (
    orgId: string,
    userId: string,
    role: string | null | undefined,
    permissionKeys: PermissionKey[]
  ): Promise<ManagerSystemOverviewPageData> => {
    return getOrLoadSharedCachedValue({
      cache: managerSystemOverviewPageResponseCache,
      inFlight: managerSystemOverviewPageInFlight,
      key: getManagerSystemOverviewPageCacheKey(orgId, userId),
      cacheNamespace: 'campsite:manager:system-overview',
      ttlMs: MANAGER_SYSTEM_OVERVIEW_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const scopeDeptIds = await withServerPerf(
          '/manager/system-overview',
          'workspace_department_ids',
          loadWorkspaceDepartmentIds(supabase, userId, role),
          350
        );
        const bundle = await withServerPerf(
          '/manager/system-overview',
          'load_departments_directory',
          loadDepartmentsDirectory(supabase, orgId, scopeDeptIds),
          500
        );
        return buildSystemOverviewGraph({
          permissions: permissionKeys,
          bundle,
          isManagerScoped: true,
        });
      },
    });
  }
);
