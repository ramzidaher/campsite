import { cache } from 'react';

import { createClient } from './server';

/**
 * Two parallel RPCs (`main_shell_layout_structural` + `main_shell_badge_counts_bundle`)
 * merged to the same shape as legacy `main_shell_layout_bundle`, shared via React `cache()`.
 */
export const getCachedMainShellLayoutBundle = cache(async (): Promise<Record<string, unknown>> => {
  const supabase = await createClient();
  const [structural, badge] = await Promise.all([
    supabase.rpc('main_shell_layout_structural'),
    supabase.rpc('main_shell_badge_counts_bundle'),
  ]);
  if (structural.error) throw structural.error;
  if (badge.error) throw badge.error;
  const s =
    structural.data && typeof structural.data === 'object'
      ? (structural.data as Record<string, unknown>)
      : {};
  const b =
    badge.data && typeof badge.data === 'object' ? (badge.data as Record<string, unknown>) : {};
  return { ...s, ...b };
});

export function broadcastUnreadFromShellBundle(b: Record<string, unknown>): number {
  const v = b['broadcast_unread'];
  if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, v);
  if (v !== null && v !== undefined) return Math.max(0, Number(v));
  return 0;
}
