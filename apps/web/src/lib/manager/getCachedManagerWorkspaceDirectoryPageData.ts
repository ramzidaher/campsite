import { cache } from 'react';

import { loadDepartmentsDirectory, type DepartmentsDirectoryBundle } from '@/lib/departments/loadDepartmentsDirectory';
import { loadWorkspaceDepartmentIds } from '@/lib/manager/workspaceDepartmentIds';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

const MANAGER_WORKSPACE_DIRECTORY_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_MANAGER_WORKSPACE_DIRECTORY_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const managerWorkspaceDirectoryResponseCache = new Map<string, TtlCacheEntry<DepartmentsDirectoryBundle>>();
const managerWorkspaceDirectoryInFlight = new Map<string, Promise<DepartmentsDirectoryBundle>>();
registerSharedCacheStore(
  'campsite:manager:workspace-directory',
  managerWorkspaceDirectoryResponseCache,
  managerWorkspaceDirectoryInFlight
);

function getManagerWorkspaceDirectoryCacheKey(orgId: string, userId: string, role: string): string {
  return `org:${orgId}:user:${userId}:role:${role}`;
}

export const getCachedManagerWorkspaceDirectoryPageData = cache(
  async (orgId: string, userId: string, role: string): Promise<DepartmentsDirectoryBundle> => {
    return getOrLoadSharedCachedValue({
      cache: managerWorkspaceDirectoryResponseCache,
      inFlight: managerWorkspaceDirectoryInFlight,
      key: getManagerWorkspaceDirectoryCacheKey(orgId, userId, role),
      cacheNamespace: 'campsite:manager:workspace-directory',
      ttlMs: MANAGER_WORKSPACE_DIRECTORY_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const managedDeptIds = await loadWorkspaceDepartmentIds(supabase, userId, role);
        return loadDepartmentsDirectory(supabase, orgId, managedDeptIds);
      },
    });
  }
);
