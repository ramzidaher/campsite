import { cache } from 'react';

import { createClient } from './server';

const BADGE_RPC_TIMEOUT_MS = 250;

async function resolveWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Two parallel RPCs (`main_shell_layout_structural` + `main_shell_badge_counts_bundle`)
 * merged to the same shape as legacy `main_shell_layout_bundle`, shared via React `cache()`.
 */
export const getCachedMainShellLayoutBundle = cache(async (): Promise<Record<string, unknown>> => {
  const supabase = await createClient();
  const structuralPromise = supabase.rpc('main_shell_layout_structural');
  const badgePromise = resolveWithTimeout(
    supabase.rpc('main_shell_badge_counts_bundle'),
    BADGE_RPC_TIMEOUT_MS,
    { data: {}, error: null } as Awaited<ReturnType<typeof supabase.rpc>>,
  );
  const [structural, badge] = await Promise.all([structuralPromise, badgePromise]);
  if (structural.error) throw structural.error;
  // Badge payload is non-critical for initial shell render; fallback to empty and let
  // client-side realtime/query sync populate fresh values.
  if (badge.error) {
    const s =
      structural.data && typeof structural.data === 'object'
        ? (structural.data as Record<string, unknown>)
        : {};
    return { ...s };
  }
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
