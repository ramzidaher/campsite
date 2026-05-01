import { cache } from 'react';

import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { createClient } from '@/lib/supabase/server';

export type ApplicationNotificationsPageData = {
  notifications: Parameters<
    typeof import('@/components/recruitment/ApplicationNotificationsClient').ApplicationNotificationsClient
  >[0]['notifications'];
};

const APPLICATION_NOTIFICATIONS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_APPLICATION_NOTIFICATIONS_PAGE_RESPONSE_CACHE_TTL_MS ?? '15000',
  10
);
const applicationNotificationsPageResponseCache = new Map<string, TtlCacheEntry<ApplicationNotificationsPageData>>();
const applicationNotificationsPageInFlight = new Map<string, Promise<ApplicationNotificationsPageData>>();
registerSharedCacheStore(
  'campsite:recruitment:application-notifications',
  applicationNotificationsPageResponseCache,
  applicationNotificationsPageInFlight
);

function getApplicationNotificationsPageCacheKey(orgId: string, userId: string): string {
  return `org:${orgId}:user:${userId}`;
}

export const getCachedApplicationNotificationsPageData = cache(
  async (orgId: string, userId: string): Promise<ApplicationNotificationsPageData> => {
    return getOrLoadSharedCachedValue({
      cache: applicationNotificationsPageResponseCache,
      inFlight: applicationNotificationsPageInFlight,
      key: getApplicationNotificationsPageCacheKey(orgId, userId),
      cacheNamespace: 'campsite:recruitment:application-notifications',
      ttlMs: APPLICATION_NOTIFICATIONS_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const { data: notifications } = await supabase.rpc('application_notifications_for_me');
        return {
          notifications:
            (notifications ?? []) as Parameters<
              typeof import('@/components/recruitment/ApplicationNotificationsClient').ApplicationNotificationsClient
            >[0]['notifications'],
        };
      },
    });
  }
);
