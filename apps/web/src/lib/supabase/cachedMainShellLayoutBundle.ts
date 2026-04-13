import { cache } from 'react';

import { createClient } from './server';

/**
 * One `main_shell_layout_bundle` RPC per request. Layout + data loaders that need
 * the same payload share this via React `cache()` — avoids duplicate round trips
 * (e.g. dashboard previously called `broadcast_unread_count` again).
 */
export const getCachedMainShellLayoutBundle = cache(async (): Promise<Record<string, unknown>> => {
  const supabase = await createClient();
  const { data: bundle } = await supabase.rpc('main_shell_layout_bundle');
  return (bundle && typeof bundle === 'object' ? bundle : {}) as Record<string, unknown>;
});

export function broadcastUnreadFromShellBundle(b: Record<string, unknown>): number {
  const v = b['broadcast_unread'];
  if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, v);
  if (v !== null && v !== undefined) return Math.max(0, Number(v));
  return 0;
}
