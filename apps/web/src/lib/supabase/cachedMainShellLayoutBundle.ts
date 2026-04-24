import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  resolveBadgeWithGuardrails,
  resolveStructuralWithTimeout,
} from '@/lib/shell/shellRpcGuardrails';
import { createClient } from './server';

const SHELL_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_SHELL_RESPONSE_CACHE_TTL_MS ?? '3000',
  10
);

type ShellBundle = Record<string, unknown>;
type ShellCacheEntry = {
  value: ShellBundle;
  cachedAt: number;
  expiresAt: number;
};

const shellResponseCache = new Map<string, ShellCacheEntry>();
const shellInFlight = new Map<string, Promise<ShellBundle>>();

function withShellCacheMeta(
  value: ShellBundle,
  status: 'hit' | 'miss' | 'coalesced',
  cachedAt: number
): ShellBundle {
  return {
    ...value,
    shell_response_cache_status: status,
    shell_response_cache_age_ms: Math.max(0, Date.now() - cachedAt),
  };
}

/**
 * Two parallel RPCs (`main_shell_layout_structural` + `main_shell_badge_counts_bundle`)
 * merged to the same shape as legacy `main_shell_layout_bundle`, shared via React `cache()`.
 */
export const getCachedMainShellLayoutBundle = cache(async (): Promise<Record<string, unknown>> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerKey = user?.id ?? 'anonymous';
  return getMainShellLayoutBundleForViewer(supabase, viewerKey);
});

export async function getMainShellLayoutBundleForViewer(
  supabase: Pick<SupabaseClient, 'rpc'>,
  viewerKey: string
): Promise<ShellBundle> {
  const now = Date.now();
  const cached = shellResponseCache.get(viewerKey);
  if (cached && cached.expiresAt > now) {
    return withShellCacheMeta(cached.value, 'hit', cached.cachedAt);
  }

  const inFlight = shellInFlight.get(viewerKey);
  if (inFlight) {
    const value = await inFlight;
    return withShellCacheMeta(value, 'coalesced', Date.now());
  }

  const fetchPromise = (async () => {
  const structuralPromise = resolveStructuralWithTimeout(
    supabase.rpc('main_shell_layout_structural'),
    { data: {}, error: null } as Awaited<ReturnType<typeof supabase.rpc>>
  );
  const badgePromise = resolveBadgeWithGuardrails(
    `shell:badge:${viewerKey}`,
    () => supabase.rpc('main_shell_badge_counts_bundle')
  );
  const [structuralWrapped, badgeWrapped] = await Promise.all([structuralPromise, badgePromise]);
  const structural = structuralWrapped.value;
  const badge = badgeWrapped.value;
  if (structural.error) throw structural.error;
  const s =
    structural.data && typeof structural.data === 'object'
      ? (structural.data as Record<string, unknown>)
      : {};
  const b = badge.data && typeof badge.data === 'object' ? (badge.data as Record<string, unknown>) : {};
  const isDegraded = structuralWrapped.timedOut || Boolean(badge.error) || badgeWrapped.meta.degraded;
  const reasons = [
    ...(structuralWrapped.timedOut ? ['structural_timeout'] : []),
    ...(badge.error ? ['badge_rpc_error'] : []),
    ...badgeWrapped.meta.reasons,
  ];
  const merged = {
    ...s,
    ...b,
    shell_degraded: isDegraded,
    shell_guardrail_reasons: [...new Set(reasons)],
    shell_cache_status: badgeWrapped.meta.cacheStatus,
  };
  shellResponseCache.set(viewerKey, {
    value: merged,
    cachedAt: Date.now(),
    expiresAt: Date.now() + SHELL_RESPONSE_CACHE_TTL_MS,
  });
  return merged;
  })();

  shellInFlight.set(viewerKey, fetchPromise);
  try {
    const value = await fetchPromise;
    return withShellCacheMeta(value, 'miss', Date.now());
  } finally {
    shellInFlight.delete(viewerKey);
  }
}

export function broadcastUnreadFromShellBundle(b: Record<string, unknown>): number {
  const v = b['broadcast_unread'];
  if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, v);
  if (v !== null && v !== undefined) return Math.max(0, Number(v));
  return 0;
}
