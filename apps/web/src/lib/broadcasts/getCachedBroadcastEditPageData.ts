import { cache } from 'react';

import { getOrLoadSharedCachedValue, registerSharedCacheStore } from '@/lib/cache/sharedCache';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import { createClient } from '@/lib/supabase/server';

export type BroadcastEditPageData = {
  id: string;
  title: string;
  body: string;
  status: string;
  coverImageUrl: string | null;
  scheduledAt: string | null;
  mayEdit: boolean;
} | null;

const BROADCAST_EDIT_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_BROADCAST_EDIT_PAGE_RESPONSE_CACHE_TTL_MS ?? '10000',
  10
);

const broadcastEditPageResponseCache = new Map<string, TtlCacheEntry<BroadcastEditPageData>>();
const broadcastEditPageInFlight = new Map<string, Promise<BroadcastEditPageData>>();
registerSharedCacheStore('campsite:broadcasts:edit', broadcastEditPageResponseCache, broadcastEditPageInFlight);

function getBroadcastEditPageCacheKey(orgId: string, viewerUserId: string, broadcastId: string): string {
  return `org:${orgId}:viewer:${viewerUserId}:broadcast:${broadcastId}`;
}

export const getCachedBroadcastEditPageData = cache(
  async (orgId: string, viewerUserId: string, broadcastId: string): Promise<BroadcastEditPageData> => {
    return getOrLoadSharedCachedValue({
      cache: broadcastEditPageResponseCache,
      inFlight: broadcastEditPageInFlight,
      key: getBroadcastEditPageCacheKey(orgId, viewerUserId, broadcastId),
      cacheNamespace: 'campsite:broadcasts:edit',
      ttlMs: BROADCAST_EDIT_PAGE_RESPONSE_CACHE_TTL_MS,
      load: async () => {
        const supabase = await createClient();
        const [{ data: b, error }, mayEditRes] = await Promise.all([
          supabase
            .from('broadcasts')
            .select('id, org_id, title, body, status, cover_image_url, scheduled_at')
            .eq('id', broadcastId)
            .single(),
          supabase.rpc('broadcast_may_edit_content', { p_broadcast_id: broadcastId }),
        ]);
        if (error || !b) return null;
        if (String(b.org_id ?? '') !== orgId) return null;

        return {
          id: String(b.id ?? ''),
          title: String(b.title ?? ''),
          body: String(b.body ?? ''),
          status: String(b.status ?? ''),
          coverImageUrl: (b.cover_image_url as string | null) ?? null,
          scheduledAt: (b.scheduled_at as string | null) ?? null,
          mayEdit: mayEditRes.data === true,
        };
      },
    });
  }
);
