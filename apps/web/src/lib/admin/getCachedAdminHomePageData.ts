import { cache } from 'react';

import type { PermissionKey } from '@campsite/types';

import { loadAdminOverview, type AdminOverviewModel } from '@/lib/admin/loadAdminOverview';
import { loadPendingApprovalsPreview, type PendingPreviewRow } from '@/lib/dashboard/loadDashboardHome';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type AdminHomePageData = {
  data: AdminOverviewModel;
  pendingPreview: PendingPreviewRow[];
};

const ADMIN_HOME_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_ADMIN_HOME_PAGE_RESPONSE_CACHE_TTL_MS ?? '15000',
  10
);
const adminHomePageResponseCache = new Map<string, TtlCacheEntry<AdminHomePageData>>();
const adminHomePageInFlight = new Map<string, Promise<AdminHomePageData>>();
registerSharedCacheStore('campsite:admin:home', adminHomePageResponseCache, adminHomePageInFlight);

function getAdminHomePageCacheKey(orgId: string, userId: string, role: string): string {
  return `org:${orgId}:user:${userId}:role:${role}`;
}

export const getCachedAdminHomePageData = cache(
  async ({
    orgId,
    userId,
    role,
    fullName,
    permissionKeys,
  }: {
    orgId: string;
    userId: string;
    role: string;
    fullName: string | null;
    permissionKeys: string[];
  }): Promise<AdminHomePageData> => {
    return getOrLoadSharedCachedValue({
      cache: adminHomePageResponseCache,
      inFlight: adminHomePageInFlight,
      key: getAdminHomePageCacheKey(orgId, userId, role),
      cacheNamespace: 'campsite:admin:home',
      ttlMs: ADMIN_HOME_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const data = await loadAdminOverview(supabase, orgId, {
          role,
          full_name: fullName,
          permissions: permissionKeys as PermissionKey[],
        });
        const showQuickApprove = permissionKeys.includes('members.edit_status');
        const pendingPreview = showQuickApprove && data.pendingCount > 0
          ? (await loadPendingApprovalsPreview(supabase, userId, orgId, role)).slice(0, 8)
          : [];
        return { data, pendingPreview };
      },
    });
  }
);
