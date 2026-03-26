import type { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'campsite_offline_broadcast_reads_v1';

type QueuedRead = { broadcastId: string; userId: string; ts: number };

function parseQueue(): QueuedRead[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as QueuedRead[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedRead[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode */
  }
}

/** Queue a broadcast read when offline or when the upsert fails (e.g. flaky network). */
export function enqueueBroadcastRead(broadcastId: string, userId: string) {
  const q = parseQueue();
  q.push({ broadcastId, userId, ts: Date.now() });
  saveQueue(q);
}

/** Flush queued reads to Supabase; drops entries on success. */
export async function flushBroadcastReadQueue(supabase: SupabaseClient): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const q = parseQueue();
  if (!q.length) return 0;
  let done = 0;
  const remaining: QueuedRead[] = [];
  for (const item of q) {
    const { error } = await supabase.from('broadcast_reads').upsert(
      { broadcast_id: item.broadcastId, user_id: item.userId },
      { onConflict: 'broadcast_id,user_id' }
    );
    if (error) remaining.push(item);
    else done += 1;
  }
  saveQueue(remaining);
  return done;
}

export function queuedBroadcastReadCount(): number {
  return parseQueue().length;
}
