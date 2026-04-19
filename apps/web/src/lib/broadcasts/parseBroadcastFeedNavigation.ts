/** Session key: last broadcast detail opened (drives feed prev/next anchor). */
export const BROADCAST_LAST_VIEWED_ID_KEY = 'campsite.broadcasts.lastDetailId';

/** Normalizes `broadcast_feed_navigation` RPC payloads (jsonb / string / loose typing). */
export function parseBroadcastFeedNavigation(raw: unknown): {
  index: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
} | null {
  if (raw == null) return null;
  let o: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === 'object' && raw !== null) {
    o = raw as Record<string, unknown>;
  } else {
    return null;
  }

  const num = (v: unknown): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  };

  const idx = num(o.index);
  const tot = num(o.total);
  if (!Number.isFinite(idx) || !Number.isFinite(tot) || tot < 1) return null;

  const prevRaw = o.prev_id ?? o.prevId;
  const nextRaw = o.next_id ?? o.nextId;
  const uuidStr = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === 'string' && v.length > 0) return v;
    return null;
  };

  return {
    index: Math.floor(idx),
    total: Math.floor(tot),
    prevId: uuidStr(prevRaw),
    nextId: uuidStr(nextRaw),
  };
}
