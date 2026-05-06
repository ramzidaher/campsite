import type { QueryClient } from '@tanstack/react-query';

import type { FeedRow } from '@/lib/broadcasts/feedTypes';

export type BroadcastNav = {
  index: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
};

/** Same ordering intent as `broadcast_feed_navigation` RPC (pinned first, then newest sent_at). */
function sortFeedOrder(rows: FeedRow[]): FeedRow[] {
  return [...rows].sort((a, b) => {
    const ap = a.is_pinned ? 1 : 0;
    const bp = b.is_pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const at = a.sent_at ? new Date(a.sent_at).getTime() : 0;
    const bt = b.sent_at ? new Date(b.sent_at).getTime() : 0;
    if (bt !== at) return bt - at;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Derive prev/next from whatever rows are already in the broadcast-feed React Query cache
 * (no RPC). Total reflects loaded items only  enough to flip between visible feed posts.
 */
export function broadcastNavigationFromFeedCache(
  queryClient: QueryClient,
  orgId: string,
  userId: string,
  broadcastId: string,
): BroadcastNav | null {
  const matches = queryClient.getQueriesData({
    queryKey: ['broadcast-feed', orgId, userId],
    exact: false,
  });

  const byId = new Map<string, FeedRow>();
  for (const [, data] of matches) {
    if (!data || typeof data !== 'object' || !('pages' in data)) continue;
    const inf = data as { pages: { rows: FeedRow[] }[] };
    for (const p of inf.pages ?? []) {
      for (const r of p.rows ?? []) {
        if (!byId.has(r.id)) byId.set(r.id, r);
      }
    }
  }

  if (!byId.size) return null;
  const sorted = sortFeedOrder([...byId.values()]);
  const idx = sorted.findIndex((r) => r.id === broadcastId);
  if (idx < 0) return null;

  return {
    index: idx + 1,
    total: sorted.length,
    prevId: idx > 0 ? sorted[idx - 1]!.id : null,
    nextId: idx < sorted.length - 1 ? sorted[idx + 1]!.id : null,
  };
}
