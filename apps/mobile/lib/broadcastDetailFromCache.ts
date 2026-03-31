import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { MobileBroadcastRow } from '@/lib/broadcastEnrichRows';
import type { MobileHomeData } from '@/lib/mobileHomeData';

type FeedPage = { rows: MobileBroadcastRow[]; hasMore: boolean };

/** Resolve a list row from React Query caches so the detail screen can paint immediately while the network fetch runs. */
export function findBroadcastRowInQueryCache(
  queryClient: QueryClient,
  broadcastId: string,
): MobileBroadcastRow | undefined {
  const feeds = queryClient.getQueriesData<InfiniteData<FeedPage>>({
    queryKey: ['mobile-broadcast-feed'],
  });
  for (const [, d] of feeds) {
    if (!d?.pages) continue;
    for (const p of d.pages) {
      const hit = p.rows.find((r) => r.id === broadcastId);
      if (hit) return hit;
    }
  }

  const searches = queryClient.getQueriesData<MobileBroadcastRow[]>({
    queryKey: ['mobile-broadcast-search'],
  });
  for (const [, rows] of searches) {
    if (!Array.isArray(rows)) continue;
    const hit = rows.find((r) => r.id === broadcastId);
    if (hit) return hit;
  }

  const homes = queryClient.getQueriesData<MobileHomeData>({
    queryKey: ['mobile-home'],
  });
  for (const [, h] of homes) {
    const hit = h?.recentBroadcasts?.find((r) => r.id === broadcastId);
    if (hit) return hit;
  }

  return undefined;
}
