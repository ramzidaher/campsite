import { Image } from 'expo-image';

import type { MobileBroadcastRow } from '@/lib/broadcastEnrichRows';

/** Warm disk/memory cache before opening the detail screen so the backdrop can appear smoothly. */
export function prefetchBroadcastCover(url: string | null | undefined): void {
  const u = typeof url === 'string' ? url.trim() : '';
  if (!u) return;
  void Image.prefetch(u, { cachePolicy: 'memory-disk' });
}

/** Prefetch cover (if any) then push detail  call from list / home carousel for smoother entry. */
export function openBroadcastDetail(
  router: { push: (href: string) => void },
  row: Pick<MobileBroadcastRow, 'id' | 'cover_image_url'>,
): void {
  prefetchBroadcastCover(row.cover_image_url);
  router.push(`/broadcast/${row.id}`);
}
